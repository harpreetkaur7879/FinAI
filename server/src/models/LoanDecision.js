const mongoose = require('mongoose');
const { DECISION } = require('../constants/enums');

/**
 * Deliberately a separate collection from loanApplications (not a single
 * "decision" field on the application) — see Module design discussion:
 * if an officer reviews, sends back for more docs, and reviews again,
 * a single field would silently overwrite the first decision. A separate
 * collection means every review action creates a new document, giving a
 * full audit history of who decided what and when — required for NBFC
 * regulatory traceability.
 */
const loanDecisionSchema = new mongoose.Schema(
  {
    loanApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanApplication',
      required: true
    },
    officer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    decision: { type: String, enum: Object.values(DECISION), required: true },
    officerRemarks: { type: String, required: true, trim: true },
    // Populated later by the AI module (generateDecisionLetter) — AI only
    // drafts the letter after the human decision is made, never before.
    aiGeneratedLetter: String,
    decidedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

loanDecisionSchema.index({ loanApplication: 1 });

module.exports = mongoose.model('LoanDecision', loanDecisionSchema);