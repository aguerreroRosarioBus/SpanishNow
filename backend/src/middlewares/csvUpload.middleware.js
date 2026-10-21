const multer = require('multer');
const path = require('path');
const { MAX_BYTES } = require('../services/studentImport');

// A single CSV file in memory (field "file"), at most 2 MB. Errors are answered as JSON like the rest of the API.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const csvLike = ['.csv', '.txt'].includes(ext) || /csv|excel|text\/plain/.test(file.mimetype);
    if (csvLike) return cb(null, true);
    cb(Object.assign(new Error('Only CSV files are accepted'), { statusCode: 400 }));
  }
});

module.exports = (req, res, next) => {
  upload.single('file')(req, res, error => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'The file is larger than 2 MB' });
    res.status(error.statusCode || 400).json({ error: error.message });
  });
};
