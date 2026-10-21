// Local stand-in for Cloudinary, for development and E2E only.
// Enabled with MEDIA_FAKE_UPLOADS=1 and never in production: the process refuses to start if both are set.
// Files are written to backend/uploads-dev/ (gitignored) and served at /uploads-dev (see src/app.js).
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DIR = path.join(__dirname, '..', '..', 'uploads-dev');
const enabled = () => process.env.MEDIA_FAKE_UPLOADS === '1';
const isProduction = () => process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT);

function assertSafe() {
  if (enabled() && isProduction()) {
    throw new Error('MEDIA_FAKE_UPLOADS=1 is not allowed in production; unset it');
  }
}

// The extension comes from the file's own signature, never from user-supplied names.
function extensionOf(buffer) {
  const head = buffer.subarray(0, 16);
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return '.jpg';
  if (head.subarray(0, 4).toString('latin1') === 'GIF8') return '.gif';
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp';
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WAVE') return '.wav';
  if (head.subarray(0, 4).toString('latin1') === 'OggS') return '.ogg';
  if (head.subarray(0, 3).toString('latin1') === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return '.mp3';
  return '.bin';
}

function baseUrl() {
  return (process.env.MEDIA_FAKE_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
}

/** Same contract as cloudinary.uploadFromBuffer: resolves { secure_url }. */
async function saveFake(buffer) {
  assertSafe();
  await fs.promises.mkdir(DIR, { recursive: true });
  const name = `${randomUUID()}${extensionOf(buffer)}`;
  await fs.promises.writeFile(path.join(DIR, name), buffer);
  return { secure_url: `${baseUrl()}/uploads-dev/${name}` };
}

module.exports = { DIR, enabled, assertSafe, saveFake, extensionOf };
