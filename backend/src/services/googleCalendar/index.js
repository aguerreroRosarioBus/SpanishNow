// Puerto de Google Calendar (W07). El servicio usa solo esta interfaz; INTEGRATIONS_FAKE=1 elige el adaptador
// determinista (prohibido en producción por features.assertSafe) y, si no, el real. Interfaz de cada adaptador:
//   authUrl({ state, challenge }) · exchangeCode({ code, verifier }) → { accessToken, refreshToken, expiresIn, scopes, accountEmail }
//   refresh(refreshToken) → { accessToken, expiresIn, refreshToken? } · revoke(token)
//   listCalendars(token) → [{ id, summary, primary, accessRole }]
//   freeBusy(token, { calendarIds, timeMin, timeMax }) → [{ start, end }] (solo intervalos, nunca títulos ni participantes)
//   getEvent / insertEvent / patchEvent / deleteEvent(token, calendarId, ...) con el evento normalizado (ver eventBody)
//   listChanges(token, calendarId, syncToken) → { events, nextSyncToken } · 410 → IntegrationError 'sync_token_expired'
//   watch(token, calendarId, { channelId, token, address, ttlSeconds }) → { resourceId, expiresAt } · stopChannel(token, { channelId, resourceId })
const features = require('../../config/features');

const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
];

const adapter = () => (features.integrationsFake() ? require('./fake') : require('./live'));

module.exports = { SCOPES, adapter, get fake() { return require('./fake'); } };
