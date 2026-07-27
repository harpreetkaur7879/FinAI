const { body, param, validationResult } = require('express-validator');
const { ApiError } = require('../utils/apiResponse');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ApiError(
      400,
      errors
        .array()
        .map((e) => e.msg)
        .join(', ')
    );
  }
  next();
};

const createLoanProductValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('interestRate')
    .isFloat({ min: 0 })
    .withMessage('interestRate must be a non-negative number'),
  body('minAmount').isFloat({ min: 0 }).withMessage('minAmount must be a non-negative number'),
  body('maxAmount')
    .isFloat({ min: 0 })
    .withMessage('maxAmount must be a non-negative number')
    .custom((value, { req }) => {
      if (Number(value) < Number(req.body.minAmount)) {
        throw new Error('maxAmount must be greater than or equal to minAmount');
      }
      return true;
    }),
  body('tenureOptions')
    .isArray({ min: 1 })
    .withMessage('tenureOptions must be a non-empty array')
    .custom((arr) => arr.every((n) => Number.isInteger(n) && n > 0))
    .withMessage('Each tenure option must be a positive integer (months)'),
  validate
];

const mongoIdParamValidation = [
  param('id').isMongoId().withMessage('Invalid product id'),
  validate
];

module.exports = { createLoanProductValidation, mongoIdParamValidation };