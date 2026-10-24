import { matchingZones, zoneLabel, zoneOffset } from './time-zone-select.component';

describe('selector de zona horaria', () => {
  it('busca ciudades con acentos, espacios o IANA sin cambiar el identificador', () => {
    const zones = ['America/Argentina/Cordoba', 'America/New_York', 'Europe/Madrid'];
    expect(matchingZones(zones, 'Córdoba')).toEqual(['America/Argentina/Cordoba']);
    expect(matchingZones(zones, 'new york')).toEqual(['America/New_York']);
    expect(matchingZones(zones, 'Europe/Madrid')).toEqual(['Europe/Madrid']);
    expect(matchingZones(zones, 'no existe')).toEqual([]);
    expect(zoneLabel('America/Argentina/Cordoba')).toBe('Cordoba · America / Argentina');
  });
  it('presenta el desfase de la fecha usando Intl, incluido horario de verano', () => {
    expect(zoneOffset('America/New_York', 'en-US', new Date('2026-01-15T12:00:00Z'))).toBe('UTC-05:00');
    expect(zoneOffset('America/New_York', 'en-US', new Date('2026-07-15T12:00:00Z'))).toBe('UTC-04:00');
    expect(zoneOffset('UTC', 'es-AR')).toBe('UTC');
  });
});
