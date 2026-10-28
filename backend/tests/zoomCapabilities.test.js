const cache = require('../src/services/zoomCapabilities');
test('reloj controlado: caché vigente hasta una hora; caché heredada o futura falla cerrada', () => {
  const now = Date.parse('2026-10-27T12:00:00Z');
  const value = cache.stamp({ maxParticipants: 100 }, now);
  expect(cache.fresh(value, now)).toBe(true);
  expect(cache.fresh(value, now + cache.TTL_MS - 1)).toBe(true);
  expect(cache.fresh(value, now + cache.TTL_MS)).toBe(false);
  expect(cache.fresh(value, now - 1)).toBe(false);
  expect(cache.fresh({ ...value, cacheVersion: undefined }, now)).toBe(false);
});
