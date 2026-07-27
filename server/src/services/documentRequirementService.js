
const LoanDocument = require('../models/LoanDocument');
const { DOC_TYPES } = require('../constants/enums');
 
/**
 * Single source of truth for "what counts as a complete KYC document set."
 * Used by both the approval gate (loanDecisionService.assertMinimumDocuments)
 * and the officer's "Request Documents" action below — so if the
 * requirement ever changes (e.g. adding a third required category), it
 * only needs to change here.
 */
const IDENTITY_DOCS = [DOC_TYPES.AADHAAR, DOC_TYPES.PAN];
const INCOME_DOCS = [DOC_TYPES.SALARY_SLIP, DOC_TYPES.BANK_STATEMENT];
 
const getMissingDocumentCategories = async (applicationId) => {
  const documents = await LoanDocument.find({ loanApplication: applicationId });
  const docTypes = new Set(documents.map((d) => d.docType));
 
  const missing = [];
  if (!IDENTITY_DOCS.some((t) => docTypes.has(t))) {
    missing.push('an identity document (Aadhaar or PAN)');
  }
  if (!INCOME_DOCS.some((t) => docTypes.has(t))) {
    missing.push('an income document (salary slip or bank statement)');
  }
  return missing;
};
 
module.exports = { getMissingDocumentCategories, IDENTITY_DOCS, INCOME_DOCS };
 


















