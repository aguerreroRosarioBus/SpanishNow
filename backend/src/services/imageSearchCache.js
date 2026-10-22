const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const TTL = 24 * 60 * 60 * 1000;
const pending = new Map();
const cleaned = new Map();

async function prune(directory) {
  if (Date.now() - (cleaned.get(directory) || 0) < 60000) return;
  cleaned.set(directory, Date.now());
  for (const name of await fs.readdir(directory)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const file = path.join(directory, name);
    try { if (Date.now() - (await fs.stat(file)).mtimeMs >= TTL) await fs.unlink(file); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}

/** Cache provider data, never teacher-bound selection tokens. Persists across restarts. */
async function cachedSearch(key, load) {
  const directory = process.env.IMAGE_SEARCH_CACHE_DIR || path.resolve(__dirname, '../../tmp/image-search-cache');
  const file = path.join(directory, crypto.createHash('sha256').update(key).digest('hex') + '.json');
  if (pending.has(file)) return pending.get(file);
  const work = (async () => {
    try {
      const entry = JSON.parse(await fs.readFile(file, 'utf8'));
      if (entry && entry.data !== undefined && Number.isFinite(entry.createdAt) && Date.now() >= entry.createdAt && Date.now() - entry.createdAt < TTL) return entry.data;
    } catch (e) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await prune(directory);
    const data = await load();
    const temporary = file + '.' + crypto.randomUUID() + '.tmp';
    try {
      await fs.writeFile(temporary, JSON.stringify({ createdAt: Date.now(), data }), { mode: 0o600 });
      await fs.rename(temporary, file);
    } finally { await fs.unlink(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
    return data;
  })();
  pending.set(file, work);
  try { return await work; } finally { pending.delete(file); }
}

module.exports = { cachedSearch };
