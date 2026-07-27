/**
 * Wraps async route handlers so we don't repeat try/catch in every
 * controller. Any thrown/rejected error is forwarded to Express's
 * error-handling middleware (see middleware/errorHandler.js).
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * A tiny custom error class so we can attach an HTTP status code
 * to any error we throw deliberately (e.g. "Invalid credentials" -> 401),
 * and the central error handler knows how to respond correctly.
 */
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const sendSuccess = (res, statusCode, data, message = 'Success') => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

module.exports = { asyncHandler, ApiError, sendSuccess };
