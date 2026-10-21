const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');
const jwt = require('jsonwebtoken');

const MAX_BYTES = 5 * 1024 * 1024;
const error = (status, message) => Object.assign(new Error(message), { status });
const secret = () => process.env.JWT_SECRET || 'your-secret-key';

function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 2, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
  }
  // Only global unicast IPv6; mapped IPv4, local, multicast and documentation ranges are excluded.
  return net.isIP(address) === 6 && /^[23]/i.test(address) && !/^2001:(?:0*:|db8:)/i.test(address) && !/^2002:/i.test(address);
}

function imageUrl(value) {
  try {
    if (typeof value !== 'string' || value.length > 4096) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
        (net.isIP(host) && !publicAddress(host))) return null;
    return url;
  } catch { return null; }
}

function signImage(url, userId) {
  return jwt.sign({ url, scope: 'image-download' }, secret(), {
    algorithm: 'HS256', subject: String(userId), audience: 'spanishnow-images', expiresIn: '15m'
  });
}

function readImageToken(token, userId) {
  try {
    if (typeof token !== 'string' || token.length > 10000) throw new Error();
    const payload = jwt.verify(token, secret(), { algorithms: ['HS256'], subject: String(userId), audience: 'spanishnow-images' });
    if (payload.scope !== 'image-download' || !imageUrl(payload.url)) throw new Error();
    return payload.url;
  } catch { throw error(400, 'La selección venció o no es válida. Busca la imagen nuevamente.'); }
}

async function searchImages(query, page, userId) {
  if (typeof query !== 'string' || !query.trim() || query.trim().length > 200) {
    throw error(400, 'Escribe una búsqueda de entre 1 y 200 caracteres.');
  }
  if (!Number.isInteger(page) || page < 1 || page > 10) throw error(400, 'Página de búsqueda no válida.');
  let url;
  const serp = process.env.SERPAPI_API_KEY;
  if (serp) {
    url = new URL('https://serpapi.com/search.json');
    url.search = new URLSearchParams({ engine: 'google_images', q: query.trim(), api_key: serp,
      hl: 'es', safe: 'active', ijn: String(page - 1) }).toString();
  } else if (process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ID) {
    url = new URL('https://www.googleapis.com/customsearch/v1');
    url.search = new URLSearchParams({ key: process.env.GOOGLE_CSE_API_KEY, cx: process.env.GOOGLE_CSE_ID,
      q: query.trim(), searchType: 'image', safe: 'active', num: '10', start: String((page - 1) * 10 + 1) }).toString();
  } else {
    throw error(503, 'La búsqueda de imágenes aún no está configurada. Contacta al administrador.');
  }
  let response, data;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (response.status === 429) throw error(429, 'Se alcanzó el límite del buscador. Inténtalo más tarde.');
    if (!response.ok) throw new Error();
    data = await response.json();
    if (data.error) throw new Error();
  } catch (e) {
    if (e.status) throw e;
    throw error(502, 'No se pudo consultar Google Imágenes. Inténtalo de nuevo.');
  }
  const raw = serp ? data.images_results || [] : data.items || [];
  const seen = new Set();
  const results = raw.slice(0, 100).flatMap(item => {
    const original = imageUrl(serp ? item.original : item.link);
    const thumb = imageUrl(serp ? item.thumbnail : item.image?.thumbnailLink);
    const source = imageUrl(serp ? item.link : item.image?.contextLink);
    if (!original || !thumb || seen.has(original.href)) return [];
    seen.add(original.href);
    return [{ title: String(item.title || 'Imagen').slice(0, 300), thumbnailUrl: thumb.href,
      sourceUrl: source?.href || null, source: source?.hostname || original.hostname,
      token: signImage(original.href, userId) }];
  });
  const hasMore = page < 10 && Boolean(serp ? data.serpapi_pagination?.next || data.pagination?.next : data.queries?.nextPage?.length);
  return { results, page, hasMore };
}

// Pin the checked DNS address to the socket. Redirects repeat validation to prevent SSRF and DNS rebinding.
async function download(url, signal, redirects = 0) {
  const parsed = imageUrl(url);
  if (!parsed) throw error(400, 'La dirección de esta imagen no está permitida.');
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  const addresses = await dns.lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw error(400, 'La dirección de esta imagen no está permitida.');
  signal.throwIfAborted();
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.get(parsed, { signal, headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif' },
      lookup: (_host, options, callback) => options.all ? callback(null, [address]) : callback(null, address.address, address.family)
    }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        if (redirects >= 3 || !res.headers.location) return reject(error(502, 'La imagen redirige demasiadas veces. Elige otra.'));
        let target;
        try { target = new URL(res.headers.location, parsed).href; } catch { return reject(error(502, 'La imagen no está disponible.')); }
        download(target, signal, redirects + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(error(502, 'No se pudo descargar esta imagen. Elige otra.')); return; }
      const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) {
        res.destroy(); reject(error(400, 'Elige una imagen PNG, JPG, WebP o GIF.')); return;
      }
      if (Number(res.headers['content-length']) > MAX_BYTES) { res.destroy(); reject(error(413, 'La imagen supera los 5 MB. Elige otra.')); return; }
      const chunks = [];
      let bytes = 0;
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) { res.destroy(); reject(error(413, 'La imagen supera los 5 MB. Elige otra.')); }
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), type }));
    });
    req.on('error', reject);
  });
}

function detectedType(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString())) return 'image/gif';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

async function importImage(token, userId) {
  const url = readImageToken(token, userId);
  try {
    const result = await download(url, AbortSignal.timeout(15000));
    if (detectedType(result.buffer) !== result.type) throw error(400, 'El archivo no es una imagen válida. Elige otra.');
    return result;
  } catch (e) {
    if (e.status) throw e;
    throw error(502, 'No se pudo descargar esta imagen. Elige otra o vuelve a intentarlo.');
  }
}

module.exports = { searchImages, importImage, publicAddress, imageUrl, readImageToken, detectedType };
