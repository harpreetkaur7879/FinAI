const express = require('express');
const router = express.Router();

const {
  createOfficer,
  completeProfile,
  getAllUsers,
  getUserById,
  updateUserStatus
} = require('../controllers/userController');
const {
  createOfficerValidation,
  completeProfileValidation,
  mongoIdParamValidation
} = require('../validators/userValidator');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roleCheck');
const { ROLES } = require('../constants/enums');

// All routes below require a logged-in user
router.use(protect);

router.post('/officers', authorize(ROLES.ADMIN), createOfficerValidation, createOfficer);
router.put('/profile', completeProfileValidation, completeProfile);
router.get('/', authorize(ROLES.ADMIN), getAllUsers);
router.get('/:id', mongoIdParamValidation, getUserById);
router.patch(
  '/:id/status',
  authorize(ROLES.ADMIN),
  mongoIdParamValidation,
  updateUserStatus
);

module.exports = router;