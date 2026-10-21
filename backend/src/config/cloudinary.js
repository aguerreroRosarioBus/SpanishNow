const cloudinary = require('cloudinary').v2;
const fakeUploads = require('./fakeUploads');

// Refuses to boot in production with the local stand-in enabled.
fakeUploads.assertSafe();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper function to upload from memory buffer
cloudinary.uploadFromBuffer = (buffer, options = {}) => {
  if (fakeUploads.enabled()) return fakeUploads.saveFake(buffer);
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    }).end(buffer);
  });
};

// True when uploads can work: real Cloudinary credentials or the local stand-in.
cloudinary.canUpload = () => Boolean(process.env.CLOUDINARY_CLOUD_NAME) || fakeUploads.enabled();

module.exports = cloudinary;
