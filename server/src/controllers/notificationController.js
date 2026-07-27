const Notification = require('../models/Notification');
const { ApiError, asyncHandler, sendSuccess } = require('../utils/apiResponse');
 
/**
 * @route   GET /api/notifications
 * @access  Private — always scoped to the logged-in user's own notifications
 */
const getMyNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });
  sendSuccess(res, 200, { notifications }, 'Notifications fetched');
});
 
/**
 * @route   PATCH /api/notifications/:id/read
 * @access  Private — only the owning user can mark their own notification read
 */
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);
  if (!notification) {
    throw new ApiError(404, 'Notification not found');
  }
  if (notification.user.toString() !== req.user._id.toString()) {
    throw new ApiError(403, 'Not authorized to modify this notification');
  }
 
  notification.isRead = true;
  await notification.save();
 
  sendSuccess(res, 200, { notification }, 'Notification marked as read');
});
 
module.exports = { getMyNotifications, markAsRead };
 