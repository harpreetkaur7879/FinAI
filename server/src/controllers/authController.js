const User = require('../models/User');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/apiResponse');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} = require('../utils/generateTokens');
const { ROLES } = require('../constants/enums');


const isProd = process.env.NODE_ENV === 'production';
const refreshCookieOptions = {
  httpOnly: true,
  // Frontend (Vercel) and backend (Render) are on different domains in
  // production — that makes every request "cross-site" from the
  // browser's perspective. Cross-site cookies require SameSite=None,
  // and browsers only allow SameSite=None when Secure is also true.
  // 'lax' works locally where both run on localhost (same-site).
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000
};

/**
 * @route   POST /api/auth/register
 * @access  Public
 * Only allows role: 'customer' at signup. Officer/admin accounts are
 * created by an admin (see userController) — you should never let the
 * public self-register as a loan officer.
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;

  const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
  if (existingUser) {
    throw new ApiError(409, 'An account with this email or phone already exists');
  }

  const user = await User.create({
    name,
    email,
    phone,
    password,
    role: ROLES.CUSTOMER
  });

  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken = refreshToken;
  await user.save();

  res.cookie('refreshToken', refreshToken, refreshCookieOptions);

  sendSuccess(
    res,
    201,
    { user: user.toSafeObject(), accessToken },
    'Registered successfully'
  );
});

/**
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // .select('+password') needed because password has select:false in the schema
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'Account has been deactivated. Contact support.');
  }

  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken = refreshToken;
  await user.save();

  res.cookie('refreshToken', refreshToken, refreshCookieOptions);

  sendSuccess(res, 200, { user: user.toSafeObject(), accessToken }, 'Logged in successfully');
});

/**
 * @route   POST /api/auth/refresh
 * @access  Public (requires valid refresh cookie)
 * Issues a new access token without forcing the user to log in again.
 * Also rotates the refresh token (defense against replay if one leaks).
 */
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    throw new ApiError(401, 'No refresh token provided');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (err) {
    throw new ApiError(401, 'Refresh token invalid or expired, please log in again');
  }

  const user = await User.findById(decoded.id).select('+refreshToken');

  // Comparing against the DB-stored token means we can invalidate a
  // stolen refresh token server-side just by clearing this field (logout).
  if (!user || user.refreshToken !== token) {
    throw new ApiError(401, 'Refresh token invalid, please log in again');
  }

  const newAccessToken = generateAccessToken(user._id, user.role);
  const newRefreshToken = generateRefreshToken(user._id);

  user.refreshToken = newRefreshToken;
  await user.save();

  res.cookie('refreshToken', newRefreshToken, refreshCookieOptions);

  sendSuccess(res, 200, { accessToken: newAccessToken }, 'Token refreshed');
});

/**
 * @route   POST /api/auth/logout
 * @access  Private
 */
const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;

  if (token) {
    // Invalidate server-side regardless of who sends what — cheap and safe.
    await User.updateOne({ refreshToken: token }, { $unset: { refreshToken: 1 } });
  }

res.clearCookie('refreshToken', {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax'
});

/**
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, { user: req.user.toSafeObject() }, 'Current user fetched');
});

module.exports = { register, login, refresh, logout, getMe };
