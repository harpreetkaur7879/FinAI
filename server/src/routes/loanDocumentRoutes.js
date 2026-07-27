const express = require('express');
const router = express.Router({ mergeParams: true }); // needed to access :applicationId from parent router

const { uploadDocument, getDocuments } = require('../controllers/loanDocumentController');
const { uploadDocumentValidation } = require('../validators/loanDocumentValidator');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const upload = require('../middleware/upload');
const { ROLES } = require('../constants/enums');

router.use(protect);

router.post(
  '/',
  authorize(ROLES.CUSTOMER),
  upload.single('file'),
  uploadDocumentValidation,
  uploadDocument
);
router.get('/', getDocuments);

module.exports = router;
