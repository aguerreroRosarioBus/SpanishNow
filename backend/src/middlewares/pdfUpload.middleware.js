const multer = require('multer');
const { MAX_PDF_BYTES } = require('../services/materialService');

// A single PDF in memory (field "file"), at most 20 MB. The content is checked by signature in the service, not by name or MIME.
// Errors are answered as JSON like the rest of the API.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PDF_BYTES, files: 1 } });

module.exports = (req, res, next) => {
  upload.single('file')(req, res, error => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'The file is larger than 20 MB' });
    res.status(error.statusCode || 400).json({ error: error.message });
  });
};
