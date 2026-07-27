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

const createApplicationValidation = [
  body('loanProduct').isMongoId().withMessage('Valid loanProduct id is required'),
  body('requestedAmount')
    .isFloat({ min: 1 })
    .withMessage('requestedAmount must be a positive number'),
  body('tenure').isInt({ min: 1 }).withMessage('tenure must be a positive integer (months)'),
  validate
];

const mongoIdParamValidation = [
  param('id').isMongoId().withMessage('Invalid application id'),
  validate
];

module.exports = { createApplicationValidation, mongoIdParamValidation };