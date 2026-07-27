const LoanApplication = require('../models/LoanApplication');
const LoanProduct = require('../models/LoanProduct');
const { ApiError } = require('../utils/apiResponse');
const { APPLICATION_STATUS } = require('../constants/enums');

/**
 * Encapsulates every business rule around creating a loan application,
 * kept out of the controller so the controller stays a thin HTTP layer
 * and this logic is independently testable / reusable (e.g. if we ever
 * add a "reapply" flow that calls the same rules).
 */
const createApplication = async (customer, { loanProduct: productId, requestedAmount, tenure }) => {
  // Business rule: profile must be complete before applying — an NBFC
  // can't assess risk without salary/employment data.
  if (!customer.customerProfile?.profileCompleted) {
    throw new ApiError(400, 'Please complete your profile before applying for a loan');
  }

  const product = await LoanProduct.findById(productId);
  if (!product || !product.isActive) {
    throw new ApiError(404, 'Loan product not found or no longer available');
  }

  if (requestedAmount < product.minAmount || requestedAmount > product.maxAmount) {
    throw new ApiError(
      400,
      `requestedAmount must be between ${product.minAmount} and ${product.maxAmount} for this product`
    );
  }

  if (!product.tenureOptions.includes(tenure)) {
    throw new ApiError(
      400,
      `tenure must be one of: ${product.tenureOptions.join(', ')} months for this product`
    );
  }

  const application = await LoanApplication.create({
    customer: customer._id,
    loanProduct: productId,
    requestedAmount,
    tenure,
    status: APPLICATION_STATUS.SUBMITTED
  });

  return application;
};

/**
 * Simple EMI calculation using the standard reducing-balance formula.
 * EMI = P * r * (1+r)^n / ((1+r)^n - 1)
 * where r = monthly interest rate, n = tenure in months.
 * Kept here (not in the model) so it's reusable wherever EMI needs
 * computing — e.g. when an officer approves at a possibly different
 * amount than requested.
 */
const calculateEMI = (principal, annualRatePercent, tenureMonths) => {
  const monthlyRate = annualRatePercent / 12 / 100;
  if (monthlyRate === 0) return Math.round(principal / tenureMonths);
  const factor = Math.pow(1 + monthlyRate, tenureMonths);
  const emi = (principal * monthlyRate * factor) / (factor - 1);
  return Math.round(emi);
};

module.exports = { createApplication, calculateEMI };