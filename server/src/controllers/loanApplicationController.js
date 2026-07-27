const LoanApplication = require('../models/LoanApplication');
const Notification = require('../models/Notification');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/apiResponse');
const { ROLES, APPLICATION_STATUS } = require('../constants/enums');
const { createApplication } = require('../services/loanApplicationService');
const { getMissingDocumentCategories } = require('../services/documentRequirementService');
const { logAction } = require('../services/auditLogService');
 
/**
 * @route   POST /api/loan-applications
 * @access  Customer only
 */
const applyForLoan = asyncHandler(async (req, res) => {
  const application = await createApplication(req.user, req.body);
 
  await logAction({
    userId: req.user._id,
    action: 'LOAN_APPLICATION_SUBMITTED',
    targetType: 'LoanApplication',
    targetId: application._id,
    metadata: { requestedAmount: application.requestedAmount, tenure: application.tenure },
    req
  });
 
  sendSuccess(res, 201, { application }, 'Loan application submitted');
});
 
/**
 * @route   GET /api/loan-applications
 * @access  Private
 * - customer: sees only their own applications
 * - officer: sees applications assigned to them by default;
 *            ?unassigned=true shows the unclaimed queue
 * - admin: sees everything, can filter ?status= and ?customer=
 */
const getApplications = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20, unassigned } = req.query;
  const filter = {};
 
  if (req.user.role === ROLES.CUSTOMER) {
    filter.customer = req.user._id;
  } else if (req.user.role === ROLES.LOAN_OFFICER) {
    if (unassigned === 'true') {
      filter.assignedOfficer = null;
    } else {
      filter.assignedOfficer = req.user._id;
    }
  }
  // admin: no restriction — sees all applications
 
  if (status) {
    if (!Object.values(APPLICATION_STATUS).includes(status)) {
      throw new ApiError(400, `status must be one of: ${Object.values(APPLICATION_STATUS).join(', ')}`);
    }
    filter.status = status;
  }
 
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
 
  const [applications, total] = await Promise.all([
    LoanApplication.find(filter)
      .populate('customer', 'name email phone')
      .populate('loanProduct', 'name interestRate')
      .populate('assignedOfficer', 'name officerProfile.employeeId')
      .sort({ submittedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    LoanApplication.countDocuments(filter)
  ]);
 
  sendSuccess(
    res,
    200,
    {
      applications,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    },
    'Loan applications fetched'
  );
});
 
/**
 * @route   GET /api/loan-applications/:id
 * @access  Private (customer: own only, officer: assigned or unassigned, admin: any)
 */
const getApplicationById = asyncHandler(async (req, res) => {
  const application = await LoanApplication.findById(req.params.id)
    .populate('customer', 'name email phone customerProfile')
    .populate('loanProduct')
    .populate('assignedOfficer', 'name officerProfile.employeeId');
 
  if (!application) {
    throw new ApiError(404, 'Loan application not found');
  }
 
  const isOwner = application.customer._id.toString() === req.user._id.toString();
  const isAssignedOfficer =
    application.assignedOfficer && application.assignedOfficer._id.toString() === req.user._id.toString();
  const isAdmin = req.user.role === ROLES.ADMIN;
  const isUnclaimedAndOfficer = !application.assignedOfficer && req.user.role === ROLES.LOAN_OFFICER;
 
  if (!isOwner && !isAssignedOfficer && !isAdmin && !isUnclaimedAndOfficer) {
    throw new ApiError(403, 'Not authorized to view this application');
  }
 
  sendSuccess(res, 200, { application }, 'Loan application fetched');
});
 
/**
 * @route   PATCH /api/loan-applications/:id/assign
 * @access  Loan Officer only
 * An officer "claims" an unassigned application from the queue.
 * Enforces the workload cap set on their officerProfile — a real business
 * rule (see Module 2 design: maxActiveApplications).
 */
const assignToSelf = asyncHandler(async (req, res) => {
  const application = await LoanApplication.findById(req.params.id);
  if (!application) {
    throw new ApiError(404, 'Loan application not found');
  }
 
  if (application.assignedOfficer) {
    throw new ApiError(409, 'This application is already assigned to an officer');
  }
 
  const activeCount = await LoanApplication.countDocuments({
    assignedOfficer: req.user._id,
    status: { $in: [APPLICATION_STATUS.SUBMITTED, APPLICATION_STATUS.UNDER_REVIEW] }
  });
  const cap = req.user.officerProfile?.maxActiveApplications || 20;
 
  if (activeCount >= cap) {
    throw new ApiError(
      400,
      `Cannot take more applications — you are at your workload cap of ${cap}`
    );
  }
 
  application.assignedOfficer = req.user._id;
  application.status = APPLICATION_STATUS.UNDER_REVIEW;
  await application.save();
 
  await logAction({
    userId: req.user._id,
    action: 'LOAN_APPLICATION_ASSIGNED',
    targetType: 'LoanApplication',
    targetId: application._id,
    req
  });
 
  sendSuccess(res, 200, { application }, 'Application assigned to you');
});
 
/**
 * @route   POST /api/loan-applications/:id/request-documents
 * @access  Loan Officer (assigned) or Admin
 * Business reason: applications can be submitted before any documents
 * exist (see loanApplicationService — profile-completion is the only
 * gate at apply-time). This gives the officer an explicit way to nudge
 * the customer, rather than the customer having to guess what's needed
 * or the officer having to communicate outside the system.
 */
const requestDocuments = asyncHandler(async (req, res) => {
  const application = await LoanApplication.findById(req.params.id);
  if (!application) {
    throw new ApiError(404, 'Loan application not found');
  }
 
  const isAssignedOfficer =
    application.assignedOfficer && application.assignedOfficer.toString() === req.user._id.toString();
  const isAdmin = req.user.role === ROLES.ADMIN;
  if (!isAssignedOfficer && !isAdmin) {
    throw new ApiError(403, 'Only the assigned officer (or an admin) can request documents');
  }
 
  const missing = await getMissingDocumentCategories(application._id);
  if (missing.length === 0) {
    throw new ApiError(400, 'All required documents are already on file for this application.');
  }
 
  const notification = await Notification.create({
    user: application.customer,
    type: 'document_required',
    message: `Your loan application needs ${missing.join(' and ')}. Please upload it to avoid delays.`
  });
 
  application.documentsRequestedAt = new Date();
  await application.save();
 
  await logAction({
    userId: req.user._id,
    action: 'DOCUMENTS_REQUESTED',
    targetType: 'LoanApplication',
    targetId: application._id,
    metadata: { missing },
    req
  });
 
  sendSuccess(res, 200, { notification, application }, 'Document request sent to customer');
});
 
module.exports = { applyForLoan, getApplications, getApplicationById, assignToSelf, requestDocuments };
 