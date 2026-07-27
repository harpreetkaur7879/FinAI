const mongoose = require('mongoose');
const LoanApplication = require('../models/LoanApplication');
const LoanEmi = require('../models/LoanEmi');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/apiResponse');
const { ROLES, APPLICATION_STATUS } = require('../constants/enums');
const { generateEmiSchedule } = require('../services/emiService');
const { logAction } = require('../services/auditLogService');

/**
 * @route   POST /api/loan-applications/:id/disburse
 * @access  Assigned officer or admin
 * Only allowed from 'approved' status — mirrors the real lifecycle:
 * a human decision (approve) happens first, disbursement (moving actual
 * money) is a distinct, later action, not bundled into the approval call.
 */
const disburseLoan = asyncHandler(async (req, res) => {
  const application = await LoanApplication.findById(req.params.id);
  if (!application) {
    throw new ApiError(404, 'Loan application not found');
  }

  const isAssignedOfficer =
    application.assignedOfficer && application.assignedOfficer.toString() === req.user._id.toString();
  const isAdmin = req.user.role === ROLES.ADMIN;
  if (!isAssignedOfficer && !isAdmin) {
    throw new ApiError(403, 'Only the assigned officer (or an admin) can disburse this loan');
  }

  if (application.status !== APPLICATION_STATUS.APPROVED) {
    throw new ApiError(400, `Cannot disburse — application status is '${application.status}', not 'approved'`);
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      application.status = APPLICATION_STATUS.DISBURSED;
      application.disbursedAt = new Date();
      await application.save({ session });
      await generateEmiSchedule(application, session);
    });
  } finally {
    session.endSession();
  }

  await logAction({
    userId: req.user._id,
    action: 'LOAN_DISBURSED',
    targetType: 'LoanApplication',
    targetId: application._id,
    req
  });

  sendSuccess(res, 200, { application }, 'Loan disbursed and EMI schedule generated');
});

/**
 * @route   GET /api/loan-applications/:id/emis
 * @access  Owner customer, assigned officer, or admin
 */
const getEmiSchedule = asyncHandler(async (req, res) => {
  const application = await LoanApplication.findById(req.params.id);
  if (!application) {
    throw new ApiError(404, 'Loan application not found');
  }

  const isOwner = application.customer.toString() === req.user._id.toString();
  const isAssignedOfficer =
    application.assignedOfficer && application.assignedOfficer.toString() === req.user._id.toString();
  const isAdmin = req.user.role === ROLES.ADMIN;
  if (!isOwner && !isAssignedOfficer && !isAdmin) {
    throw new ApiError(403, 'Not authorized to view this EMI schedule');
  }

  const emis = await LoanEmi.find({ loanApplication: application._id }).sort({ installmentNumber: 1 });
  sendSuccess(res, 200, { emis }, 'EMI schedule fetched');
});

/**
 * @route   PATCH /api/loan-applications/:id/emis/:emiId/pay
 * @access  Owner customer only
 * Simulates a payment — no real payment gateway integration. Marks the
 * installment paid so the repayment-tracking UI has something real to
 * show; wiring an actual gateway (Razorpay/Stripe) would replace this
 * with a webhook-driven confirmation instead of a direct customer call.
 */
const payEmi = asyncHandler(async (req, res) => {
  const application = await LoanApplication.findById(req.params.id);
  if (!application) {
    throw new ApiError(404, 'Loan application not found');
  }
  if (application.customer.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'You can only pay EMIs on your own loan');
  }

  const emi = await LoanEmi.findOne({ _id: req.params.emiId, loanApplication: application._id });
  if (!emi) {
    throw new ApiError(404, 'EMI installment not found');
  }
  if (emi.status === 'paid') {
    throw new ApiError(400, 'This installment has already been paid');
  }

  emi.status = 'paid';
  emi.paidAt = new Date();
  await emi.save();

  await logAction({
    userId: req.user._id,
    action: 'EMI_PAID',
    targetType: 'LoanEmi',
    targetId: emi._id,
    metadata: { installmentNumber: emi.installmentNumber, amount: emi.amount },
    req
  });

  sendSuccess(res, 200, { emi }, 'EMI marked as paid');
});

module.exports = { disburseLoan, getEmiSchedule, payEmi };