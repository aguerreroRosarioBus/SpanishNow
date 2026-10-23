// Adaptador falso y determinista de Google Calendar: sin red ni cuentas reales. Estado en memoria del proceso.
// Los ganchos (set*, touch, removeExternally...) los usan las pruebas para simular fallos y cambios externos.
const { IntegrationError } = require('../externalConnections');

const store = {};
function reset() {
  Object.assign(store, {
    events: new Map(), seq: 0, tokenSeq: 0, validTokens: new Set(), revoked: false, busy: {}, failures: [], calls: {}, channels: new Map(),
    calendars: [
      { id: 'primary', summary: 'Calendario principal', primary: true, accessRole: 'owner' },
      { id: 'clases@example.test', summary: 'Clases', primary: false, accessRole: 'owner' },
      { id: 'personal@example.test', summary: 'Personal', primary: false, accessRole: 'reader' }
    ],
    delayMs: 0
  });
}
reset();

const err = (status, code, flags = {}) => new IntegrationError(status, code, {}, flags);
async function enter(op, { auth } = {}) {
  store.calls[op] = (store.calls[op] || 0) + 1;
  if (store.delayMs) await new Promise(resolve => setTimeout(resolve, store.delayMs));
  const i = store.failures.findIndex(f => f.op === op);
  if (i >= 0) { const [f] = store.failures.splice(i, 1); throw f.error; }
  if (auth !== undefined) {
    if (store.revoked) throw err(401, 'authorization_revoked', { needsAttention: true });
    if (!store.validTokens.has(auth)) throw err(401, 'authorization_revoked', { needsAttention: true });
  }
}
const issueToken = () => { const token = `fake-at-${++store.tokenSeq}`; store.validTokens.add(token); return token; };
const keyOf = (calendarId, id) => `${calendarId}/${id}`;
const touch = (calendarId, event) => { event.seq = ++store.seq; event.etag = `"fake-${event.seq}"`; store.events.set(keyOf(calendarId, event.id), event); return event; };
const clone = event => event && structuredClone({ ...event, calendarId: undefined });

module.exports = {
  // ---- ganchos de prueba
  reset,
  failNext: (op, error) => store.failures.push({ op, error }),
  setBusy: (calendarId, intervals) => { store.busy[calendarId] = intervals; },
  setDelay: ms => { store.delayMs = ms; },
  revokeAuthorization: (value = true) => { store.revoked = value; },
  calls: () => ({ ...store.calls }),
  events: () => [...store.events.entries()].map(([k, e]) => ({ key: k, ...structuredClone(e) })),
  eventCount: calendarId => [...store.events.entries()].filter(([k, e]) => k.startsWith(`${calendarId}/`) && !e.cancelled).length,
  /** Cambio hecho "desde Google" por la persona: mueve el evento (nueva hora) o lo borra. */
  editExternally(calendarId, id, patch) { const e = store.events.get(keyOf(calendarId, id)); touch(calendarId, Object.assign(e, patch)); },
  removeExternally(calendarId, id) { const e = store.events.get(keyOf(calendarId, id)); touch(calendarId, Object.assign(e, { cancelled: true })); },
  channels: () => [...store.channels.values()],

  // ---- interfaz
  authUrl({ state, redirectUri }) {
    const url = new URL(redirectUri);
    url.searchParams.set('state', state); url.searchParams.set('code', 'fake-code');
    return url.href;
  },
  async exchangeCode({ code }) {
    await enter('exchangeCode');
    if (code !== 'fake-code') throw err(400, 'oauth_code_invalid');
    return { accessToken: issueToken(), refreshToken: 'fake-refresh', expiresIn: 3600, scopes: require('./index').SCOPES.join(' '), accountEmail: 'calendar-fake@example.test' };
  },
  async refresh(refreshToken) {
    await enter('refresh');
    if (store.revoked || refreshToken !== 'fake-refresh') throw err(400, 'authorization_revoked', { needsAttention: true });
    return { accessToken: issueToken(), expiresIn: store.tokenTtl ?? 3600 };
  },
  async revoke() { await enter('revoke'); store.validTokens.clear(); },
  async listCalendars(token) { await enter('listCalendars', { auth: token }); return structuredClone(store.calendars); },
  async freeBusy(token, { calendarIds, timeMin, timeMax }) {
    await enter('freeBusy', { auth: token });
    const from = Date.parse(timeMin), to = Date.parse(timeMax);
    return calendarIds.flatMap(id => store.busy[id] || []).filter(b => Date.parse(b.start) < to && Date.parse(b.end) > from)
      .map(({ start, end }) => ({ start, end }));
  },
  async getEvent(token, calendarId, id) {
    await enter('getEvent', { auth: token });
    return clone(store.events.get(keyOf(calendarId, id)) || null);
  },
  async insertEvent(token, calendarId, event) {
    await enter('insertEvent', { auth: token });
    if (store.events.has(keyOf(calendarId, event.id))) throw err(409, 'event_exists');
    return clone(touch(calendarId, { ...structuredClone(event), cancelled: false }));
  },
  async patchEvent(token, calendarId, id, event) {
    await enter('patchEvent', { auth: token });
    const current = store.events.get(keyOf(calendarId, id));
    if (!current) throw err(404, 'event_gone');
    return clone(touch(calendarId, Object.assign(current, structuredClone(event), { id, cancelled: false })));
  },
  async deleteEvent(token, calendarId, id) {
    await enter('deleteEvent', { auth: token });
    const current = store.events.get(keyOf(calendarId, id));
    if (current && !current.cancelled) touch(calendarId, Object.assign(current, { cancelled: true }));
  },
  async listChanges(token, calendarId, syncToken) {
    await enter('listChanges', { auth: token });
    if (syncToken === 'expired') throw err(410, 'sync_token_expired');
    const since = syncToken ? Number(String(syncToken).replace('fake-sync-', '')) : 0;
    const events = [...store.events.entries()].filter(([k, e]) => k.startsWith(`${calendarId}/`) && e.seq > since).map(([, e]) => clone(e));
    return { events, nextSyncToken: `fake-sync-${store.seq}` };
  },
  async watch(token, calendarId, { channelId, token: channelToken, address, ttlSeconds }) {
    await enter('watch', { auth: token });
    const resourceId = `fake-resource-${channelId}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    store.channels.set(channelId, { channelId, resourceId, calendarId, address, token: channelToken, expiresAt });
    return { resourceId, expiresAt };
  },
  async stopChannel(token, { channelId }) { await enter('stopChannel', { auth: token }); store.channels.delete(channelId); }
};
