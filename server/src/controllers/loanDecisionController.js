const LoanApplication = require('../models/LoanApplication');
const LoanDecision = require('../models/LoanDecision');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/apiResponse');
const { makeDecision } = require('../services/loanDecisionService');

/**
 * @route   POST /api/loan-applications/:id/decision
 * @access  Loan Officer (assigned) or Admin
 */
const decideApplication = asyncHandler(async (req, res) => {
  const application = await LoanApplication.findById(req.params.id);
  if (!application) {
    throw new ApiError(404, 'Loan application not found');
  }

  const result = await makeDecision(application, req.user, req.body, req);

  sendSuccess(res, 200, result, `Application ${req.body.decision} successfully`);
});

/**
 * @route   GET /api/loan-applications/:id/decisions
 * @access  Owner customer, assigned officer, or admin (same rule as viewing the application)
 * Returns the full decision history for an application — the audit trail.
 */
const getDecisionHistory = asyncHandler(async (req, res) => {
  const application = await LoanApplication.findById(req.params.id);
  if (!application) {
    throw new ApiError(404, 'Loan application not found');
  }

  const isOwner = application.customer.toString() === req.user._id.toString();
  const isAssignedOfficer =
    application.assignedOfficer && application.assignedOfficer.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAssignedOfficer && !isAdmin) {
    throw new ApiError(403, 'Not authorized to view this application’s decisions');
  }

  const decisions = await LoanDecision.find({ loanApplication: application._id })
    .populate('officer', 'name officerProfile.employeeId')
    .sort({ decidedAt: -1 });

  sendSuccess(res, 200, { decisions }, 'Decision history fetched');
});

module.exports = { decideApplication, getDecisionHistory };