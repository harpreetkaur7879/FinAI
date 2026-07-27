const mongoose = require('mongoose');

/**
 * One document per EMI installment, generated in bulk at disbursement
 * time (see emiService.generateEmiSchedule). Kept as a separate
 * collection rather than an array on LoanApplication so each
 * installment can be queried/updated independently (e.g. "find all EMIs
 * due this week across all loans" for a future reminder job) without
 * loading the whole application document.
 */
const loanEmiSchema = new mongoose.Schema(
  {
    loanApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanApplication',
      required: true
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    installmentNumber: { type: Number, required: true }, // 1-indexed
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    paidAt: Date
  },
  { timestamps: true }
);

loanEmiSchema.index({ loanApplication: 1, installmentNumber: 1 }, { unique: true });
loanEmiSchema.index({ customer: 1, status: 1 });

module.exports = mongoose.model('LoanEmi', loanEmiSchema);