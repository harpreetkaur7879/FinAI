const { body, param, validationResult } = require('express-validator');
const { ApiError } = require('../utils/apiResponse');
const { DOC_TYPES } = require('../constants/enums');

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

const uploadDocumentValidation = [
  body('docType')
    .isIn(Object.values(DOC_TYPES))
    .withMessage(`docType must be one of: ${Object.values(DOC_TYPES).join(', ')}`),
  validate
];

const mongoIdParamValidation = [
  param('applicationId').isMongoId().withMessage('Invalid application id'),
  validate
];

module.exports = { uploadDocumentValidation, mongoIdParamValidation };