const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
jest.setTimeout(60000);
let mongod;
let app;

// Env vars must be set BEFORE app.js is required, since some modules
// read process.env at import time.
beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_ACCESS_SECRET = 'test_access_secret';
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
  process.env.JWT_ACCESS_EXPIRY = '15m';
  process.env.JWT_REFRESH_EXPIRY = '7d';
  process.env.CLIENT_URL = 'http://localhost:5173';

  await mongoose.connect(process.env.MONGO_URI);
  app = require('../src/app');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  // Keep tests isolated from each other
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

const validUser = {
  name: 'Harpreet Kaur',
  email: 'harpreet@example.com',
  phone: '9876543210',
  password: 'password123'
};

describe('POST /api/auth/register', () => {
  it('registers a new customer and returns an access token', async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.user.role).toBe('customer');
    expect(res.headers['set-cookie'][0]).toMatch(/refreshToken=/);
  });

  it('rejects duplicate email/phone', async () => {
    await request(app).post('/api/auth/register').send(validUser);
    const res = await request(app).post('/api/auth/register').send(validUser);
    expect(res.status).toBe(409);
  });

  it('rejects a weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'weak@example.com', phone: '9876543211', password: '123' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid phone number', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser, email: 'p@example.com', phone: '12345' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validUser);
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validUser.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('rejects unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nope@example.com', password: 'password123' });
    expect(res.status).toBe(401);
  });
});

describe('Protected routes', () => {
  let accessToken;
  let cookie;

  beforeEach(async () => {
    const res = await request(app).post('/api/auth/register').send(validUser);
    accessToken = res.body.data.accessToken;
    cookie = res.headers['set-cookie'];
  });

  it('GET /api/auth/me works with a valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(validUser.email);
  });

  it('GET /api/auth/me fails with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me fails with a garbage token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer garbage.token.value');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/refresh issues a valid new access token', async () => {
  const res = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
  expect(res.status).toBe(200);
  expect(res.body.data.accessToken).toBeDefined();

  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${res.body.data.accessToken}`);
  expect(meRes.status).toBe(200);
});

  it('POST /api/auth/refresh fails without a cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/logout clears the session', async () => {
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookie);
    expect(logoutRes.status).toBe(200);

    // The old refresh token should no longer work after logout
    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(refreshRes.status).toBe(401);
  });
});
