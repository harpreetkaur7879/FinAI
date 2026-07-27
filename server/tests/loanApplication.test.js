const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

// Decisions use a Mongo transaction (loanDecisionService), which requires
// a replica set — a single standalone in-memory server doesn't support
// transactions. This is the one test file that needs the heavier replset.
jest.setTimeout(90000);

let mongod, app, User, LoanProduct, LoanApplication, LoanDecision, Notification, AuditLog, LoanDocument;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongod.waitUntilRunning();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_ACCESS_SECRET = 'test_access_secret';
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
  process.env.CLIENT_URL = 'http://localhost:5173';

  await mongoose.connect(process.env.MONGO_URI);
  app = require('../src/app');
  User = require('../src/models/User');
  LoanProduct = require('../src/models/LoanProduct');
  LoanApplication = require('../src/models/LoanApplication');
  LoanDecision = require('../src/models/LoanDecision');
  Notification = require('../src/models/Notification');
  AuditLog = require('../src/models/AuditLog');
  LoanDocument = require('../src/models/LoanDocument');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) await collections[key].deleteMany({});
});

const createAndLogin = async ({ role = 'customer', email, phone, password = 'password123' }) => {
  const user = await User.create({ name: 'Test User', email, phone, password, role });
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return { token: res.body.data.accessToken, user };
};

const completeProfile = (token) =>
  request(app)
    .put('/api/users/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ dob: '1995-05-15', employmentType: 'salaried', monthlySalary: 58000, employerName: 'ABC Pvt Ltd' });

const createProduct = async () => {
  return LoanProduct.create({
    name: 'Personal Loan',
    interestRate: 10,
    minAmount: 10000,
    maxAmount: 500000,
    tenureOptions: [12, 24, 36]
  });
};

describe('POST /api/loan-applications', () => {
  it('rejects application if customer profile is incomplete', async () => {
    const { token } = await createAndLogin({ email: 'c1@x.com', phone: '9111111111' });
    const product = await createProduct();

    const res = await request(app)
      .post('/api/loan-applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ loanProduct: product._id.toString(), requestedAmount: 50000, tenure: 12 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/complete your profile/i);
  });

  it('allows a customer with a complete profile to apply', async () => {
    const { token } = await createAndLogin({ email: 'c2@x.com', phone: '9222222222' });
    await completeProfile(token);
    const product = await createProduct();

    const res = await request(app)
      .post('/api/loan-applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ loanProduct: product._id.toString(), requestedAmount: 50000, tenure: 12 });

    expect(res.status).toBe(201);
    expect(res.body.data.application.status).toBe('submitted');
  });

  it('rejects an amount outside the product min/max range', async () => {
    const { token } = await createAndLogin({ email: 'c3@x.com', phone: '9333333333' });
    await completeProfile(token);
    const product = await createProduct();

    const res = await request(app)
      .post('/api/loan-applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ loanProduct: product._id.toString(), requestedAmount: 999999, tenure: 12 });

    expect(res.status).toBe(400);
  });

  it('rejects a tenure not offered by the product', async () => {
    const { token } = await createAndLogin({ email: 'c4@x.com', phone: '9444444444' });
    await completeProfile(token);
    const product = await createProduct();

    const res = await request(app)
      .post('/api/loan-applications')
      .set('Authorization', `Bearer ${token}`)
      .send({ loanProduct: product._id.toString(), requestedAmount: 50000, tenure: 48 });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/loan-applications/:id/assign', () => {
  it('lets an officer claim an unassigned application', async () => {
    const { token: custToken } = await createAndLogin({ email: 'c5@x.com', phone: '9555555555' });
    await completeProfile(custToken);
    const product = await createProduct();
    const appRes = await request(app)
      .post('/api/loan-applications')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ loanProduct: product._id.toString(), requestedAmount: 50000, tenure: 12 });
    const applicationId = appRes.body.data.application._id;

    const { token: officerToken } = await createAndLogin({
      role: 'loanOfficer',
      email: 'off1@x.com',
      phone: '9666666666'
    });

    const res = await request(app)
      .patch(`/api/loan-applications/${applicationId}/assign`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.application.status).toBe('under_review');
  });

  it('rejects claiming an already-assigned application', async () => {
    const { token: custToken } = await createAndLogin({ email: 'c6@x.com', phone: '9777777777' });
    await completeProfile(custToken);
    const product = await createProduct();
    const appRes = await request(app)
      .post('/api/loan-applications')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ loanProduct: product._id.toString(), requestedAmount: 50000, tenure: 12 });
    const applicationId = appRes.body.data.application._id;

    const { token: officer1 } = await createAndLogin({
      role: 'loanOfficer',
      email: 'off2@x.com',
      phone: '9888888888'
    });
    const { token: officer2 } = await createAndLogin({
      role: 'loanOfficer',
      email: 'off3@x.com',
      phone: '9099999999'
    });

    await request(app)
      .patch(`/api/loan-applications/${applicationId}/assign`)
      .set('Authorization', `Bearer ${officer1}`);

    const res = await request(app)
      .patch(`/api/loan-applications/${applicationId}/assign`)
      .set('Authorization', `Bearer ${officer2}`);

    expect(res.status).toBe(409);
  });
});

describe('POST /api/loan-applications/:id/decision', () => {
  const setupAssignedApplication = async (custEmail, custPhone, offEmail, offPhone) => {
    const { token: custToken } = await createAndLogin({ email: custEmail, phone: custPhone });
    await completeProfile(custToken);
    const product = await createProduct();
    const appRes = await request(app)
      .post('/api/loan-applications')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ loanProduct: product._id.toString(), requestedAmount: 100000, tenure: 12 });
    const applicationId = appRes.body.data.application._id;

    const { token: officerToken, user: officer } = await createAndLogin({
      role: 'loanOfficer',
      email: offEmail,
      phone: offPhone
    });
    await request(app)
      .patch(`/api/loan-applications/${applicationId}/assign`)
      .set('Authorization', `Bearer ${officerToken}`);

    await LoanDocument.create([
      {
        loanApplication: applicationId,
        customer: appRes.body.data.application.customer,
        docType: 'aadhaar',
        cloudinaryUrl: 'https://example.com/aadhaar.pdf',
        cloudinaryPublicId: `aadhaar-${applicationId}`
      },
      {
        loanApplication: applicationId,
        customer: appRes.body.data.application.customer,
        docType: 'salary_slip',
        cloudinaryUrl: 'https://example.com/salary.pdf',
        cloudinaryPublicId: `salary-${applicationId}`
      }
    ]);

    return { applicationId, officerToken, custToken, officer, product };
  };

  it('approves an application and updates all 4 collections', async () => {
    const { applicationId, officerToken } = await setupAssignedApplication(
      'c7@x.com',
      '9010101010',
      'off4@x.com',
      '9020202020'
    );

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/decision`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'approved', officerRemarks: 'Stable income, low risk', approvedAmount: 100000 });

    expect(res.status).toBe(200);
    expect(res.body.data.application.status).toBe('approved');
    expect(res.body.data.application.emiAmount).toBeGreaterThan(0);

    const decisions = await LoanDecision.find({ loanApplication: applicationId });
    expect(decisions.length).toBe(1);
    expect(decisions[0].decision).toBe('approved');

    const app_ = await LoanApplication.findById(applicationId);
    expect(app_.status).toBe('approved');
    expect(app_.approvedAmount).toBe(100000);

    const notifications = await Notification.find({ user: app_.customer });
    expect(notifications.length).toBe(1);
    expect(notifications[0].type).toBe('decision');

    const logs = await AuditLog.find({ targetId: app_._id, action: 'LOAN_APPROVED' });
    expect(logs.length).toBe(1);
  });

  it('rejects an application and does not set approvedAmount', async () => {
    const { applicationId, officerToken } = await setupAssignedApplication(
      'c8@x.com',
      '9030303030',
      'off5@x.com',
      '9040404040'
    );

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/decision`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'rejected', officerRemarks: 'Debt-to-income ratio too high' });

    expect(res.status).toBe(200);
    expect(res.body.data.application.status).toBe('rejected');
    expect(res.body.data.application.approvedAmount).toBeUndefined();
  });

  it('rejects a decision from an officer who is not assigned to the application', async () => {
    const { applicationId } = await setupAssignedApplication(
      'c9@x.com',
      '9050505050',
      'off6@x.com',
      '9060606060'
    );

    const { token: otherOfficerToken } = await createAndLogin({
      role: 'loanOfficer',
      email: 'off7@x.com',
      phone: '9070707070'
    });

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/decision`)
      .set('Authorization', `Bearer ${otherOfficerToken}`)
      .send({ decision: 'approved', officerRemarks: 'Looks fine', approvedAmount: 100000 });

    expect(res.status).toBe(403);
  });

  it('rejects deciding an application twice', async () => {
    const { applicationId, officerToken } = await setupAssignedApplication(
      'c10@x.com',
      '9080808080',
      'off8@x.com',
      '9091919191'
    );

    await request(app)
      .post(`/api/loan-applications/${applicationId}/decision`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'approved', officerRemarks: 'Looks fine', approvedAmount: 100000 });

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/decision`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'approved', officerRemarks: 'Again', approvedAmount: 100000 });

    expect(res.status).toBe(400);
  });

  it('GET /:id/decisions returns full decision history', async () => {
    const { applicationId, officerToken, custToken } = await setupAssignedApplication(
      'c11@x.com',
      '9121212121',
      'off9@x.com',
      '9131313131'
    );

    await request(app)
      .post(`/api/loan-applications/${applicationId}/decision`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'approved', officerRemarks: 'Looks fine', approvedAmount: 100000 });

    const res = await request(app)
      .get(`/api/loan-applications/${applicationId}/decisions`)
      .set('Authorization', `Bearer ${custToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.decisions.length).toBe(1);
  });
});