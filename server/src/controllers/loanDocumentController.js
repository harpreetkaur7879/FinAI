const LoanApplication = require('../models/LoanApplication');
const LoanDocument = require('../models/LoanDocument');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/apiResponse');
const { uploadBufferToCloudinary } = require('../services/cloudinaryService');
const { logAction } = require('../services/auditLogService');
const { ROLES } = require('../constants/enums');

/**
 * @route   POST /api/loan-applications/:applicationId/documents
 * @access  Customer (must own the application)
 */
const uploadDocument = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { docType } = req.body;

  if (!req.file) {
    throw new ApiError(400, 'No file uploaded — attach a file under field name "file"');
  }

  const application = await LoanApplication.findById(applicationId);
  if (!application) {
    throw new ApiError(404, 'Loan application not found');
  }

  if (application.customer.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'You can only upload documents to your own application');
  }

  const result = await uploadBufferToCloudinary(req.file.buffer, {
    public_id: `${applicationId}_${docType}_${Date.now()}`
  });

  const document = await LoanDocument.create({
    loanApplication: applicationId,
    customer: req.user._id,
    docType,
    cloudinaryUrl: result.secure_url,
    cloudinaryPublicId: result.public_id
  });

  await logAction({
    userId: req.user._id,
    action: 'DOCUMENT_UPLOADED',
    targetType: 'LoanDocument',
    targetId: document._id,
    metadata: { docType, loanApplication: applicationId },
    req
  });

  sendSuccess(res, 201, { document }, 'Document uploaded successfully');
});

/**
 * @route   GET /api/loan-applications/:applicationId/documents
 * @access  Owner customer, assigned officer, or admin (same access rule as the application itself)
 */
const getDocuments = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  const application = await LoanApplication.findById(applicationId);
  if (!application) {
    throw new ApiError(404, 'Loan application not found');
  }

  const isOwner = application.customer.toString() === req.user._id.toString();
  const isAssignedOfficer =
    application.assignedOfficer && application.assignedOfficer.toString() === req.user._id.toString();
  const isAdmin = req.user.role === ROLES.ADMIN;
  const isUnclaimedAndOfficer = !application.assignedOfficer && req.user.role === ROLES.LOAN_OFFICER;

  if (!isOwner && !isAssignedOfficer && !isAdmin && !isUnclaimedAndOfficer) {
    throw new ApiError(403, 'Not authorized to view these documents');
  }

  const documents = await LoanDocument.find({ loanApplication: applicationId }).sort({ uploadedAt: -1 });

  sendSuccess(res, 200, { documents }, 'Documents fetched');
});

module.exports = { uploadDocument, getDocuments };