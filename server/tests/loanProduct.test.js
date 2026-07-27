const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(60000);

let mongod, app, User;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_ACCESS_SECRET = 'test_access_secret';
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
  process.env.CLIENT_URL = 'http://localhost:5173';

  await mongoose.connect(process.env.MONGO_URI);
  app = require('../src/app');
  User = require('../src/models/User');
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
  await User.create({ name: 'Test User', email, phone, password, role });
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.data.accessToken;
};

const validProduct = {
  name: 'Personal Loan',
  description: 'Unsecured personal loan',
  interestRate: 10,
  minAmount: 10000,
  maxAmount: 500000,
  tenureOptions: [12, 24, 36]
};

describe('POST /api/loan-products', () => {
  it('allows admin to create a loan product', async () => {
    const token = await createAndLogin({ role: 'admin', email: 'admin@x.com', phone: '9111111111' });
    const res = await request(app)
      .post('/api/loan-products')
      .set('Authorization', `Bearer ${token}`)
      .send(validProduct);

    expect(res.status).toBe(201);
    expect(res.body.data.product.name).toBe('Personal Loan');
    expect(res.body.data.product.isActive).toBe(true);
  });

  it('rejects a non-admin', async () => {
    const token = await createAndLogin({ role: 'customer', email: 'c@x.com', phone: '9222222222' });
    const res = await request(app)
      .post('/api/loan-products')
      .set('Authorization', `Bearer ${token}`)
      .send(validProduct);
    expect(res.status).toBe(403);
  });

  it('rejects maxAmount less than minAmount', async () => {
    const token = await createAndLogin({ role: 'admin', email: 'admin2@x.com', phone: '9333333333' });
    const res = await request(app)
      .post('/api/loan-products')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validProduct, minAmount: 500000, maxAmount: 10000 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/loan-products', () => {
  it('is publicly accessible without a token', async () => {
    const res = await request(app).get('/api/loan-products');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.products)).toBe(true);
  });

  it('hides inactive products by default', async () => {
    const token = await createAndLogin({ role: 'admin', email: 'admin3@x.com', phone: '9444444444' });
    const createRes = await request(app)
      .post('/api/loan-products')
      .set('Authorization', `Bearer ${token}`)
      .send(validProduct);
    const productId = createRes.body.data.product._id;

    await request(app)
      .patch(`/api/loan-products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });

    const res = await request(app).get('/api/loan-products');
    expect(res.body.data.products.find((p) => p._id === productId)).toBeUndefined();

    const resAll = await request(app).get('/api/loan-products?includeInactive=true');
    expect(resAll.body.data.products.find((p) => p._id === productId)).toBeDefined();
  });
});

describe('PATCH /api/loan-products/:id', () => {
  it('allows admin to update interestRate only', async () => {
    const token = await createAndLogin({ role: 'admin', email: 'admin4@x.com', phone: '9555555555' });
    const createRes = await request(app)
      .post('/api/loan-products')
      .set('Authorization', `Bearer ${token}`)
      .send(validProduct);
    const productId = createRes.body.data.product._id;

    const res = await request(app)
      .patch(`/api/loan-products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ interestRate: 12.5 });

    expect(res.status).toBe(200);
    expect(res.body.data.product.interestRate).toBe(12.5);
    expect(res.body.data.product.name).toBe('Personal Loan'); // unchanged
  });
});