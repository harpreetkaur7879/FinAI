/**
 * Central place for enums used across models, validators, and controllers.
 * Why: if "loanOfficer" is hardcoded as a string in 10 files and we
 * later rename it, we'd have to hunt every occurrence. One source of truth
 * means one place to change it, and no risk of a typo like "loanoffcier"
 * silently breaking a role check.
 */

const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  LOAN_OFFICER: 'loanOfficer',
  ADMIN: 'admin'
});

const APPLICATION_STATUS = Object.freeze({
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DISBURSED: 'disbursed'
});

const DECISION = Object.freeze({
  APPROVED: 'approved',
  REJECTED: 'rejected'
});

const DOC_TYPES = Object.freeze({
  AADHAAR: 'aadhaar',
  PAN: 'pan',
  SALARY_SLIP: 'salary_slip',
  BANK_STATEMENT: 'bank_statement'
});

const EMPLOYMENT_TYPE = Object.freeze({
  SALARIED: 'salaried',
  SELF_EMPLOYED: 'self-employed',
  UNEMPLOYED: 'unemployed'
});

module.exports = {
  ROLES,
  APPLICATION_STATUS,
  DECISION,
  DOC_TYPES,
  EMPLOYMENT_TYPE
};
