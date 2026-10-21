// Downloadable PDFs. Rules:
//  - only PDF, at most 20 MB, checked by the %PDF- signature
//  - the stored location (fileUrl) never leaves the server: students get a short-lived link from downloadUrl()
//  - Cloudinary: raw resource with type "authenticated" (no public URL); the link is an API download URL signed with an expiry
//  - local development (MEDIA_FAKE_UPLOADS=1): the file lives under uploads-dev and its URL is returned as is
const { randomUUID } = require('crypto');
const cloudinary = require('../config/cloudinary');
const fakeUploads = require('../config/fakeUploads');

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TTL_SECONDS = 300;
const FOLDER = 'spanishnow/materials';

class MaterialError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const isPdf = buffer => Buffer.isBuffer(buffer) && buffer.length > 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';

/** What a client may see of a material. No fileUrl, no providerPublicId. */
const present = material => ({
  id: material.id,
  courseId: material.courseId,
  unitId: material.unitId,
  storyId: material.storyId,
  title: material.title,
  sizeBytes: material.sizeBytes,
  order: material.order
});

/** Validates the buffer and stores it. Returns { fileUrl, providerPublicId, sizeBytes }. */
async function storePdf(buffer) {
  if (!isPdf(buffer)) throw new MaterialError(400, 'The file is not a PDF');
  if (buffer.length > MAX_PDF_BYTES) throw new MaterialError(413, 'The file is larger than 20 MB');
  if (!cloudinary.canUpload()) throw new MaterialError(503, 'File storage is not configured');
  if (fakeUploads.enabled()) {
    const result = await fakeUploads.saveFake(buffer);
    return { fileUrl: result.secure_url, providerPublicId: null, sizeBytes: buffer.length };
  }
  const result = await cloudinary.uploadFromBuffer(buffer, {
    resource_type: 'raw',
    type: 'authenticated',
    public_id: `${FOLDER}/${randomUUID()}.pdf`, // raw assets keep the extension in their public id
    overwrite: false
  });
  return { fileUrl: result.secure_url, providerPublicId: result.public_id, sizeBytes: buffer.length };
}

/** Name the browser proposes when saving: the title, safe for a header and a file system. */
function filenameFor(material) {
  const base = String(material.title).normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ._-]+/g, '').replace(/\s+/g, ' ').trim().replace(/\.pdf$/i, '').slice(0, 120);
  return `${base || 'material'}.pdf`;
}

/** Short-lived download link: { url, filename }. */
function downloadUrl(material, { now = Date.now() } = {}) {
  const filename = filenameFor(material);
  if (!material.providerPublicId) return { url: material.fileUrl, filename }; // local stand-in (uploads-dev)
  const expiresAt = Math.floor(now / 1000) + DOWNLOAD_TTL_SECONDS;
  const url = cloudinary.utils.private_download_url(material.providerPublicId, undefined, {
    resource_type: 'raw', type: 'authenticated', expires_at: expiresAt
  });
  return { url, filename };
}

/** Removes the file from the provider. Best effort: a failure is logged and never blocks the caller. */
async function removeFile(material) {
  try {
    if (material.providerPublicId) {
      if (!fakeUploads.enabled()) await cloudinary.uploader.destroy(material.providerPublicId, { resource_type: 'raw', type: 'authenticated', invalidate: true });
    } else if (material.fileUrl) {
      await fakeUploads.removeFake(material.fileUrl);
    }
  } catch (error) {
    console.warn(`Could not delete the file of material ${material.id}: ${error.message}`);
  }
}

/** Removes the provider files of every material matching `where` (call it before deleting the course, unit or story that owns them). */
async function removeFilesWhere(where) {
  const { Material } = require('../models');
  for (const material of await Material.findAll({ where })) await removeFile(material);
}

module.exports = { MaterialError, MAX_PDF_BYTES, DOWNLOAD_TTL_SECONDS, isPdf, present, storePdf, filenameFor, downloadUrl, removeFile, removeFilesWhere };
