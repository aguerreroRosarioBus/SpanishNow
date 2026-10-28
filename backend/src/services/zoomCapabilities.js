// Metadatos dentro del JSON existente: las cachés anteriores no verificaron la fuente de participantes.
const CACHE_VERSION = 1;
const TTL_MS = 60 * 60 * 1000;
const stamp = (value, now = Date.now()) => value ? { ...value, cacheVersion: CACHE_VERSION, checkedAt: new Date(now).toISOString() } : null;
function fresh(value, now = Date.now()) {
  const checkedAt = Date.parse(value?.checkedAt);
  return value?.cacheVersion === CACHE_VERSION && checkedAt <= now && now - checkedAt < TTL_MS;
}
function valid(value) {
  return Boolean(value && Number.isSafeInteger(value.maxMinutes) && value.maxMinutes > 0
    && Number.isSafeInteger(value.maxParticipants) && value.maxParticipants > 0
    && Number.isSafeInteger(value.concurrentMeetings) && value.concurrentMeetings >= 1
    && value.passcodeRequired === true && ['basic', 'licensed', 'fake'].includes(value.plan));
}
module.exports = { stamp, fresh, valid, TTL_MS };
