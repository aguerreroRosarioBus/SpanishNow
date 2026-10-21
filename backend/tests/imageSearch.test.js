jest.mock('node:dns', () => ({ promises: { lookup: jest.fn() } }));
jest.mock('node:https', () => ({ get: jest.fn() }));
jest.mock('../src/middlewares/auth.middleware', () => ({
  authMiddleware: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).end();
    req.user = { id: Number(req.headers['x-user'] || 7), role: req.headers.authorization === 'student' ? 'student' : 'teacher' }; next();
  },
  isTeacher: (req, res, next) => req.user.role === 'teacher' ? next() : res.status(403).end()
}));
const { EventEmitter } = require('node:events');
const dns = require('node:dns').promises;
const https = require('node:https');
const jwt = require('jsonwebtoken');
const express = require('express');
const request = require('supertest');
const images = require('../src/services/imageSearchService');
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const app = express();
app.use(express.json()); app.use('/api/images', require('../src/routes/imageSearch.routes'));
const result = { title: 'Casa', original: 'https://images.example.com/casa.png', thumbnail: 'https://images.example.com/thumb.png', link: 'https://example.com/casa' };
let originalFetch;
beforeEach(() => {
  originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ images_results: [result], serpapi_pagination: { next: 'next' } }) });
  process.env.SERPAPI_API_KEY = 'test-key'; process.env.JWT_SECRET = 'image-test-secret';
  delete process.env.GOOGLE_CSE_API_KEY; delete process.env.GOOGLE_CSE_ID;
  dns.lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]); https.get.mockReset();
});
afterEach(() => { global.fetch = originalFetch; delete process.env.SERPAPI_API_KEY; delete process.env.GOOGLE_CSE_API_KEY; delete process.env.GOOGLE_CSE_ID; });
async function token() { return (await images.searchImages('casa', 1, 7)).results[0].token; }
function remote({ status = 200, type = 'image/png', buffer = PNG, location, length } = {}) {
  https.get.mockImplementationOnce((url, options, callback) => {
    const req = new EventEmitter();
    queueMicrotask(() => {
      const res = new EventEmitter(); res.statusCode = status;
      res.headers = { 'content-type': type, location, 'content-length': length };
      res.resume = jest.fn(); res.destroy = jest.fn(); callback(res);
      if (status === 200) { res.emit('data', buffer); res.emit('end'); }
    }); return req;
  });
}
test('search and download require a teacher', async () => {
  expect((await request(app).get('/api/images/search?q=casa')).status).toBe(401);
  expect((await request(app).get('/api/images/search?q=casa').set('Authorization', 'student')).status).toBe(403);
  expect((await request(app).post('/api/images/import')).status).toBe(401);
  expect((await request(app).post('/api/images/import').set('Authorization', 'student')).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});
test('Google Images search uses SafeSearch, paging and signed user-bound results without exposing keys', async () => {
  const response = await request(app).get('/api/images/search?q=casa&page=2').set('Authorization', 'teacher');
  expect(response.status).toBe(200); expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toMatchObject({ page: 2, hasMore: true, results: [{ title: 'Casa', source: 'example.com' }] });
  const url = new URL(fetch.mock.calls[0][0]);
  expect(url.hostname).toBe('serpapi.com'); expect(url.searchParams.get('engine')).toBe('google_images');
  expect(url.searchParams.get('safe')).toBe('active'); expect(url.searchParams.get('ijn')).toBe('1');
  expect(JSON.stringify(response.body)).not.toContain('test-key');
  const selected = response.body.results[0].token;
  expect(images.readImageToken(selected, 7)).toBe(result.original);
  expect(() => images.readImageToken(selected, 8)).toThrow(/venció/);
  expect(() => images.readImageToken(selected + 'x', 7)).toThrow(/venció/);
});
test('expired and arbitrary tokens cannot download images', async () => {
  const expired = jwt.sign({ url: result.original, scope: 'image-download' }, process.env.JWT_SECRET, { audience: 'spanishnow-images', subject: '7', expiresIn: -1 });
  await expect(images.importImage(expired, 7)).rejects.toMatchObject({ status: 400 });
  await expect(images.importImage('https://example.com/x.png', 7)).rejects.toMatchObject({ status: 400 });
  expect(https.get).not.toHaveBeenCalled();
});
test('deduplicates image URLs and excludes results that cannot be downloaded safely', async () => {
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ images_results: [result, result, { ...result, original: 'https://127.0.0.1/private.png' }] }) });
  expect((await images.searchImages('casa', 1, 7)).results).toHaveLength(1);
});
test('Google Custom Search works as an alternative provider', async () => {
  delete process.env.SERPAPI_API_KEY; process.env.GOOGLE_CSE_API_KEY = 'google-key'; process.env.GOOGLE_CSE_ID = 'engine-id';
  fetch.mockResolvedValue({ ok: true, json: async () => ({ items: [{ title: 'Casa', link: result.original, image: { thumbnailLink: result.thumbnail, contextLink: result.link } }], queries: { nextPage: [{}] } }) });
  expect((await images.searchImages('casa', 3, 7)).results).toHaveLength(1);
  const url = new URL(fetch.mock.calls[0][0]); expect(url.searchParams.get('searchType')).toBe('image'); expect(url.searchParams.get('start')).toBe('21');
});
test('configuration, invalid input, empty results, quota and provider errors have clear responses', async () => {
  delete process.env.SERPAPI_API_KEY; await expect(images.searchImages('casa', 1, 7)).rejects.toMatchObject({ status: 503 });
  process.env.SERPAPI_API_KEY = 'key';
  for (const query of ['', '   ', 'a'.repeat(201), []]) await expect(images.searchImages(query, 1, 7)).rejects.toMatchObject({ status: 400 });
  for (const page of [0, -1, 1.1, 11, NaN]) await expect(images.searchImages('casa', page, 7)).rejects.toMatchObject({ status: 400 });
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
  expect(await images.searchImages('casa', 1, 7)).toEqual({ results: [], page: 1, hasMore: false });
  fetch.mockResolvedValueOnce({ status: 429 }); await expect(images.searchImages('casa', 1, 7)).rejects.toMatchObject({ status: 429 });
  fetch.mockRejectedValueOnce(new Error('private details')); await expect(images.searchImages('casa', 1, 7)).rejects.toMatchObject({ status: 502, message: expect.not.stringContaining('private') });
});
test.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.0.1', '100.64.0.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:7f00:1::'])('rejects internal/reserved IP %s', address => expect(images.publicAddress(address)).toBe(false));
test.each(['http://example.com/a.png', 'https://localhost/a', 'https://127.1/a', 'https://[::1]/a', 'https://example.com:444/a', 'https://user:pass@example.com/a', 'file:///x', 'data:image/png,x'])('rejects unsafe URL %s', url => expect(images.imageUrl(url)).toBeNull());
test('download returns actual image bytes and pins the validated DNS address', async () => {
  remote(); const response = await request(app).post('/api/images/import').set('Authorization', 'teacher').send({ token: await token() });
  expect(response.status).toBe(200); expect(response.headers['content-type']).toContain('image/png'); expect(response.body).toEqual(PNG);
  const callback = jest.fn(); https.get.mock.calls[0][1].lookup('ignored', {}, callback);
  expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
});
test('DNS cannot resolve to private IPs or mixed public/private answers', async () => {
  const selected = await token(); dns.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.2', family: 4 }]);
  await expect(images.importImage(selected, 7)).rejects.toMatchObject({ status: 400 }); expect(https.get).not.toHaveBeenCalled();
});
test('redirects cannot reach metadata or private DNS destinations', async () => {
  remote({ status: 302, location: 'https://169.254.169.254/latest' }); await expect(images.importImage(await token(), 7)).rejects.toMatchObject({ status: 400 });
  remote({ status: 302, location: 'https://private.example/a' });
  dns.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]).mockResolvedValueOnce([{ address: '192.168.1.2', family: 4 }]);
  await expect(images.importImage(await token(), 7)).rejects.toMatchObject({ status: 400 });
});
test('oversized, fake, non-image and unavailable remote files fail safely', async () => {
  const selected = await token();
  for (const [options, status] of [[{ length: 6 * 1024 * 1024 }, 413], [{ buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }, 413], [{ buffer: Buffer.from('<html>fake png</html>') }, 400], [{ type: 'image/svg+xml' }, 400], [{ status: 403 }, 502]]) {
    remote(options); await expect(images.importImage(selected, 7)).rejects.toMatchObject({ status });
  }
});
test('rate limit bounds paid searches per teacher', async () => {
  const responses = await Promise.all(Array.from({ length: 61 }, () => request(app).get('/api/images/search?q=casa').set('Authorization', 'teacher').set('x-user', '1001')));
  expect(responses.filter(r => r.status === 429)).toHaveLength(1); expect(responses.find(r => r.status === 429).headers['retry-after']).toBeDefined();
});
