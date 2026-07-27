const mongoose = require('mongoose');
const LoanApplication = require('../models/LoanApplication');
const LoanDecision = require('../models/LoanDecision');
const Notification = require('../models/Notification');
const { ApiError } = require('../utils/apiResponse');
const { APPLICATION_STATUS, DECISION, ROLES } = require('../constants/enums');
const { calculateEMI } = require('./loanApplicationService');
const { logAction } = require('./auditLogService');
const { getMissingDocumentCategories } = require('./documentRequirementService');
 
/**
 * Minimum KYC requirement for approval: at least one identity document
 * AND at least one income document. Rejection never requires documents —
 * "documents were never provided" is itself a valid rejection reason,
 * so gating only the approval path (not the whole decision endpoint)
 * matches how a real NBFC underwriting desk would work.
 */
const assertMinimumDocuments = async (applicationId) => {
  const missing = await getMissingDocumentCategories(applicationId);
  if (missing.length > 0) {
    throw new ApiError(
      400,
      `Cannot approve — missing ${missing.join(' and ')}. Ask the customer to upload it first.`
    );
  }
};
 
/**
 * The core "officer clicks Approve/Reject" flow, exactly as designed
 * earlier: one action touches 4 collections —
 *   1. LoanDecision   (new audit-trail document, never overwritten)
 *   2. LoanApplication (status + approved terms updated)
 *   3. Notification    (customer gets notified)
 *   4. AuditLog         (regulatory traceability)
 *
 * Wrapped in a Mongo transaction so a failure partway through (e.g. step 3
 * throws) doesn't leave the application "approved" with no decision record.
 */
const makeDecision = async (application, officer, { decision, officerRemarks, approvedAmount }, req) => {
  const isAssignedOfficer =
    application.assignedOfficer && application.assignedOfficer.toString() === officer._id.toString();
  const isAdmin = officer.role === ROLES.ADMIN;
 
  if (!isAssignedOfficer && !isAdmin) {
    throw new ApiError(403, 'Only the assigned officer (or an admin) can decide this application');
  }
 
  if (![APPLICATION_STATUS.SUBMITTED, APPLICATION_STATUS.UNDER_REVIEW].includes(application.status)) {
    throw new ApiError(400, `Cannot decide an application that is already '${application.status}'`);
  }
 
  if (decision === DECISION.APPROVED) {
    await assertMinimumDocuments(application._id);
  }
 
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const loanDecision = await LoanDecision.create(
        [
          {
            loanApplication: application._id,
            officer: officer._id,
            decision,
            officerRemarks
          }
        ],
        { session }
      );
 
      application.status =
        decision === DECISION.APPROVED ? APPLICATION_STATUS.APPROVED : APPLICATION_STATUS.REJECTED;
      application.decisionAt = new Date();
 
      if (decision === DECISION.APPROVED) {
        const product = await mongoose
          .model('LoanProduct')
          .findById(application.loanProduct)
          .session(session);
        application.approvedAmount = approvedAmount;
        application.interestRate = product.interestRate;
        application.emiAmount = calculateEMI(approvedAmount, product.interestRate, application.tenure);
      }
 
      await application.save({ session });
 
      await Notification.create(
        [
          {
            user: application.customer,
            type: 'decision',
            message:
              decision === DECISION.APPROVED
                ? `Your loan application has been approved for ₹${approvedAmount}.`
                : `Your loan application has been rejected. Reason: ${officerRemarks}`
          }
        ],
        { session }
      );
 
      result = { application, decision: loanDecision[0] };
    });
 
    await logAction({
      userId: officer._id,
      action: decision === DECISION.APPROVED ? 'LOAN_APPROVED' : 'LOAN_REJECTED',
      targetType: 'LoanApplication',
      targetId: application._id,
      metadata: { officerRemarks, approvedAmount: approvedAmount || null },
      req
    });
 
    return result;
  } finally {
    session.endSession();
  }
};
 
module.exports = { makeDecision };
 