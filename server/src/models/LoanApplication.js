const mongoose = require('mongoose');
const { APPLICATION_STATUS } = require('../constants/enums');

const loanApplicationSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    loanProduct: { type: mongoose.Schema.Types.ObjectId, ref: 'LoanProduct', required: true },
    requestedAmount: { type: Number, required: true, min: 1 },
    tenure: { type: Number, required: true }, // months, must be one of the product's tenureOptions

    status: {
      type: String,
      enum: Object.values(APPLICATION_STATUS),
      default: APPLICATION_STATUS.SUBMITTED
    },

    // AI-generated fields — populated later by the AI module. Never
    // written to by anything except the AI service; the officer's actual
    // decision always lives in the separate loanDecisions collection.
    aiRiskTags: [String],
    aiRiskExplanation: String,
    aiEligibilityRecommendation: {
      eligibleAmount: Number,
      reasoning: String
    },
    aiDuplicateFlag: { type: Boolean, default: false },
    aiDuplicateExplanation: String,
    aiFraudFlag: { type: Boolean, default: false },
    aiFraudExplanation: String,

    // Set when an officer uses "Request Documents" — persisted so the
    // button state survives a page refresh, and so we could add
    // rate-limiting later (e.g. "only once per 24 hours") without any
    // frontend changes.
    documentsRequestedAt: Date,
    disbursedAt: Date,

    // Set only once the application is approved
    approvedAmount: Number,
    interestRate: Number,
    emiAmount: Number,

    assignedOfficer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    submittedAt: { type: Date, default: Date.now },
    decisionAt: Date
  },
  { timestamps: true }
);

// An officer's "my queue" view and an admin's dashboard both filter by
// status very often — index it for that access pattern.
loanApplicationSchema.index({ status: 1 });
loanApplicationSchema.index({ customer: 1 });
loanApplicationSchema.index({ assignedOfficer: 1 });

module.exports = mongoose.model('LoanApplication', loanApplicationSchema);