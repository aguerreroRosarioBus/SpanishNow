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
  const allowedAudioTypes = /mp3|wav|ogg|m4a|mpeg|webm|aac|flac/;
  const allowedImageTypes = /jpg|jpeg|png|gif|webp|svg/;
  const allowedDocTypes = /pdf/;

  const ext = path.extname(file.originalname).toLowerCase();
  const isAudioExt = allowedAudioTypes.test(ext);
  const isImageExt = allowedImageTypes.test(ext);
  const isDocExt = allowedDocTypes.test(ext);

  const isAudioMime = file.mimetype.startsWith('audio/') || file.mimetype === 'video/mp4';
  const isImageMime = file.mimetype.startsWith('image/');
  const isDocMime = file.mimetype === 'application/pdf';

  // Aceptar si es audio, imagen o PDF
  if ((isAudioExt || isAudioMime) || (isImageExt || isImageMime) || (isDocExt || isDocMime)) {
    cb(null, true);
  } else {
    console.error(`File rejected - Name: ${file.originalname}, MIME: ${file.mimetype}, Ext: ${ext}`);
    cb(new Error(`File type not allowed: ${file.originalname} (${file.mimetype}). Allowed: audio, image, PDF`));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
  fileFilter: fileFilter
});

module.exports = upload;
