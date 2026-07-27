const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(60000);

// Mock Cloudinary upload — no real network/credentials in test env.
// We only need to verify OUR code (auth, ownership checks, DB writes)
// behaves correctly; Cloudinary's own upload reliability isn't our
// code's responsibility to test.
jest.mock('../src/services/cloudinaryService', () => ({
  uploadBufferToCloudinary: jest.fn().mockResolvedValue({
    secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/finai/kyc-documents/fake.jpg',
    public_id: 'finai/kyc-documents/fake'
  })
}));

let mongod, app, User, LoanProduct, LoanApplication;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_ACCESS_SECRET = 'test_access_secret';
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.CLOUDINARY_CLOUD_NAME = 'test';
  process.env.CLOUDINARY_API_KEY = 'test';
  process.env.CLOUDINARY_API_SECRET = 'test';

  await mongoose.connect(process.env.MONGO_URI);
  app = require('../src/app');
  User = require('../src/models/User');
  LoanProduct = require('../src/models/LoanProduct');
  LoanApplication = require('../src/models/LoanApplication');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) await collections[key].deleteMany({});
  jest.clearAllMocks();
});

const createAndLogin = async ({ role = 'customer', email, phone, password = 'password123' }) => {
  await User.create({ name: 'Test User', email, phone, password, role });
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.data.accessToken;
};

const completeProfile = (token) =>
  request(app)
    .put('/api/users/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ dob: '1995-05-15', employmentType: 'salaried', monthlySalary: 58000, employerName: 'ABC Pvt Ltd' });

const setupApplication = async (email, phone) => {
  const token = await createAndLogin({ email, phone });
  await completeProfile(token);
  const product = await LoanProduct.create({
    name: 'Personal Loan',
    interestRate: 10,
    minAmount: 10000,
    maxAmount: 500000,
    tenureOptions: [12]
  });
  const appRes = await request(app)
    .post('/api/loan-applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ loanProduct: product._id.toString(), requestedAmount: 50000, tenure: 12 });
  return { token, applicationId: appRes.body.data.application._id };
};

describe('POST /api/loan-applications/:applicationId/documents', () => {
  it('allows the owning customer to upload a document', async () => {
    const { token, applicationId } = await setupApplication('doc1@x.com', '9111111111');

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .field('docType', 'pan')
      .attach('file', Buffer.from('fake-pdf-content'), 'pan.pdf');

    expect(res.status).toBe(201);
    expect(res.body.data.document.docType).toBe('pan');
    expect(res.body.data.document.cloudinaryUrl).toMatch(/cloudinary/);
  });

  it('rejects upload with no file attached', async () => {
    const { token, applicationId } = await setupApplication('doc2@x.com', '9222222222');

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .field('docType', 'pan');

    expect(res.status).toBe(400);
  });

  it('rejects an invalid docType', async () => {
    const { token, applicationId } = await setupApplication('doc3@x.com', '9333333333');

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .field('docType', 'passport')
      .attach('file', Buffer.from('fake'), 'x.pdf');

    expect(res.status).toBe(400);
  });

  it('rejects uploading to an application that belongs to someone else', async () => {
    const { applicationId } = await setupApplication('owner@x.com', '9444444444');
    const otherToken = await createAndLogin({ email: 'other@x.com', phone: '9555555555' });

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${otherToken}`)
      .field('docType', 'pan')
      .attach('file', Buffer.from('fake'), 'x.pdf');

    expect(res.status).toBe(403);
  });

  it('rejects a non-customer (e.g. officer) trying to upload', async () => {
    const { applicationId } = await setupApplication('owner2@x.com', '9666666666');
    const officerToken = await createAndLogin({
      role: 'loanOfficer',
      email: 'off@x.com',
      phone: '9777777777'
    });

    const res = await request(app)
      .post(`/api/loan-applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${officerToken}`)
      .field('docType', 'pan')
      .attach('file', Buffer.from('fake'), 'x.pdf');

    expect(res.status).toBe(403);
  });
});

describe('GET /api/loan-applications/:applicationId/documents', () => {
  it('lets the owner view their own documents', async () => {
    const { token, applicationId } = await setupApplication('doc4@x.com', '9888888888');
    await request(app)
      .post(`/api/loan-applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .field('docType', 'aadhaar')
      .attach('file', Buffer.from('fake'), 'x.pdf');

    const res = await request(app)
      .get(`/api/loan-applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(1);
  });

  it('lets the assigned officer view documents', async () => {
    const { token, applicationId } = await setupApplication('doc5@x.com', '9099999999');
    await request(app)
      .post(`/api/loan-applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .field('docType', 'aadhaar')
      .attach('file', Buffer.from('fake'), 'x.pdf');

    const officerToken = await createAndLogin({
      role: 'loanOfficer',
      email: 'off2@x.com',
      phone: '9010101010'
    });
    await request(app)
      .patch(`/api/loan-applications/${applicationId}/assign`)
      .set('Authorization', `Bearer ${officerToken}`);

    const res = await request(app)
      .get(`/api/loan-applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(1);
  });

  it('rejects an unrelated customer viewing someone else’s documents', async () => {
    const { applicationId } = await setupApplication('doc6@x.com', '9020202020');
    const otherToken = await createAndLogin({ email: 'other2@x.com', phone: '9030303030' });

    const res = await request(app)
      .get(`/api/loan-applications/${applicationId}/documents`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);
  });
});