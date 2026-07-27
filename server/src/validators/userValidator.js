const { body, param, validationResult } = require('express-validator');
const { ApiError } = require('../utils/apiResponse');
const { EMPLOYMENT_TYPE } = require('../constants/enums');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const message = errors
      .array()
      .map((e) => e.msg)
      .join(', ');
    throw new ApiError(400, message);
  }
  next();
};

// Admin creating a loan officer — note password is still required (officer
// logs in through the same /api/auth/login as everyone else), but role
// and officerProfile fields are set here, not chosen by the registrant.
const createOfficerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('phone')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Valid 10-digit Indian phone number is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/\d/)
    .withMessage('Password must contain at least one number'),
  body('branch').trim().notEmpty().withMessage('Branch is required'),
  body('designation')
    .isIn(['junior_officer', 'senior_officer'])
    .withMessage('Designation must be junior_officer or senior_officer'),
  body('maxActiveApplications')
    .optional()
    .isInt({ min: 1 })
    .withMessage('maxActiveApplications must be a positive integer'),
  body('reportingManager')
    .optional()
    .isMongoId()
    .withMessage('reportingManager must be a valid user id'),
  validate
];

// Customer completing their profile — required before applying for a loan.
const completeProfileValidation = [
  body('dob').isISO8601().toDate().withMessage('Valid date of birth is required'),
  body('employmentType')
    .isIn(Object.values(EMPLOYMENT_TYPE))
    .withMessage(`employmentType must be one of: ${Object.values(EMPLOYMENT_TYPE).join(', ')}`),
  body('monthlySalary')
    .isFloat({ min: 0 })
    .withMessage('monthlySalary must be a positive number'),
  body('employerName')
    .if(body('employmentType').equals('salaried'))
    .trim()
    .notEmpty()
    .withMessage('employerName is required for salaried applicants'),
  validate
];

const mongoIdParamValidation = [
  param('id').isMongoId().withMessage('Invalid user id'),
  validate
];

module.exports = {
  createOfficerValidation,
  completeProfileValidation,
  mongoIdParamValidation
};