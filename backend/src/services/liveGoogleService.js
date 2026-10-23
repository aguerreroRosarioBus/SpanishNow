const crypto = require('node:crypto');
const sequelize = require('../config/database');
const { GoogleConnection, ExternalConnection } = require('../models');
const { LiveError, fail, restoreBoard } = require('./liveBoard');

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.announcements',
  'https://www.googleapis.com/auth/drive.file'
];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const cookieName = 'spanishnow_google_state';
function encryptionKey() {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || '';
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32 || key.toString('base64') !== raw) fail('Falta configurar la clave de cifrado de Google en el servidor.', 503);
  return key;
}
function config() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  let redirect, frontend;
  try { redirect = new URL(process.env.GOOGLE_OAUTH_REDIRECT_URI); frontend = new URL(process.env.FRONTEND_URL); } catch { fail('La integración de Google todavía no está configurada.', 503); }
  for (const url of [redirect, frontend]) {
    const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:';
    if ((!local && url.protocol !== 'https:') || url.username || url.password) fail('La integración de Google requiere URLs HTTPS.', 503);
  }
  if (!clientId || !clientSecret) fail('La integración de Google todavía no está configurada.', 503);
  encryptionKey();
  return { clientId, clientSecret, redirect: redirect.href, frontend: frontend.origin, secure: redirect.protocol === 'https:' };
}
const configured = () => { try { config(); return true; } catch { return false; } };
function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
function decrypt(value) {
  try {
    const data = Buffer.from(value, 'base64');
    const cipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString());
  } catch { fail('No se pudo leer la conexión de Google. Vuelve a conectar la cuenta.', 401, 'integration_not_connected'); }
}
async function remote(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000), redirect: 'error' }); }
  catch { fail('Google no respondió. Intenta nuevamente.', 502); }
  if (!response.ok) {
    if (response.status === 400 && url === 'https://oauth2.googleapis.com/revoke') return response; // already revoked
    if (response.status === 400 && url === 'https://oauth2.googleapis.com/token') fail('La autorización de Google venció. Vuelve a conectar tu cuenta.', 401, 'integration_not_connected');
    if (response.status === 401) fail('La autorización de Google venció. Vuelve a conectar tu cuenta.', 401, 'integration_not_connected');
    if (response.status === 403) fail('Google rechazó el acceso. Revisa los permisos de tu cuenta y las APIs habilitadas.', 403);
    if (response.status === 404) fail('Google no encontró el archivo o la clase.', 404);
    if (response.status === 429) fail('Google alcanzó su límite de solicitudes. Intenta más tarde.', 429);
    fail('No se pudo completar la operación en Google.', 502);
  }
  return response;
}
async function status(userId) {
  const row = await GoogleConnection.findByPk(userId);
  return { configured: configured(), connected: Boolean(row?.credentials), email: row?.email || null };
}
async function connect(userId) {
  const c = config();
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  await GoogleConnection.upsert({ userId, oauthStateHash: hash(state), oauthVerifier: encrypt(verifier), oauthExpiresAt: new Date(Date.now() + 600000) });
  // First-party navigation avoids third-party cookies when the app and API are on different sites.
  const startUrl = new URL('start', c.redirect);
  startUrl.searchParams.set('state', state);
  return { url: startUrl.href };
}
async function start(state, res) {
  const c = config();
  if (typeof state !== 'string' || !/^[\w-]{43}$/.test(state)) fail('Autorización inválida.');
  const row = await GoogleConnection.findOne({ where: { oauthStateHash: hash(state) } });
  if (!row?.oauthVerifier || new Date(row.oauthExpiresAt).getTime() < Date.now()) fail('La autorización venció. Vuelve a conectar Google.', 400, 'integration_not_connected');
  const verifier = decrypt(row.oauthVerifier);
  res.cookie(cookieName, state, { httpOnly: true, secure: c.secure, sameSite: 'lax', path: '/api/live-classes/google/callback', maxAge: 600000 });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: c.clientId, redirect_uri: c.redirect, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256'
  }).toString();
  return url.href;
}
async function callback(req) {
  const c = config();
  const state = req.query.state;
  const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (typeof state !== 'string' || state.length > 100 || !cookie || hash(cookie) !== hash(state)) fail('La autorización de Google no coincide con este navegador.', 400);
  const pending = await sequelize.transaction(async transaction => {
    const row = await GoogleConnection.findOne({ where: { oauthStateHash: hash(state) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!row || !row.oauthVerifier || !row.oauthExpiresAt || new Date(row.oauthExpiresAt).getTime() < Date.now()) fail('La autorización venció. Vuelve a conectar Google.', 400, 'integration_not_connected');
    const result = { userId: row.userId, verifier: decrypt(row.oauthVerifier) };
    await row.update({ oauthStateHash: null, oauthVerifier: null, oauthExpiresAt: null }, { transaction });
    return result;
  });
  if (req.query.error) fail('No se otorgaron los permisos de Google.', 400);
  if (typeof req.query.code !== 'string' || req.query.code.length > 4096) fail('Código de autorización inválido.');
  const result = await (await remote('https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: c.redirect,
      grant_type: 'authorization_code', code: req.query.code, code_verifier: pending.verifier })
  })).json();
  if (!result.access_token || !result.refresh_token || !SCOPES.every(scope => (result.scope || '').split(' ').includes(scope))) fail('Debes autorizar Classroom y Drive para conectar la cuenta.', 400);
  const profile = await (await remote('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${result.access_token}` } })).json();
  await GoogleConnection.update({
    credentials: encrypt({ accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: Date.now() + (result.expires_in || 3600) * 1000 }),
    scopes: result.scope, email: typeof profile.email === 'string' ? profile.email.slice(0, 254) : null
  }, { where: { userId: pending.userId } });
}
async function accessToken(userId) {
  const c = config();
  // Serialize refreshes (also between replicas); credentials never leave the server.
  return sequelize.transaction(async transaction => {
    const row = await GoogleConnection.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!row?.credentials) fail('Conecta tu cuenta de Google primero.', 409, 'integration_not_connected');
    const credentials = decrypt(row.credentials);
    if (credentials.expiresAt > Date.now() + 60000) return credentials.accessToken;
    const result = await (await remote('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
      client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'refresh_token', refresh_token: credentials.refreshToken
    }) })).json();
    if (!result.access_token) fail('Vuelve a conectar tu cuenta de Google.', 401, 'integration_not_connected');
    credentials.accessToken = result.access_token; credentials.expiresAt = Date.now() + (result.expires_in || 3600) * 1000;
    if (result.refresh_token) credentials.refreshToken = result.refresh_token;
    await row.update({ credentials: encrypt(credentials) }, { transaction });
    return credentials.accessToken;
  });
}
async function api(userId, url, options = {}) {
  const token = await accessToken(userId);
  return (await remote(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } })).json();
}
async function disconnect(userId) {
  const row = await GoogleConnection.findByPk(userId);
  if (row?.credentials) {
    let credentials;
    try { credentials = decrypt(row.credentials); } catch (e) { if (!(e instanceof LiveError)) throw e; }
    // W07: si Calendar sigue conectado comparte el grant de Google; revocarlo lo dejaría sin acceso. Solo se borran los tokens locales.
    const calendarActive = await ExternalConnection.count({ where: { userId, provider: 'google_calendar', status: 'connected' } });
    if (credentials && !calendarActive) await remote('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token: credentials.refreshToken }) });
  }
  await GoogleConnection.destroy({ where: { userId } });
}
async function courses(userId, pageToken) {
  if (pageToken && (typeof pageToken !== 'string' || pageToken.length > 2000)) fail('Página inválida.');
  const url = new URL('https://classroom.googleapis.com/v1/courses');
  url.search = new URLSearchParams({ teacherId: 'me', courseStates: 'ACTIVE', pageSize: '100', ...(pageToken ? { pageToken } : {}) }).toString();
  const result = await api(userId, url);
  return { courses: (result.courses || []).map(c => ({ id: c.id, name: c.name, section: c.section || '', url: c.alternateLink })), nextPageToken: result.nextPageToken || null };
}
async function course(userId, courseId) {
  if (typeof courseId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(courseId)) fail('Clase de Classroom inválida.');
  // Verify teacher membership, not merely visibility as a student.
  await api(userId, `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}/teachers/me`);
  return api(userId, `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(courseId)}`);
}
async function announce(userId, live) {
  if (!live.classroomCourseId) fail('Selecciona una clase de Classroom primero.');
  const joinUrl = `${config().frontend}/live/join/${live.joinCode}`;
  return api(userId, `https://classroom.googleapis.com/v1/courses/${encodeURIComponent(live.classroomCourseId)}/announcements`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `${live.title}\nPizarra de la clase en vivo. Ingresa con tu cuenta de SpanishNow.`, state: 'PUBLISHED', materials: [{ link: { url: joinUrl, title: live.title } }] })
  });
}
const boardFile = live => ({ format: 'spanishnow-live-board', version: 1, title: live.title, exportedAt: new Date().toISOString(), board: live.board });
async function saveDrive(userId, live) {
  const boundary = `spanishnow_${crypto.randomBytes(12).toString('hex')}`;
  const metadata = { name: `${live.title}.spanishnow.json`, mimeType: 'application/json', appProperties: { spanishnowLiveBoard: '1' } };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(boardFile(live))}\r\n--${boundary}--`;
  const suffix = live.driveFileId ? `/${encodeURIComponent(live.driveFileId)}` : '';
  return api(userId, `https://www.googleapis.com/upload/drive/v3/files${suffix}?uploadType=multipart&fields=id,webViewLink,name`, {
    method: suffix ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
  });
}
async function driveFiles(userId, pageToken) {
  if (pageToken && (typeof pageToken !== 'string' || pageToken.length > 2000)) fail('Página inválida.');
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.search = new URLSearchParams({ q: "trashed = false and appProperties has { key='spanishnowLiveBoard' and value='1' }", pageSize: '50', orderBy: 'modifiedTime desc',
    fields: 'files(id,name,modifiedTime,webViewLink),nextPageToken', ...(pageToken ? { pageToken } : {}) }).toString();
  return api(userId, url);
}
async function loadDrive(userId, fileId) {
  if (typeof fileId !== 'string' || !/^[\w-]{1,128}$/.test(fileId)) fail('Archivo inválido.');
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
  const meta = await api(userId, `${base}?fields=appProperties,size,trashed`);
  if (meta.trashed || meta.appProperties?.spanishnowLiveBoard !== '1' || Number(meta.size) > 1600000) fail('Selecciona una pizarra de SpanishNow (máximo 1,6 MB).');
  const token = await accessToken(userId);
  const res = await remote(`${base}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  // Bound streamed data even when Google's metadata is stale.
  const chunks = []; let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > 1600000) { await res.body.cancel?.().catch(() => {}); fail('Archivo demasiado grande.', 400, 'live_board_too_large'); }
    chunks.push(Buffer.from(chunk));
  }
  let raw;
  try { raw = JSON.parse(Buffer.concat(chunks).toString()); } catch { fail('Archivo de pizarra inválido.'); }
  return restoreBoard(raw, userId);
}
module.exports = { SCOPES, cookieName, config, configured, encrypt, decrypt, status, connect, start, callback, accessToken, disconnect, courses, course, announce, boardFile, saveDrive, driveFiles, loadDrive };
