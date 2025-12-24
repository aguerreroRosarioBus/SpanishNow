const multer = require('multer');
const path = require('path');

// Configure multer for local storage (temporary, before uploading to Cloudinary)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedAudioTypes = /mp3|wav|ogg|m4a/;
  const allowedImageTypes = /jpg|jpeg|png|gif/;
  const allowedDocTypes = /pdf/;

  const extname = allowedAudioTypes.test(path.extname(file.originalname).toLowerCase()) ||
                  allowedImageTypes.test(path.extname(file.originalname).toLowerCase()) ||
                  allowedDocTypes.test(path.extname(file.originalname).toLowerCase());

  const mimetype = file.mimetype.startsWith('audio/') ||
                   file.mimetype.startsWith('image/') ||
                   file.mimetype === 'application/pdf';

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only audio, image, and PDF files are allowed'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: fileFilter
});

module.exports = upload;
