const express = require('express');
const router = express.Router();

const {
  summarizeDocumentHandler,
  riskExplanationHandler,
  eligibilityHandler,
  fraudCheckHandler,
  duplicateCheckHandler,
  decisionLetterHandler,
  polishNotesHandler
} = require('../controllers/aiController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { ROLES } = require('../constants/enums');

router.use(protect);
router.use(authorize(ROLES.LOAN_OFFICER, ROLES.ADMIN)); // every AI action is officer/admin tooling, never customer-facing

router.post('/documents/:documentId/summarize', summarizeDocumentHandler);
router.post('/applications/:id/risk-explanation', riskExplanationHandler);
router.post('/applications/:id/eligibility', eligibilityHandler);
router.post('/applications/:id/fraud-check', fraudCheckHandler);
router.post('/applications/:id/duplicate-check', duplicateCheckHandler);
router.post('/decisions/:decisionId/letter', decisionLetterHandler);
router.post('/notes/polish', polishNotesHandler);

module.exports = router;