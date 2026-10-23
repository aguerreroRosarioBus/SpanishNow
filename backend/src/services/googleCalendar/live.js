// Adaptador real de Google Calendar (OAuth 2.0 con PKCE + Calendar API v3). No se prueba contra Google en este
// paquete: las pruebas usan ./fake. Solo habla con hosts de Google, con tiempo límite y sin seguir redirecciones.
const { IntegrationError } = require('../externalConnections');
const { SCOPES } = require('./index');

const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const cfg = () => {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID, clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new IntegrationError(503, 'provider_unavailable', { reason: 'not_configured' });
  return { clientId, clientSecret };
};
const redirectUri = () => process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3000/api/integrations/google-calendar/callback';

// Clasifica la respuesta de Google en un error accionable. 401 = autorización muerta; 429/5xx = reintentable.
async function http(url, { token, method = 'GET', json, form, headers = {}, allow = [] } = {}) {
  let response;
  try {
    response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}) },
      body: json ? JSON.stringify(json) : form ? new URLSearchParams(form) : undefined });
  } catch { throw new IntegrationError(503, 'provider_unavailable', { reason: 'network' }, { retryable: true }); }
  if (response.ok || allow.includes(response.status)) return response;
  const status = response.status;
  let reason = '';
  try { reason = (await response.clone().json())?.error?.errors?.[0]?.reason || ''; } catch { /* cuerpo no JSON */ }
  if (status === 401) throw new IntegrationError(401, 'authorization_revoked', {}, { needsAttention: true });
  if (status === 403 && /rateLimit|quotaExceeded|userRateLimit/i.test(reason)) throw new IntegrationError(429, 'rate_limited', {}, { retryable: true });
  if (status === 403) throw new IntegrationError(403, 'permission_denied', {}, { needsAttention: true });
  if (status === 404) throw new IntegrationError(404, 'event_gone');
  if (status === 409) throw new IntegrationError(409, 'event_exists');
  if (status === 410) throw new IntegrationError(410, 'sync_token_expired');
  if (status === 429 || status >= 500) throw new IntegrationError(503, 'provider_unavailable', { status }, { retryable: true });
  throw new IntegrationError(502, 'provider_unavailable', { status });
}

function eventBody(e) {
  return {
    id: e.id, summary: e.summary, description: e.description, status: 'confirmed', transparency: 'opaque', visibility: 'private',
    start: { dateTime: e.startsAt, timeZone: 'UTC' }, end: { dateTime: e.endsAt, timeZone: 'UTC' },
    attendees: (e.attendees || []).map(email => ({ email })),
    // CAL-05: invitados ocultos, nadie puede invitar a terceros ni modificar el evento desde su calendario.
    guestsCanSeeOtherGuests: false, guestsCanInviteOthers: false, guestsCanModify: false,
    reminders: { useDefault: true },
    extendedProperties: { private: { spanishnowKey: e.correlationKey, spanishnowSession: String(e.sessionId), spanishnowVersion: String(e.version) } },
    ...(e.url ? { source: { title: 'SpanishNow', url: e.url } } : {})
  };
}
function normalize(g) {
  if (!g) return null;
  return { id: g.id, etag: g.etag, cancelled: g.status === 'cancelled', summary: g.summary,
    startsAt: g.start?.dateTime ? new Date(g.start.dateTime).toISOString() : null, endsAt: g.end?.dateTime ? new Date(g.end.dateTime).toISOString() : null,
    correlationKey: g.extendedProperties?.private?.spanishnowKey || null };
}
const eventUrl = (calendarId, id = '') => `${API}/calendars/${encodeURIComponent(calendarId)}/events${id ? `/${encodeURIComponent(id)}` : ''}`;

module.exports = {
  authUrl({ state, challenge }) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: cfg().clientId, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPES.join(' '),
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state, code_challenge: challenge, code_challenge_method: 'S256'
    }).toString();
    return url.href;
  },
  async exchangeCode({ code, verifier }) {
    const c = cfg();
    const result = await (await http(TOKEN_URL, { method: 'POST', form: { client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: redirectUri(),
      grant_type: 'authorization_code', code, code_verifier: verifier } }).catch(e => { if (e.code === 'authorization_revoked' || e.statusCode === 502) throw new IntegrationError(400, 'oauth_code_invalid'); throw e; })).json();
    const granted = (result.scope || '').split(' ');
    if (!result.access_token || !result.refresh_token || !SCOPES.every(s => granted.includes(s))) throw new IntegrationError(400, 'oauth_scopes_missing');
    const profile = await (await http('https://www.googleapis.com/oauth2/v2/userinfo', { token: result.access_token })).json();
    return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresIn: result.expires_in, scopes: result.scope, accountEmail: profile.email };
  },
  async refresh(refreshToken) {
    const c = cfg();
    const response = await http(TOKEN_URL, { method: 'POST', form: { client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }, allow: [400] });
    if (response.status === 400) throw new IntegrationError(400, 'authorization_revoked', {}, { needsAttention: true }); // invalid_grant
    const result = await response.json();
    return { accessToken: result.access_token, expiresIn: result.expires_in, refreshToken: result.refresh_token };
  },
  async revoke(token) { await http('https://oauth2.googleapis.com/revoke', { method: 'POST', form: { token }, allow: [400] }); },
  async listCalendars(token) {
    const items = (await (await http(`${API}/users/me/calendarList?minAccessRole=reader&maxResults=250`, { token })).json()).items || [];
    return items.map(c => ({ id: c.id, summary: c.summaryOverride || c.summary, primary: Boolean(c.primary), accessRole: c.accessRole }));
  },
  async freeBusy(token, { calendarIds, timeMin, timeMax }) {
    const result = await (await http(`${API}/freeBusy`, { token, method: 'POST', json: { timeMin, timeMax, items: calendarIds.map(id => ({ id })) } })).json();
    const calendars = result.calendars || {};
    // Un calendario que no se pudo leer no cuenta como libre: sin lectura completa no se confirma a ciegas.
    for (const id of calendarIds) if (!calendars[id] || calendars[id].errors?.length) throw new IntegrationError(503, 'provider_unavailable', { reason: 'freebusy_incomplete' }, { retryable: true });
    return calendarIds.flatMap(id => calendars[id].busy || []).map(({ start, end }) => ({ start, end }));
  },
  async getEvent(token, calendarId, id) {
    const response = await http(eventUrl(calendarId, id), { token, allow: [404, 410] });
    return response.ok ? normalize(await response.json()) : null;
  },
  async insertEvent(token, calendarId, event) {
    return normalize(await (await http(`${eventUrl(calendarId)}?sendUpdates=all`, { token, method: 'POST', json: eventBody(event) })).json());
  },
  async patchEvent(token, calendarId, id, event) {
    return normalize(await (await http(`${eventUrl(calendarId, id)}?sendUpdates=all`, { token, method: 'PATCH', json: eventBody({ ...event, id }) })).json());
  },
  async deleteEvent(token, calendarId, id) {
    await http(`${eventUrl(calendarId, id)}?sendUpdates=all`, { token, method: 'DELETE', allow: [404, 410] });
  },
  async listChanges(token, calendarId, syncToken) {
    const events = []; let pageToken, next;
    do {
      const url = new URL(eventUrl(calendarId));
      url.searchParams.set('showDeleted', 'true'); url.searchParams.set('maxResults', '250');
      if (syncToken) url.searchParams.set('syncToken', syncToken); else url.searchParams.set('timeMin', new Date(Date.now() - 86400e3).toISOString());
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await (await http(url, { token })).json();
      events.push(...(page.items || []).map(normalize)); pageToken = page.nextPageToken; next = page.nextSyncToken;
    } while (pageToken);
    return { events, nextSyncToken: next };
  },
  async watch(token, calendarId, { channelId, token: channelToken, address, ttlSeconds }) {
    const result = await (await http(`${eventUrl(calendarId)}/watch`, { token, method: 'POST',
      json: { id: channelId, type: 'web_hook', address, token: channelToken, params: { ttl: String(ttlSeconds) } } })).json();
    return { resourceId: result.resourceId, expiresAt: new Date(Number(result.expiration)) };
  },
  async stopChannel(token, { channelId, resourceId }) { await http(`${API}/channels/stop`, { token, method: 'POST', json: { id: channelId, resourceId }, allow: [404] }); }
};
