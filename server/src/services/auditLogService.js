const AuditLog = require('../models/AuditLog');

/**
 * Single entry point for writing audit logs. Why a wrapper instead of
 * calling AuditLog.create() directly everywhere? So the shape of an
 * audit entry stays consistent across every module (loan decisions,
 * user status changes, etc.) — a schema change here doesn't require
 * hunting down every controller that logs something.
 */
const logAction = async ({ userId, action, targetType, targetId, metadata = {}, req = null }) => {
  try {
    await AuditLog.create({
      user: userId,
      action,
      targetType,
      targetId,
      metadata,
      ipAddress: req?.ip
    });
  } catch (err) {
    // An audit log failure should never break the actual business
    // operation (e.g. a loan approval) — log to console and move on.
    console.error('Audit log write failed:', err.message);
  }
};

module.exports = { logAction };