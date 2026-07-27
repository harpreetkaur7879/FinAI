const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.setTimeout(60000);

let mongod;
let app;
let User;

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
  User = require('../src/models/User');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// Helper: create a user directly in DB (bypassing the API, since admin
// accounts can't be created through the public API by design) and log in
// to get a real access token.
const createAndLogin = async ({ role = 'customer', email, phone, password = 'password123' }) => {
  await User.create({
    name: 'Test User',
    email,
    phone,
    password,
    role
  });

  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.body.data.accessToken;
};

describe('POST /api/users/officers', () => {
  let adminToken;

  beforeEach(async () => {
    adminToken = await createAndLogin({
      role: 'admin',
      email: 'admin@finai.com',
      phone: '9999999999'
    });
  });

  const officerPayload = {
    name: 'Loan Officer One',
    email: 'officer1@finai.com',
    phone: '9876543210',
    password: 'password123',
    branch: 'Delhi',
    designation: 'junior_officer'
  };

  it('allows admin to create an officer with an auto-generated employeeId', async () => {
    const res = await request(app)
      .post('/api/users/officers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(officerPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('loanOfficer');
    expect(res.body.data.user.officerProfile.employeeId).toBe('OFF-0001');
    expect(res.body.data.user.officerProfile.branch).toBe('Delhi');
  });

  it('increments employeeId sequentially for each new officer', async () => {
    await request(app)
      .post('/api/users/officers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(officerPayload);

    const res = await request(app)
      .post('/api/users/officers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...officerPayload, email: 'officer2@finai.com', phone: '9876543211' });

    expect(res.body.data.user.officerProfile.employeeId).toBe('OFF-0002');
  });

  it('rejects a non-admin trying to create an officer', async () => {
    const customerToken = await createAndLogin({
      role: 'customer',
      email: 'cust@finai.com',
      phone: '9111111111'
    });

    const res = await request(app)
      .post('/api/users/officers')
      .set('Authorization', `Bearer ${customerToken}`)
      .send(officerPayload);

    expect(res.status).toBe(403);
  });

  it('rejects invalid designation', async () => {
    const res = await request(app)
      .post('/api/users/officers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...officerPayload, designation: 'ceo' });

    expect(res.status).toBe(400);
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/users/officers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(officerPayload);

    const res = await request(app)
      .post('/api/users/officers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(officerPayload);

    expect(res.status).toBe(409);
  });
});

describe('PUT /api/users/profile', () => {
  it('allows a customer to complete their profile', async () => {
    const token = await createAndLogin({
      role: 'customer',
      email: 'cust2@finai.com',
      phone: '9222222222'
    });

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        dob: '1995-05-15',
        employmentType: 'salaried',
        monthlySalary: 58000,
        employerName: 'ABC Pvt Ltd'
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user.customerProfile.profileCompleted).toBe(true);
    expect(res.body.data.user.customerProfile.monthlySalary).toBe(58000);
  });

  it('requires employerName when employmentType is salaried', async () => {
    const token = await createAndLogin({
      role: 'customer',
      email: 'cust3@finai.com',
      phone: '9333333333'
    });

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ dob: '1995-05-15', employmentType: 'salaried', monthlySalary: 58000 });

    expect(res.status).toBe(400);
  });

  it('rejects an officer trying to complete a customer profile', async () => {
    const token = await createAndLogin({
      role: 'loanOfficer',
      email: 'off@finai.com',
      phone: '9444444444'
    });

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        dob: '1995-05-15',
        employmentType: 'salaried',
        monthlySalary: 58000,
        employerName: 'ABC Pvt Ltd'
      });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/users', () => {
  it('allows admin to list users with pagination', async () => {
    const adminToken = await createAndLogin({
      role: 'admin',
      email: 'admin2@finai.com',
      phone: '9555555555'
    });
    await createAndLogin({ role: 'customer', email: 'c1@finai.com', phone: '9666666666' });
    await createAndLogin({ role: 'customer', email: 'c2@finai.com', phone: '9777777777' });

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBe(3); // admin + 2 customers
    expect(res.body.data.pagination.total).toBe(3);
  });

  it('filters by role', async () => {
    const adminToken = await createAndLogin({
      role: 'admin',
      email: 'admin3@finai.com',
      phone: '9888888888'
    });
    await createAndLogin({ role: 'customer', email: 'c3@finai.com', phone: '9099999999' });

    const res = await request(app)
      .get('/api/users?role=customer')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBe(1);
    expect(res.body.data.users[0].role).toBe('customer');
  });

  it('rejects a customer trying to list all users', async () => {
    const token = await createAndLogin({
      role: 'customer',
      email: 'c4@finai.com',
      phone: '9010101010'
    });

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/users/:id/status', () => {
  it('allows admin to deactivate a user, and login fails afterward', async () => {
    const adminToken = await createAndLogin({
      role: 'admin',
      email: 'admin4@finai.com',
      phone: '9020202020'
    });
    const targetUser = await User.create({
      name: 'To Deactivate',
      email: 'deactivate@finai.com',
      phone: '9030303030',
      password: 'password123',
      role: 'customer'
    });

    const res = await request(app)
      .patch(`/api/users/${targetUser._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.data.user.isActive).toBe(false);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'deactivate@finai.com', password: 'password123' });
    expect(loginRes.status).toBe(403);
  });

  it('prevents admin from deactivating themselves', async () => {
    const adminToken = await createAndLogin({
      role: 'admin',
      email: 'admin5@finai.com',
      phone: '9040404040'
    });
    const admin = await User.findOne({ email: 'admin5@finai.com' });

    const res = await request(app)
      .patch(`/api/users/${admin._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(400);
  });

  it('rejects a non-admin trying to change user status', async () => {
    const token = await createAndLogin({
      role: 'customer',
      email: 'c5@finai.com',
      phone: '9050505050'
    });
    const target = await User.create({
      name: 'Target',
      email: 'target@finai.com',
      phone: '9060606060',
      password: 'password123',
      role: 'customer'
    });

    const res = await request(app)
      .patch(`/api/users/${target._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
  });
});