const express = require('express');
const router = express.Router();

const {
  createLoanProduct,
  getLoanProducts,
  getLoanProductById,
  updateLoanProduct
} = require('../controllers/loanProductController');
const {
  createLoanProductValidation,
  mongoIdParamValidation
} = require('../validators/loanProductValidator');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { ROLES } = require('../constants/enums');

// Public — anyone (even logged out) can browse loan products
router.get('/', getLoanProducts);
router.get('/:id', mongoIdParamValidation, getLoanProductById);

// Admin only
router.post('/', protect, authorize(ROLES.ADMIN), createLoanProductValidation, createLoanProduct);
router.patch('/:id', protect, authorize(ROLES.ADMIN), mongoIdParamValidation, updateLoanProduct);

module.exports = router;