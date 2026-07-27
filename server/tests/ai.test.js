const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

jest.setTimeout(60000);

// Mock the Gemini config module entirely — we're testing OUR wiring
// (parsing, field mapping, access control, persistence), not Google's
// model quality or availability. No real API key exists in this test env.
jest.mock('../src/config/gemini', () => ({
  getModel: jest.fn()
}));

const { getModel } = require('../src/config/gemini');

let mongod, app, User, LoanProduct, LoanApplication, LoanDocument, LoanDecision;

beforeAll(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongod.waitUntilRunning();
  process.env.MONGO_URI = mongod.getUri();
  process.env.JWT_ACCESS_SECRET = 'test_access_secret';
  process.env.JWT_REFRESH_SECRET = 'test_refresh_secret';
  process.env.CLIENT_URL = 'http://localhost:5173';
  process.env.GEMINI_API_KEY = 'fake-key-for-tests';

  await mongoose.connect(process.env.MONGO_URI);
  app = require('../src/app');
  User = require('../src/models/User');
  LoanProduct = require('../src/models/LoanProduct');
  LoanApplication = require('../src/models/LoanApplication');
  LoanDocument = require('../src/models/LoanDocument');
  LoanDecision = require('../src/models/LoanDecision');
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

// Helper to make getModel().generateContent(...) return a given text
const mockGeminiResponse = (text) => {
  getModel.mockReturnValue({
    generateContent: jest.fn().mockResolvedValue({
      response: { text: () => text }
    })
  });
};

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
  const { token: custToken } = await createAndLogin({ email: 'cust@x.com', phone: '9111111111' });
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

  return { applicationId, officerToken, custToken };
};

describe('POST /api/ai/applications/:id/risk-explanation', () => {
  it('generates and persists risk explanation for the assigned officer', async () => {
    const { applicationId, officerToken } = await setupAssignedApplication();

    mockGeminiResponse(
      JSON.stringify({
        riskTags: ['Stable Income', 'Low Existing EMI'],
        explanation: 'The applicant has a stable salary and low debt burden relative to income.'
      })
    );

    const res = await request(app)
      .post(`/api/ai/applications/${applicationId}/risk-explanation`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ existingEmiEstimate: 5000 });

    expect(res.status).toBe(200);
    expect(res.body.data.application.aiRiskTags).toEqual(['Stable Income', 'Low Existing EMI']);
    expect(res.body.data.application.aiRiskExplanation).toMatch(/stable salary/i);

    const saved = await LoanApplication.findById(applicationId);
    expect(saved.aiRiskExplanation).toMatch(/stable salary/i);
  });

  it('handles Gemini responses wrapped in markdown code fences', async () => {
    const { applicationId, officerToken } = await setupAssignedApplication();

    mockGeminiResponse('```json\n{"riskTags": ["Tag1"], "explanation": "Fine."}\n```');

    const res = await request(app)
      .post(`/api/ai/applications/${applicationId}/risk-explanation`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.application.aiRiskTags).toEqual(['Tag1']);
  });

  it('returns 502 if Gemini returns unparseable output', async () => {
    const { applicationId, officerToken } = await setupAssignedApplication();

    mockGeminiResponse('this is not json at all');

    const res = await request(app)
      .post(`/api/ai/applications/${applicationId}/risk-explanation`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({});

    expect(res.status).toBe(502);
  });

  it('rejects a customer trying to call an AI endpoint', async () => {
    const { applicationId, custToken } = await setupAssignedApplication();

    const res = await request(app)
      .post(`/api/ai/applications/${applicationId}/risk-explanation`)
      .set('Authorization', `Bearer ${custToken}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it('rejects an officer not assigned to the application', async () => {
    const { applicationId } = await setupAssignedApplication();
    const { token: otherOfficerToken } = await createAndLogin({
      role: 'loanOfficer',
      email: 'other@x.com',
      phone: '9333333333'
    });

    const res = await request(app)
      .post(`/api/ai/applications/${applicationId}/risk-explanation`)
      .set('Authorization', `Bearer ${otherOfficerToken}`)
      .send({});

    expect(res.status).toBe(403);
  });
});

describe('POST /api/ai/applications/:id/eligibility', () => {
  it('generates and persists an eligibility recommendation', async () => {
    const { applicationId, officerToken } = await setupAssignedApplication();

    mockGeminiResponse(
      JSON.stringify({ eligibleAmount: 150000, reasoning: 'Debt-to-income ratio is well within limits.' })
    );

    const res = await request(app)
      .post(`/api/ai/applications/${applicationId}/eligibility`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.application.aiEligibilityRecommendation.eligibleAmount).toBe(150000);
  });
});

describe('POST /api/ai/applications/:id/fraud-check', () => {
  it('requires at least 2 summarized documents', async () => {
    const { applicationId, officerToken } = await setupAssignedApplication();

    const res = await request(app)
      .post(`/api/ai/applications/${applicationId}/fraud-check`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(400);
  });

  it('runs fraud check when 2+ summarized documents exist', async () => {
    const { applicationId, officerToken } = await setupAssignedApplication();
    const app_ = await LoanApplication.findById(applicationId);

    await LoanDocument.create({
      loanApplication: applicationId,
      customer: app_.customer,
      docType: 'salary_slip',
      cloudinaryUrl: 'https://example.com/a.pdf',
      cloudinaryPublicId: 'a',
      aiSummary: { name: 'Rahul Verma', monthlySalary: 65000 }
    });
    await LoanDocument.create({
      loanApplication: applicationId,
      customer: app_.customer,
      docType: 'bank_statement',
      cloudinaryUrl: 'https://example.com/b.pdf',
      cloudinaryPublicId: 'b',
      aiSummary: { name: 'Rahul Verma', avgBalance: 20000 }
    });

    mockGeminiResponse(JSON.stringify({ flagged: false, explanation: 'No inconsistencies detected.' }));

    const res = await request(app)
      .post(`/api/ai/applications/${applicationId}/fraud-check`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.application.aiFraudFlag).toBe(false);
  });
});

describe('POST /api/ai/applications/:id/duplicate-check', () => {
  it('flags when the same customer has another active application', async () => {
    const { applicationId, officerToken, custToken } = await setupAssignedApplication();

    const product = await LoanProduct.create({
      name: 'Another Loan',
      interestRate: 12,
      minAmount: 5000,
      maxAmount: 100000,
      tenureOptions: [6]
    });
    await request(app)
      .post('/api/loan-applications')
      .set('Authorization', `Bearer ${custToken}`)
      .send({ loanProduct: product._id.toString(), requestedAmount: 20000, tenure: 6 });

    const res = await request(app)
      .post(`/api/ai/applications/${applicationId}/duplicate-check`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.application.aiDuplicateFlag).toBe(true);
  });

  it('does not flag when no other active applications exist', async () => {
    const { applicationId, officerToken } = await setupAssignedApplication();

    const res = await request(app)
      .post(`/api/ai/applications/${applicationId}/duplicate-check`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.application.aiDuplicateFlag).toBe(false);
  });
});

describe('POST /api/ai/decisions/:decisionId/letter', () => {
  it('generates a letter only after a decision exists', async () => {
    const { applicationId, officerToken } = await setupAssignedApplication();

    // New business rule: approval requires an identity + income document
    // on file (see loanDecisionService.assertMinimumDocuments). Upload
    // both before attempting the approval below.
    const app_ = await LoanApplication.findById(applicationId);
    await LoanDocument.create([
      {
        loanApplication: applicationId,
        customer: app_.customer,
        docType: 'aadhaar',
        cloudinaryUrl: 'https://example.com/aadhaar.pdf',
        cloudinaryPublicId: `aadhaar-${applicationId}`
      },
      {
        loanApplication: applicationId,
        customer: app_.customer,
        docType: 'salary_slip',
        cloudinaryUrl: 'https://example.com/salary.pdf',
        cloudinaryPublicId: `salary-${applicationId}`
      }
    ]);

    mockGeminiResponse(JSON.stringify({ eligibleAmount: 100000, reasoning: 'ok' }));
    // Not relevant here — decision letter uses generateContent too, but
    // returns plain text (not JSON), so mock plain text for this call.
    getModel.mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => 'Dear Customer, your loan has been approved. Regards, FinAI Loan Team' }
      })
    });

    const decisionRes = await request(app)
      .post(`/api/loan-applications/${applicationId}/decision`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ decision: 'approved', officerRemarks: 'Good profile', approvedAmount: 100000 });

    const decisionId = decisionRes.body.data.decision._id;

    const res = await request(app)
      .post(`/api/ai/decisions/${decisionId}/letter`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.decision.aiGeneratedLetter).toMatch(/approved/i);

    const saved = await LoanDecision.findById(decisionId);
    expect(saved.aiGeneratedLetter).toMatch(/approved/i);
  });
});

describe('POST /api/ai/notes/polish', () => {
  it('polishes raw officer notes', async () => {
    const { officerToken } = await setupAssignedApplication();
    mockGeminiResponse('The customer has a stable salary and verified income.');

    const res = await request(app)
      .post('/api/ai/notes/polish')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ notes: 'stable salary. income verified.' });

    expect(res.status).toBe(200);
    expect(res.body.data.polished).toMatch(/stable salary/i);
  });

  it('rejects empty notes', async () => {
    const { officerToken } = await setupAssignedApplication();

    const res = await request(app)
      .post('/api/ai/notes/polish')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ notes: '   ' });

    expect(res.status).toBe(400);
  });
});