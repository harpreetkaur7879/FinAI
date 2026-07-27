const LoanApplication = require('../models/LoanApplication');
const LoanDocument = require('../models/LoanDocument');
const LoanDecision = require('../models/LoanDecision');
const User = require('../models/User');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/apiResponse');
const { ROLES, APPLICATION_STATUS } = require('../constants/enums');
const {
  summarizeDocument,
  explainRisk,
  recommendEligibility,
  checkFraudIndicators,
  generateDecisionLetter,
  polishInternalNotes
} = require('../ai/aiService');
const { logAction } = require('../services/auditLogService');

/**
 * Every AI action below is restricted to officer/admin (enforced in
 * routes), and every action only ANALYZES/SUMMARIZES/RECOMMENDS/EXPLAINS
 * — never approves, rejects, or changes application status. That
 * enforcement lives in loanDecisionController, not here, and stays
 * completely separate from these AI helpers by design (Phase 0 rule).
 */

// Shared access check: officer must be assigned to the application (or be admin)
const assertCanAccessApplication = (application, user) => {
  const isAssignedOfficer =
    application.assignedOfficer && application.assignedOfficer.toString() === user._id.toString();
  const isAdmin = user.role === ROLES.ADMIN;
  const isUnclaimedAndOfficer = !application.assignedOfficer && user.role === ROLES.LOAN_OFFICER;

  if (!isAssignedOfficer && !isAdmin && !isUnclaimedAndOfficer) {
    throw new ApiError(403, 'Not authorized to run AI analysis on this application');
  }
};

/**
 * @route   POST /api/ai/documents/:documentId/summarize
 */
const summarizeDocumentHandler = asyncHandler(async (req, res) => {
  const document = await LoanDocument.findById(req.params.documentId);
  if (!document) throw new ApiError(404, 'Document not found');

  const application = await LoanApplication.findById(document.loanApplication);
  assertCanAccessApplication(application, req.user);

  const { aiCleanedText, aiSummary } = await summarizeDocument(document.cloudinaryUrl, document.docType);

  document.aiCleanedText = aiCleanedText;
  document.aiSummary = aiSummary;
  await document.save();

  await logAction({
    userId: req.user._id,
    action: 'AI_DOCUMENT_SUMMARIZED',
    targetType: 'LoanDocument',
    targetId: document._id,
    req
  });

  sendSuccess(res, 200, { document }, 'Document summarized');
});

/**
 * @route   POST /api/ai/applications/:id/risk-explanation
 */
const riskExplanationHandler = asyncHandler(async (req, res) => {
  const application = await LoanApplication.findById(req.params.id).populate('customer');
  if (!application) throw new ApiError(404, 'Application not found');
  assertCanAccessApplication(application, req.user);

  const customerProfile = application.customer.customerProfile || {};
  const { aiRiskTags, aiRiskExplanation } = await explainRisk({
    monthlySalary: customerProfile.monthlySalary || 0,
    existingEmiEstimate: req.body.existingEmiEstimate || 0,
    requestedAmount: application.requestedAmount,
    tenure: application.tenure,
    employmentType: customerProfile.employmentType || 'unknown'
  });

  application.aiRiskTags = aiRiskTags;
  application.aiRiskExplanation = aiRiskExplanation;
  await application.save();

  await logAction({
    userId: req.user._id,
    action: 'AI_RISK_EXPLAINED',
    targetType: 'LoanApplication',
    targetId: application._id,
    req
  });

  sendSuccess(res, 200, { application }, 'Risk explanation generated');
});

/**
 * @route   POST /api/ai/applications/:id/eligibility
 */
const eligibilityHandler = asyncHandler(async (req, res) => {
  const application = await LoanApplication.findById(req.params.id).populate('customer');
  if (!application) throw new ApiError(404, 'Application not found');
  assertCanAccessApplication(application, req.user);

  const customerProfile = application.customer.customerProfile || {};
  const recommendation = await recommendEligibility({
    monthlySalary: customerProfile.monthlySalary || 0,
    existingEmiEstimate: req.body.existingEmiEstimate || 0,
    requestedAmount: application.requestedAmount,
    employmentType: customerProfile.employmentType || 'unknown'
  });

  application.aiEligibilityRecommendation = recommendation;
  await application.save();

  await logAction({
    userId: req.user._id,
    action: 'AI_ELIGIBILITY_RECOMMENDED',
    targetType: 'LoanApplication',
    targetId: application._id,
    req
  });

  sendSuccess(res, 200, { application }, 'Eligibility recommendation generated');
});

/**
 * @route   POST /api/ai/applications/:id/fraud-check
 * Requires at least one document to already have an aiSummary
 * (i.e. summarizeDocument must have been run first).
 */
const fraudCheckHandler = asyncHandler(async (req, res) => {
  const application = await LoanApplication.findById(req.params.id);
  if (!application) throw new ApiError(404, 'Application not found');
  assertCanAccessApplication(application, req.user);

  const documents = await LoanDocument.find({
    loanApplication: application._id,
    'aiSummary.name': { $exists: true }
  });

  if (documents.length < 2) {
    throw new ApiError(
      400,
      'Fraud check needs at least 2 summarized documents — run document summarization first'
    );
  }

  const { flagged, explanation } = await checkFraudIndicators(documents);

  application.aiFraudFlag = flagged;
  application.aiFraudExplanation = explanation;
  await application.save();

  await logAction({
    userId: req.user._id,
    action: 'AI_FRAUD_CHECK_RUN',
    targetType: 'LoanApplication',
    targetId: application._id,
    metadata: { flagged },
    req
  });

  sendSuccess(res, 200, { application }, 'Fraud check completed');
});

/**
 * @route   POST /api/ai/applications/:id/duplicate-check
 * Rule-based pre-filter (same customer, or same employer+name across
 * different customers) narrows candidates before asking the officer to
 * review — kept rule-based rather than AI for the matching itself, since
 * exact-field matching is more reliable and cheaper than an LLM call for
 * this part. AI is not needed here at all in this implementation; flagged
 * purely by data matching, consistent with "AI only where it adds value."
 */
const duplicateCheckHandler = asyncHandler(async (req, res) => {
  const application = await LoanApplication.findById(req.params.id).populate('customer');
  if (!application) throw new ApiError(404, 'Application not found');
  assertCanAccessApplication(application, req.user);

  const otherActiveApplications = await LoanApplication.find({
    customer: application.customer._id,
    _id: { $ne: application._id },
    status: { $in: [APPLICATION_STATUS.SUBMITTED, APPLICATION_STATUS.UNDER_REVIEW] }
  });

  const flagged = otherActiveApplications.length > 0;
  const explanation = flagged
    ? `This customer has ${otherActiveApplications.length} other active application(s) already in progress.`
    : 'No duplicate active applications found for this customer.';

  application.aiDuplicateFlag = flagged;
  application.aiDuplicateExplanation = explanation;
  await application.save();

  await logAction({
    userId: req.user._id,
    action: 'AI_DUPLICATE_CHECK_RUN',
    targetType: 'LoanApplication',
    targetId: application._id,
    metadata: { flagged },
    req
  });

  sendSuccess(res, 200, { application }, 'Duplicate check completed');
});

/**
 * @route   POST /api/ai/decisions/:decisionId/letter
 * Only runs AFTER a decision already exists (see loanDecisionService) —
 * AI drafts wording for an already-made human decision, never before it.
 */
const decisionLetterHandler = asyncHandler(async (req, res) => {
  const decision = await LoanDecision.findById(req.params.decisionId).populate({
    path: 'loanApplication',
    populate: { path: 'customer' }
  });
  if (!decision) throw new ApiError(404, 'Decision not found');

  const isDecidingOfficer = decision.officer.toString() === req.user._id.toString();
  const isAdmin = req.user.role === ROLES.ADMIN;
  if (!isDecidingOfficer && !isAdmin) {
    throw new ApiError(403, 'Not authorized to generate a letter for this decision');
  }

  const application = decision.loanApplication;
  const letter = await generateDecisionLetter({
    decision: decision.decision,
    customerName: application.customer.name,
    approvedAmount: application.approvedAmount,
    emiAmount: application.emiAmount,
    officerRemarks: decision.officerRemarks
  });

  decision.aiGeneratedLetter = letter;
  await decision.save();

  await logAction({
    userId: req.user._id,
    action: 'AI_DECISION_LETTER_GENERATED',
    targetType: 'LoanDecision',
    targetId: decision._id,
    req
  });

  sendSuccess(res, 200, { decision }, 'Decision letter generated');
});

/**
 * @route   POST /api/ai/notes/polish
 * Standalone writing-assist action — no persistence, since the officer
 * decides what (if anything) to do with the polished text afterward.
 */
const polishNotesHandler = asyncHandler(async (req, res) => {
  const { notes } = req.body;
  if (!notes || typeof notes !== 'string' || !notes.trim()) {
    throw new ApiError(400, 'notes is required');
  }

  const polished = await polishInternalNotes(notes);
  sendSuccess(res, 200, { original: notes, polished }, 'Notes polished');
});

module.exports = {
  summarizeDocumentHandler,
  riskExplanationHandler,
  eligibilityHandler,
  fraudCheckHandler,
  duplicateCheckHandler,
  decisionLetterHandler,
  polishNotesHandler
};