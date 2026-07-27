const { verifyAccessToken } = require('../utils/generateTokens');
const { ApiError, asyncHandler } = require('../utils/apiResponse');
const User = require('../models/User');

/**
 * Protects any route it's applied to. Expects:
 *   Authorization: Bearer <accessToken>
 *
 * On success, attaches the authenticated user's document to req.user
 * so downstream controllers know who is making the request without
 * re-querying or re-decoding anywhere else.
 */
const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Not authorized, no token provided');
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    throw new ApiError(401, 'Not authorized, token invalid or expired');
  }

  const user = await User.findById(decoded.id);

  if (!user) {
    throw new ApiError(401, 'Not authorized, user no longer exists');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account has been deactivated');
  }

  req.user = user;
  next();
});

module.exports = { protect };
