// Proveedor de pruebas local. No contiene cliente HTTP ni SDK de Zoom.
// El disco representa al proveedor independiente: sobrevive al reinicio del worker.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const features = require('../config/features');
const { ZoomError, fail, hash } = require('./zoomAdapterCore');
function assertFake() {
  features.assertSafe();
  if (process.env.INTEGRATIONS_FAKE !== '1') fail('zoom_fake_required', 503);
}
async function store(account, fn) {
  assertFake();
  const dir = path.join(os.tmpdir(), 'spanishnow-zoom-fake', hash(`${process.env.DB_NAME}:${account}`));
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  // Exclusión entre procesos del proveedor fake; ninguna operación de red dentro.
  const lock = path.join(dir, 'lock');
  let handle;
  try { handle = await fs.open(lock, 'wx', 0o600); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    // Un worker terminado puede dejar el lock del proveedor fake en disco. Recuperar solo si murió su PID.
    let dead = false;
    try {
      const owner = Number(await fs.readFile(lock, 'utf8'));
      if (owner > 0) { try { process.kill(owner, 0); } catch (error) { if (error.code === 'ESRCH') dead = true; } }
      else dead = Date.now() - (await fs.stat(lock)).mtimeMs > 30000;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!dead) fail('zoom_busy', 503);
    try { await fs.unlink(lock); handle = await fs.open(lock, 'wx', 0o600); }
    catch { fail('zoom_busy', 503); }
  }
  await handle.writeFile(String(process.pid));
  try {
    let data;
    try { data = JSON.parse(await fs.readFile(path.join(dir, 'meetings.json'), 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; data = {}; }
    const result = await fn(data);
    const temporary = path.join(dir, `${crypto.randomUUID()}.json`);
    await fs.writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
    await fs.rename(temporary, path.join(dir, 'meetings.json'));
    return result;
  } finally { await handle.close(); await fs.unlink(lock); }
}
const fakeCapabilities = () => ({ plan: 'fake', maxMinutes: 120, maxParticipants: 100, concurrentMeetings: 1, waitingRoom: false, passcodeRequired: true });
function tokens(accountId, rotation = 0) {
  return { accountId, accessToken: `fake-access-${crypto.randomUUID()}`, refreshToken: `fake-refresh-${crypto.randomUUID()}`,
    rotation, expiresAt: new Date(Date.now() + 3600000).toISOString() };
}
module.exports = {
  ZoomError, fail, assertFake, hash,
  async issueAuthorization({ code, challenge, accountId }) {
    return store(accountId, data => { data[`oauth:${hash(code)}`] = { challenge, expiresAt: Date.now() + 600000 }; });
  },
  async authorize({ code, expectedCode, verifier, accountId }) {
    assertFake();
    if (!verifier || code !== expectedCode) fail('zoom_oauth_invalid', 400);
    if (!accountId) fail('zoom_oauth_invalid', 400);
    await store(accountId, data => {
      const key = `oauth:${hash(code)}`; const grant = data[key];
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
      if (!grant || grant.expiresAt <= Date.now() || grant.challenge !== challenge) fail('zoom_oauth_invalid', 400);
      delete data[key];
    });
    return { ...tokens(accountId), email: `docente-${accountId.slice(0, 8)}@zoom.invalid`,
      // Capacidades explícitas de la cuenta simulada, nunca una afirmación sobre licencias reales.
      capabilities: fakeCapabilities() };
  },
  async refresh(credentials) {
    assertFake();
    if (!credentials.refreshToken?.startsWith('fake-refresh-')) fail('zoom_revoked', 401);
    return { ...credentials, ...tokens(credentials.accountId, credentials.rotation + 1) };
  },
  async capabilities(credentials) { assertFake(); return fakeCapabilities(); },
  async find(credentials, correlationKey) {
    return store(credentials.accountId, data => Object.values(data).find(m => m.correlationKey === correlationKey) || null);
  },
  async create(credentials, wanted) {
    return store(credentials.accountId, data => {
      // El endpoint simulado NO es idempotente: el servicio debe reconciliar antes de llamar.
      const id = String(crypto.randomInt(100000000, 999999999));
      const meeting = { ...wanted, id, joinUrl: `https://zoom.us/j/${id}?pwd=${crypto.randomBytes(12).toString('hex')}`,
        // El simulador respeta la sala de espera pedida; ZOOM_FAKE_FORCE_WAITING_ROOM_OFF simula una cuenta que la bloquea.
        waitingRoom: wanted.settings?.waitingRoom === true && process.env.ZOOM_FAKE_FORCE_WAITING_ROOM_OFF !== '1' };
      data[id] = meeting; return meeting;
    });
  },
  async update(credentials, id, wanted) {
    return store(credentials.accountId, data => {
      if (!data[id]) fail('zoom_meeting_missing', 404);
      return (data[id] = { ...data[id], ...wanted,
        waitingRoom: wanted.settings?.waitingRoom === true && process.env.ZOOM_FAKE_FORCE_WAITING_ROOM_OFF !== '1' });
    });
  },
  async remove(credentials, id) { return store(credentials.accountId, data => { delete data[id]; }); },
  async host(credentials, id) {
    return store(credentials.accountId, data => {
      if (!data[id]) fail('zoom_meeting_missing', 404);
      return `https://zoom.us/s/${id}?zak=fake-${crypto.randomUUID()}`;
    });
  },
  async revoke() { assertFake(); }
};
