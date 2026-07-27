const { ApiError } = require('../utils/apiResponse');

/**
 * Single place that formats every error response consistently.
 * Why this matters for interviews: without this, every controller
 * would need its own try/catch + res.status().json() boilerplate,
 * and error response shape would drift across the codebase.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err instanceof ApiError ? err.statusCode : 500;
  let message = err.message || 'Internal Server Error';

  // Mongoose duplicate key error (e.g. email/phone already exists)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || {})[0];
    message = `${field} already in use`;
  }

  // Invalid MongoDB ObjectId format (e.g. a malformed :id param that
  // slipped past route-level validation) — a client input problem, not
  // a server failure, so this is a 400 rather than falling through to 500.
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }

  // Invalid/expired JWT
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Invalid or expired token';
  }

  res.status(statusCode).json({
    success: false,
    message,
    // Stack trace only in development — never leak internals in production
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

const notFound = (req, res, next) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
};

module.exports = { errorHandler, notFound };