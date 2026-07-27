const jwt = require('jsonwebtoken');

/**
 * Why two tokens (access + refresh)?
 * - Access token: short-lived (15m), sent with every request, used to
 *   authenticate. If stolen, damage window is small.
 * - Refresh token: long-lived (7d), stored as an httpOnly cookie + hashed
 *   in DB, used only to mint new access tokens. Lets a user stay logged in
 *   without re-entering credentials every 15 minutes, while still letting
 *   us revoke access server-side (by clearing refreshToken in DB) if needed.
 */

const generateAccessToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m'
  });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d'
  });
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
