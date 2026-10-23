const express = require('express');
const multer = require('multer');
const { authMiddleware, isTeacher } = require('../middlewares/auth.middleware');
const live = require('../services/liveClassService');
const google = require('../services/liveGoogleService');
const { LiveError, fail } = require('../services/liveBoard');
const { LIVE, errorBody, withErrorCodes } = require('../services/errorCodes');
const cloudinary = require('../config/cloudinary');
const { detectedType } = require('../services/imageSearchService');
const router = express.Router();
router.use(withErrorCodes(LIVE));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } });
const run = handler => async (req, res) => {
  try { await handler(req, res); }
  catch (e) {
    if (e instanceof LiveError) return res.status(e.status).json(errorBody(LIVE, e.message, e.status));
    if (e instanceof multer.MulterError) return res.status(400).json({ error: 'Selecciona una imagen de hasta 5 MB.', code: 'validation_failed' });
    console.error('Live class request failed:', e.name);
    res.status(500).json({ error: 'No se pudo completar la operación de la clase.' });
  }
};
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/google/start', run(async (req, res) => {
  res.set('Referrer-Policy', 'no-referrer');
  res.redirect(await google.start(req.query.state, res));
}));
// OAuth returns from Google without the app's Authorization header; state + PKCE + an HttpOnly cookie bind it to the initiating browser.
router.get('/google/callback', async (req, res) => {
  res.set('Referrer-Policy', 'no-referrer');
  let frontend;
  try { frontend = google.config().frontend; } catch { return res.status(503).send('La integración de Google todavía no está configurada.'); }
  try {
    await google.callback(req);
    res.clearCookie(google.cookieName, { path: '/api/live-classes/google/callback', httpOnly: true, sameSite: 'lax', secure: google.config().secure });
    res.redirect(`${frontend}/live?google=connected`);
  } catch { res.redirect(`${frontend}/live?google=error`); }
});
router.use(authMiddleware);
router.get('/google/status', isTeacher, run(async (req, res) => res.json(await google.status(req.user.id))));
router.post('/google/connect', isTeacher, run(async (req, res) => res.json(await google.connect(req.user.id, res))));
router.delete('/google/connection', isTeacher, run(async (req, res) => { await google.disconnect(req.user.id); res.status(204).end(); }));
router.get('/google/courses', isTeacher, run(async (req, res) => res.json(await google.courses(req.user.id, req.query.pageToken))));
router.get('/google/drive-files', isTeacher, run(async (req, res) => res.json(await google.driveFiles(req.user.id, req.query.pageToken))));
router.get('/', run(async (req, res) => res.json(await live.list(req.user))));
router.post('/', isTeacher, run(async (req, res) => res.status(201).json(await live.create(req.user, req.body))));
router.post('/join', run(async (req, res) => res.json(await live.join(req.user, req.body.code))));
router.get('/:id', run(async (req, res) => res.json(await live.snapshot(req.user, await live.load(req.user, req.params.id), req.query.since))));
router.post('/:id/presence', run(async (req, res) => { await live.heartbeat(req.user, await live.load(req.user, req.params.id)); res.status(204).end(); }));
router.patch('/:id', isTeacher, run(async (req, res) => res.json(await live.settings(req.user, req.params.id, req.body))));
router.post('/:id/operations', run(async (req, res) => res.json(await live.change(req.user, req.params.id, req.body.operations))));
router.post('/:id/images', run(async (req, res) => {
  const room = await live.load(req.user, req.params.id);
  live.editable(room, room.teacherId === req.user.id && req.user.role === 'teacher');
  await new Promise((resolve, reject) => upload.single('image')(req, res, e => e ? reject(e) : resolve()));
  if (!req.file || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(req.file.mimetype) || detectedType(req.file.buffer) !== req.file.mimetype) fail('Usa una imagen PNG, JPG, WebP o GIF válida de hasta 5 MB.');
  if (!cloudinary.canUpload()) fail('El almacenamiento de imágenes todavía no está configurado.', 503);
  let result;
  try { result = await cloudinary.uploadFromBuffer(req.file.buffer, { folder: `spanishnow/live/${room.id}`, resource_type: 'image' }); } catch { fail('No se pudo guardar la imagen.', 502); }
  if (!result?.secure_url) fail('No se pudo guardar la imagen.', 502);
  res.status(201).json({ url: result.secure_url });
}));
router.post('/:id/classroom', isTeacher, run(async (req, res) => res.json(await live.linkClassroom(req.user, req.params.id, req.body.courseId))));
router.post('/:id/classroom/announce', isTeacher, run(async (req, res) => res.json(await live.announce(req.user, req.params.id))));
router.post('/:id/drive', isTeacher, run(async (req, res) => res.json(await live.saveDrive(req.user, req.params.id))));
router.post('/:id/drive/restore', isTeacher, run(async (req, res) => res.json(await live.restore(req.user, req.params.id, req.body.fileId, req.body.expectedRevision))));
module.exports = router;
