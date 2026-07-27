const multer = require('multer');
const { ApiError } = require('../utils/apiResponse');

/**
 * Why memoryStorage instead of diskStorage?
 * We never need the file on our own disk long-term — it goes straight to
 * Cloudinary. Keeping it in memory as a Buffer avoids writing/cleaning up
 * temp files on the server, which matters on ephemeral hosting (Render,
 * Railway) where local disk isn't persistent anyway.
 */
const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — KYC docs are scans/photos, not large files

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new ApiError(400, `Unsupported file type: ${file.mimetype}. Allowed: JPG, PNG, WEBP, PDF`));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES }
});

module.exports = upload;