const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(60000);

let mongod, app, User, LoanProduct, LoanApplication, LoanDocument, Notification;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_ACCESS_SECRET = 'test_access_secret';
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
  process.env.CLIENT_URL = 'http://localhost:5173';

  await mongoose.connect(process.env.MONGO_URI);
  app = require('../src/app');
  User = require('../src/models/User');
  LoanProduct = require('../src/models/LoanProduct');
  LoanApplication = require('../src/models/LoanApplication');
  LoanDocument = require('../src/models/LoanDocument');
  Notification = require('../src/models/Notification');
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

const setupAssignedApplication = async () => {
  const { token: custToken, user: customer } = await createAndLogin({
    email: 'cust@x.com',
    phone: '9111111111'
  });
  await completeProfile(custToken);
  const product = await LoanProduct.create({
    name: 'Personal Loan',
    interestRate: 10,
    minAmount: 10000,
    maxAmount: 500000,
    tenureOptions: [12]
  });
  const appRes = await request(app)
    .post('/api/loan-applications')
    .set('Authorization', `Bearer ${custToken}`)
    .send({ loanProduct: product._id.toString(), requestedAmount: 100000, tenure: 12 });
  const applicationId = appRes.body.data.application._id;

  const { token: officerToken } = await createAndLogin({
    role: 'loanOfficer',
    email: 'officer@x.com',
    phone: '9222222222'
  });
  await request(app)
    .patch(`/api/loan-applications/${applicationId}/assign`)
    .set('Authorization', `Bearer ${officerToken}`);

  return { applicationId, officerToken, custToken, customer };
};

describe('POST /api/loan-applications/:id/request-documents', () => {
  it('sends a notification listing exactly what is missing', async () => {
    const { applicationId, officerToken, customer } = await setupAssignedApplication();

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/request-documents`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.notification.message).toMatch(/identity document/i);
    expect(res.body.data.notification.message).toMatch(/income document/i);

    const notifications = await Notification.find({ user: customer._id });
    expect(notifications.length).toBe(1);
    expect(notifications[0].type).toBe('document_required');
  });

  it('only mentions the category that is actually missing', async () => {
    const { applicationId, officerToken, customer } = await setupAssignedApplication();

    await LoanDocument.create({
      loanApplication: applicationId,
      customer: customer._id,
      docType: 'aadhaar',
      cloudinaryUrl: 'https://example.com/a.pdf',
      cloudinaryPublicId: 'a'
    });

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/request-documents`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.notification.message).not.toMatch(/identity document/i);
    expect(res.body.data.notification.message).toMatch(/income document/i);
  });

  it('rejects the request when documents are already complete', async () => {
    const { applicationId, officerToken, customer } = await setupAssignedApplication();

    await LoanDocument.create([
      {
        loanApplication: applicationId,
        customer: customer._id,
        docType: 'pan',
        cloudinaryUrl: 'https://example.com/a.pdf',
        cloudinaryPublicId: 'a'
      },
      {
        loanApplication: applicationId,
        customer: customer._id,
        docType: 'bank_statement',
        cloudinaryUrl: 'https://example.com/b.pdf',
        cloudinaryPublicId: 'b'
      }
    ]);

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/request-documents`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(400);
  });

  it('rejects a request from an officer who is not assigned', async () => {
    const { applicationId } = await setupAssignedApplication();
    const { token: otherOfficerToken } = await createAndLogin({
      role: 'loanOfficer',
      email: 'other@x.com',
      phone: '9333333333'
    });

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/request-documents`)
      .set('Authorization', `Bearer ${otherOfficerToken}`);

    expect(res.status).toBe(403);
  });

  it('rejects a customer trying to request documents', async () => {
    const { applicationId, custToken } = await setupAssignedApplication();

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/request-documents`)
      .set('Authorization', `Bearer ${custToken}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/notifications', () => {
  it("returns only the logged-in user's own notifications", async () => {
    const { officerToken, customer } = await setupAssignedApplication();
    const { applicationId: appId2 } = await (async () => {
      // second, unrelated customer + notification, to prove isolation
      const { token: otherCustToken } = await createAndLogin({
        email: 'other2@x.com',
        phone: '9444444444'
      });
      await completeProfile(otherCustToken);
      const product = await LoanProduct.create({
        name: 'Loan2',
        interestRate: 10,
        minAmount: 1000,
        maxAmount: 10000,
        tenureOptions: [6]
      });
      const r = await request(app)
        .post('/api/loan-applications')
        .set('Authorization', `Bearer ${otherCustToken}`)
        .send({ loanProduct: product._id.toString(), requestedAmount: 5000, tenure: 6 });
      return { applicationId: r.body.data.application._id };
    })();

    await Notification.create({
      user: customer._id,
      type: 'document_required',
      message: 'Please upload your documents.'
    });
    await Notification.create({
      user: (await User.findOne({ email: 'other2@x.com' }))._id,
      type: 'document_required',
      message: 'Unrelated notification for someone else.'
    });

    const custLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cust@x.com', password: 'password123' });

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${custLogin.body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.notifications.length).toBe(1);
    expect(res.body.data.notifications[0].message).toMatch(/upload your documents/i);
  });
});

describe('PATCH /api/notifications/:id/read', () => {
  it('lets the owner mark their notification as read', async () => {
    const { customer } = await setupAssignedApplication();
    const notification = await Notification.create({
      user: customer._id,
      type: 'document_required',
      message: 'Test'
    });

    const custLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cust@x.com', password: 'password123' });

    const res = await request(app)
      .patch(`/api/notifications/${notification._id}/read`)
      .set('Authorization', `Bearer ${custLogin.body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.notification.isRead).toBe(true);
  });

  it("rejects marking someone else's notification as read", async () => {
    const { customer, officerToken } = await setupAssignedApplication();
    const notification = await Notification.create({
      user: customer._id,
      type: 'document_required',
      message: 'Test'
    });

    const res = await request(app)
      .patch(`/api/notifications/${notification._id}/read`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(403);
  });
});