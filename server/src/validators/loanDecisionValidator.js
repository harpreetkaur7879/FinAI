const { body, param, validationResult } = require('express-validator');
const { ApiError } = require('../utils/apiResponse');
const { DECISION } = require('../constants/enums');

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

const createDecisionValidation = [
  body('decision')
    .isIn(Object.values(DECISION))
    .withMessage(`decision must be one of: ${Object.values(DECISION).join(', ')}`),
  body('officerRemarks').trim().notEmpty().withMessage('officerRemarks is required'),
  body('approvedAmount')
    .if(body('decision').equals('approved'))
    .isFloat({ min: 1 })
    .withMessage('approvedAmount is required and must be positive when approving'),
  validate
];

const mongoIdParamValidation = [
  param('id').isMongoId().withMessage('Invalid application id'),
  validate
];

module.exports = { createDecisionValidation, mongoIdParamValidation };