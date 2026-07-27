const mongoose = require('mongoose');

/**
 * Why a separate collection instead of hardcoding rates/limits in code?
 * NBFCs change interest rates and product terms often (sometimes weekly,
 * driven by RBI repo rate changes or business strategy). Hardcoding means
 * a code deploy every time marketing changes a rate. Storing it as data
 * means the admin panel can update it with zero downtime.
 */
const loanProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    interestRate: {
      type: Number,
      required: true,
      min: [0, 'Interest rate cannot be negative']
    }, // annual %, simple interest for EMI calc
    minAmount: { type: Number, required: true, min: 0 },
    maxAmount: {
      type: Number,
      required: true,
      validate: {
        validator: function (value) {
          return value >= this.minAmount;
        },
        message: 'maxAmount must be greater than or equal to minAmount'
      }
    },
    tenureOptions: {
      type: [Number], // e.g. [12, 24, 36, 60] in months
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((n) => n > 0),
        message: 'tenureOptions must be a non-empty array of positive numbers'
      }
    },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('LoanProduct', loanProductSchema);