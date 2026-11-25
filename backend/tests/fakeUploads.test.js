// Local stand-in for Cloudinary (MEDIA_FAKE_UPLOADS): dev/E2E only, refused in production.
const fs = require('fs');
const path = require('path');
const request = require('supertest');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; jest.resetModules(); });

describe('fake uploads', () => {
  test('disabled by default: uploadFromBuffer is not replaced and canUpload follows the Cloudinary config', () => {
    delete process.env.MEDIA_FAKE_UPLOADS;
    delete process.env.CLOUDINARY_CLOUD_NAME;
    const cloudinary = require('../src/config/cloudinary');
    expect(cloudinary.canUpload()).toBe(false);
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    expect(cloudinary.canUpload()).toBe(true);
  });

  test('enabled: stores the file under uploads-dev and returns a relative URL that the app serves (A-02)', async () => {
    process.env.MEDIA_FAKE_UPLOADS = '1';
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3999';
    delete process.env.MEDIA_FAKE_BASE_URL;
    const cloudinary = require('../src/config/cloudinary');
    const fakeUploads = require('../src/config/fakeUploads');
    const result = await cloudinary.uploadFromBuffer(PNG, { folder: 'x' });
    expect(result.secure_url).toMatch(/^\/uploads-dev\/[0-9a-f-]{36}\.png$/);
    expect(result.secure_url).not.toMatch(/localhost|:\d{4}/);
    const file = path.join(fakeUploads.DIR, path.basename(result.secure_url));
    try {
      expect(cloudinary.canUpload()).toBe(true);
      const app = require('../src/app');
      const res = await request(app).get(result.secure_url);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/png/);
      expect(Buffer.from(res.body).equals(PNG)).toBe(true);
      expect(await fakeUploads.removeFake(result.secure_url)).toBe(true);
      expect(fs.existsSync(file)).toBe(false);
    } finally { fs.rmSync(file, { force: true }); }
  });

  test('MEDIA_FAKE_BASE_URL opts into absolute URLs, and removeFake accepts both forms', async () => {
    process.env.MEDIA_FAKE_UPLOADS = '1';
    process.env.NODE_ENV = 'test';
    process.env.MEDIA_FAKE_BASE_URL = 'http://localhost:3999/';
    const fakeUploads = require('../src/config/fakeUploads');
    const result = await fakeUploads.saveFake(PNG);
    expect(result.secure_url).toMatch(/^http:\/\/localhost:3999\/uploads-dev\/[0-9a-f-]{36}\.png$/);
    const file = path.join(fakeUploads.DIR, path.basename(result.secure_url));
    expect(fs.existsSync(file)).toBe(true);
    expect(await fakeUploads.removeFake(result.secure_url)).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(await fakeUploads.removeFake('/uploads-dev/not-a-uuid.png')).toBe(false);
  });

  test('the live board accepts the relative dev upload path only outside production', () => {
    const { safeUrl } = require('../src/services/liveBoard');
    const url = '/uploads-dev/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b.png';
    process.env.NODE_ENV = 'test';
    expect(safeUrl(url)).toBe(url);
    expect(() => safeUrl('/uploads-dev/../secret.png')).toThrow();
    expect(() => safeUrl(url, true)).toThrow();
    process.env.NODE_ENV = 'production';
    expect(() => safeUrl(url)).toThrow();
  });

  test('refuses to load in production, with either NODE_ENV or the Railway environment', () => {
    process.env.MEDIA_FAKE_UPLOADS = '1';
    process.env.NODE_ENV = 'production';
    expect(() => require('../src/config/cloudinary')).toThrow(/not allowed in production/);
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.RAILWAY_ENVIRONMENT = 'production';
    expect(() => require('../src/config/cloudinary')).toThrow(/not allowed in production/);
  });

  test('never serves /uploads-dev when disabled', async () => {
    delete process.env.MEDIA_FAKE_UPLOADS;
    const app = require('../src/app');
    expect((await request(app).get('/uploads-dev/anything.png')).status).toBe(404);
  });
});
