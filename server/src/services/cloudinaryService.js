const cloudinary = require('../config/cloudinary');

/**
 * Cloudinary's SDK is stream/callback based; wrapping it in a Promise lets
 * the rest of the codebase use async/await consistently, same as every
 * other service (Mongoose, etc.) ā€” no mixed callback/promise style.
 */
const uploadBufferToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'finai/kyc-documents',
        resource_type: 'auto', // handles both images and PDFs correctly
        ...options
      },
      (error, result) => {
  if (error) {
    console.error('Cloudinary upload error:', JSON.stringify(error, null, 2));
    return reject(error);
  }
  resolve(result);
}
    );
    uploadStream.end(buffer);
  });
};

module.exports = { uploadBufferToCloudinary };