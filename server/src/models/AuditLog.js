const mongoose = require('mongoose');

/**
 * The collection most portfolio projects skip — and the one that answers
 * "why would a real NBFC pay for this?" most directly. Regulators require
 * traceability of who did what and when on a financial system. This is
 * populated automatically by services (e.g. loanDecisionService), never
 * directly by a user-facing route.
 */
const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who performed the action
    action: { type: String, required: true }, // e.g. "LOAN_APPROVED", "OFFICER_CREATED"
    targetType: { type: String, required: true }, // e.g. "LoanApplication"
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed }, // before/after values, free-form
    ipAddress: String,
    timestamp: { type: Date, default: Date.now }
  },
  { timestamps: false } // `timestamp` field already serves this purpose
);

auditLogSchema.index({ targetType: 1, targetId: 1 });
auditLogSchema.index({ user: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);