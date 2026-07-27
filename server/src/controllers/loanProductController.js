const LoanProduct = require('../models/LoanProduct');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/apiResponse');

/**
 * @route   POST /api/loan-products
 * @access  Admin only
 */
const createLoanProduct = asyncHandler(async (req, res) => {
  const { name, description, interestRate, minAmount, maxAmount, tenureOptions } = req.body;

  const product = await LoanProduct.create({
    name,
    description,
    interestRate,
    minAmount,
    maxAmount,
    tenureOptions
  });

  sendSuccess(res, 201, { product }, 'Loan product created');
});

/**
 * @route   GET /api/loan-products
 * @access  Public (customers need to see available products to apply)
 * By default only returns active products — admin can pass
 * ?includeInactive=true to see everything (e.g. to reactivate one).
 */
const getLoanProducts = asyncHandler(async (req, res) => {
  const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
  const products = await LoanProduct.find(filter).sort({ createdAt: -1 });
  sendSuccess(res, 200, { products }, 'Loan products fetched');
});

/**
 * @route   GET /api/loan-products/:id
 * @access  Public
 */
const getLoanProductById = asyncHandler(async (req, res) => {
  const product = await LoanProduct.findById(req.params.id);
  if (!product) {
    throw new ApiError(404, 'Loan product not found');
  }
  sendSuccess(res, 200, { product }, 'Loan product fetched');
});

/**
 * @route   PATCH /api/loan-products/:id
 * @access  Admin only
 * Partial update — e.g. just changing interestRate when RBI rates move,
 * without needing to resend the entire product object.
 */
const updateLoanProduct = asyncHandler(async (req, res) => {
  const allowedFields = [
    'name',
    'description',
    'interestRate',
    'minAmount',
    'maxAmount',
    'tenureOptions',
    'isActive'
  ];

  const product = await LoanProduct.findById(req.params.id);
  if (!product) {
    throw new ApiError(404, 'Loan product not found');
  }

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      product[field] = req.body[field];
    }
  });

  await product.save(); // triggers schema validators (e.g. maxAmount >= minAmount)

  sendSuccess(res, 200, { product }, 'Loan product updated');
});

module.exports = { createLoanProduct, getLoanProducts, getLoanProductById, updateLoanProduct };