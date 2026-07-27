const express = require('express');
const router = express.Router();

const {
  applyForLoan,
  getApplications,
  getApplicationById,
  assignToSelf,
  requestDocuments
} = require('../controllers/loanApplicationController');
const { decideApplication, getDecisionHistory } = require('../controllers/loanDecisionController');
const { disburseLoan, getEmiSchedule, payEmi } = require('../controllers/loanEmiController');
const loanDocumentRoutes = require('./loanDocumentRoutes');
const {
  createApplicationValidation,
  mongoIdParamValidation
} = require('../validators/loanApplicationValidator');
const { createDecisionValidation } = require('../validators/loanDecisionValidator');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { ROLES } = require('../constants/enums');

router.use(protect); // every loan-application route requires login

router.post('/', authorize(ROLES.CUSTOMER), createApplicationValidation, applyForLoan);
router.get('/', getApplications); // role-based filtering happens inside the controller
router.get('/:id', mongoIdParamValidation, getApplicationById);
router.patch(
  '/:id/assign',
  authorize(ROLES.LOAN_OFFICER),
  mongoIdParamValidation,
  assignToSelf
);
router.post(
  '/:id/request-documents',
  authorize(ROLES.LOAN_OFFICER, ROLES.ADMIN),
  mongoIdParamValidation,
  requestDocuments
);
router.post(
  '/:id/decision',
  authorize(ROLES.LOAN_OFFICER, ROLES.ADMIN),
  mongoIdParamValidation,
  createDecisionValidation,
  decideApplication
);
router.get('/:id/decisions', mongoIdParamValidation, getDecisionHistory);
router.post(
  '/:id/disburse',
  authorize(ROLES.LOAN_OFFICER, ROLES.ADMIN),
  mongoIdParamValidation,
  disburseLoan
);
router.get('/:id/emis', mongoIdParamValidation, getEmiSchedule);
router.patch(
  '/:id/emis/:emiId/pay',
  authorize(ROLES.CUSTOMER),
  mongoIdParamValidation,
  payEmi
);

// Nested: /api/loan-applications/:applicationId/documents
router.use('/:applicationId/documents', loanDocumentRoutes);

module.exports = router;