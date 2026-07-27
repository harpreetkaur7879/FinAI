const { ApiError } = require('../utils/apiResponse');

/**
 * Usage: router.post('/decision', protect, authorize('loanOfficer', 'admin'), handler)
 *
 * Why a factory function instead of one hardcoded middleware per role?
 * Different routes need different role combinations (e.g. only admin can
 * manage officers, but both officer and admin can view applications).
 * One reusable middleware avoids writing isAdmin(), isOfficer(),
 * isOfficerOrAdmin() as separate files.
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new ApiError(401, 'Not authorized');
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new ApiError(403, `Role '${req.user.role}' is not permitted to perform this action`);
    }
    next();
  };
};

module.exports = { authorize };
