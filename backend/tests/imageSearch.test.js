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
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
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
  delete process.env.PIXABAY_API_KEY;
  dns.lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]); https.get.mockReset();
});
afterEach(() => { global.fetch = originalFetch; delete process.env.SERPAPI_API_KEY; delete process.env.GOOGLE_CSE_API_KEY; delete process.env.GOOGLE_CSE_ID; delete process.env.PIXABAY_API_KEY; });
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
  expect(await images.searchImages('casa', 1, 7)).toEqual({ results: [], page: 1, hasMore: false, provider: 'google' });
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

describe('Pixabay', () => {
  let cache;
  const hit = { tags: 'casa, hogar', user: 'Ilustrador', pageURL: 'https://pixabay.com/illustrations/casa-123/',
    largeImageURL: 'https://cdn.pixabay.com/photo/casa.png', previewURL: 'https://cdn.pixabay.com/photo/casa_150.png' };
  beforeEach(async () => {
    cache = await fs.mkdtemp(path.join(os.tmpdir(), 'spanishnow-images-'));
    process.env.IMAGE_SEARCH_CACHE_DIR = cache;
    process.env.PIXABAY_API_KEY = 'pixabay-private-key';
    fetch.mockResolvedValue({ ok: true, json: async () => ({ hits: [hit], totalHits: 45 }) });
  });
  afterEach(async () => { delete process.env.IMAGE_SEARCH_CACHE_DIR; await fs.rm(cache, { recursive: true, force: true }); });
  test('takes precedence, searches safely in Spanish and returns attribution without credentials', async () => {
    const response = await request(app).get('/api/images/search?q=casa&page=2').set('Authorization', 'teacher');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ provider: 'pixabay', page: 2, hasMore: true, results: [{ title: hit.tags, source: 'Pixabay · Ilustrador', sourceUrl: hit.pageURL }] });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://pixabay.com/api/');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ q: 'casa', key: 'pixabay-private-key', page: '2', per_page: '20', lang: 'es', safesearch: 'true', image_type: 'all' });
    expect(JSON.stringify(response.body)).not.toContain('pixabay-private-key');
    expect(images.readImageToken(response.body.results[0].token, 7)).toBe(hit.largeImageURL);
    expect((await images.searchImages('casa', 3, 7)).hasMore).toBe(false);
  });
  test('shares cached provider data across teachers while signing separate user-bound tokens', async () => {
    const results = await Promise.all([7, 8, 9].map(user => images.searchImages('casa', 1, user)));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(images.readImageToken(results[1].results[0].token, 8)).toBe(hit.largeImageURL);
    expect(() => images.readImageToken(results[0].results[0].token, 8)).toThrow(/venció/);
    const saved = await fs.readFile(path.join(cache, (await fs.readdir(cache))[0]), 'utf8');
    expect(saved).not.toContain('pixabay-private-key'); expect(saved).not.toContain('image-download');
  });
  test('persists searches across module restarts and refreshes only after 24 hours', async () => {
    await images.searchImages('casa', 1, 7);
    let restarted;
    jest.isolateModules(() => { restarted = require('../src/services/imageSearchService'); });
    await restarted.searchImages('casa', 1, 8); expect(fetch).toHaveBeenCalledTimes(1);
    const file = path.join(cache, (await fs.readdir(cache))[0]); const entry = JSON.parse(await fs.readFile(file, 'utf8'));
    entry.createdAt -= 24 * 60 * 60 * 1000 + 1;
    await fs.writeFile(file, JSON.stringify(entry));
    await images.searchImages('casa', 1, 7); expect(fetch).toHaveBeenCalledTimes(2);
  });
  test('separates cache entries by query, page and API key', async () => {
    await images.searchImages('casa', 1, 7); await images.searchImages('casa', 2, 7);
    await images.searchImages('árbol', 1, 7); process.env.PIXABAY_API_KEY = 'another-key';
    await images.searchImages('casa', 1, 7); expect(fetch).toHaveBeenCalledTimes(4);
  });
  test('caches empty results and rejects oversized queries without spending quota', async () => {
    await expect(images.searchImages('a'.repeat(101), 1, 7)).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValue({ ok: true, json: async () => ({ hits: [], totalHits: 0 }) });
    expect(await images.searchImages('sin resultados', 1, 7)).toMatchObject({ results: [], hasMore: false });
    await images.searchImages('sin resultados', 1, 8); expect(fetch).toHaveBeenCalledTimes(1);
  });
  test('does not cache quota, authorization or malformed responses and permits retry', async () => {
    for (const [response, status] of [[{ status: 429 }, 429], [{ status: 403 }, 503], [{ ok: true, json: async () => ({ hits: 'invalid' }) }, 502]]) {
      fetch.mockResolvedValueOnce(response);
      await expect(images.searchImages('casa', 1, 7)).rejects.toMatchObject({ status });
      expect(await fs.readdir(cache)).toEqual([]);
    }
    expect((await images.searchImages('casa', 1, 7)).results).toHaveLength(1);
  });
  test('imports the selected image through the existing validated download flow', async () => {
    const selected = (await images.searchImages('casa', 1, 7)).results[0]; remote();
    const downloaded = await images.importImage(selected.token, 7);
    expect(downloaded).toEqual({ buffer: PNG, type: 'image/png' });
    expect(https.get.mock.calls[0][0].href).toBe(hit.largeImageURL);
  });
});
