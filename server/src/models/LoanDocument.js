const mongoose = require('mongoose');
const { DOC_TYPES } = require('../constants/enums');

const loanDocumentSchema = new mongoose.Schema(
  {
    loanApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanApplication',
      required: true
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    docType: { type: String, enum: Object.values(DOC_TYPES), required: true },

    cloudinaryUrl: { type: String, required: true },
    cloudinaryPublicId: { type: String, required: true }, // needed to delete/replace later

    // Populated by the AI module — kept here (empty for now) so the
    // Document module's schema doesn't need to change when AI is added.
    ocrExtractedText: String,
    aiCleanedText: String,
    aiSummary: {
      name: String,
      monthlySalary: Number,
      employer: String,
      avgBalance: Number,
      existingEmi: Number
    },

    uploadedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

loanDocumentSchema.index({ loanApplication: 1 });

module.exports = mongoose.model('LoanDocument', loanDocumentSchema);