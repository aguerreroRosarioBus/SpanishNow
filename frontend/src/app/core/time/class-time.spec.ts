import { describe, expect, it } from 'vitest';
import fixtures from '../../../../../docs/clases-chat-integraciones/fixtures/time.json';
import {
  Disambiguation, LocalIntent, TimeError, addElapsed, inTimeZone, intervalsConflict,
  isAtLeastHoursBefore, isTimeZone, normalizeInstant, presentSessionTime, resolveLocalIntent
} from './class-time';

const zone = 'America/New_York';
const cordoba = 'America/Argentina/Cordoba';
const base: LocalIntent = { localStart: '2026-10-22T09:00', timeZone: zone, offset: '-04:00', minutes: 50 };
function failure(callback: () => unknown, code: string): Record<string, unknown> {
  try { callback(); } catch (error) {
    expect(error).toBeInstanceOf(TimeError);
    expect(error).toMatchObject({ code, statusCode: 400 });
    return (error as TimeError).params;
  }
  throw new Error(`Se esperaba ${code}`);
}

describe('W06: validación temporal del cliente con los mismos fixtures del servidor', () => {
  it.each(fixtures.conversions)('$id: UTC y proyección independiente del navegador', fixture => {
    const { localStart, timeZone, offset } = fixture;
    const result = resolveLocalIntent({ localStart, timeZone, offset, minutes: 50 });
    expect(result.startsAt).toBe(fixture.startsAt);
    if (fixture.cordoba) expect(inTimeZone(result.startsAt, cordoba).localStart).toBe(fixture.cordoba);
    if (fixture.london) expect(inTimeZone(result.startsAt, 'Europe/London').localStart).toBe(fixture.london);
  });

  it('TZ-T04: ni earlier ni later normalizan silenciosamente una hora inexistente', () => {
    const { alternatives, ...input } = fixtures.gap;
    for (const disambiguation of [undefined, 'earlier', 'later'] as const) {
      expect(failure(() => resolveLocalIntent({ ...input, disambiguation }), 'local_time_nonexistent')).toEqual({ alternatives });
    }
  });

  it('TZ-T05/T08: exige elección explícita y offset compatible para una hora repetida', () => {
    const { options, ...input } = fixtures.fold;
    expect(failure(() => resolveLocalIntent({ ...input, offset: '-05:00' }), 'local_time_ambiguous')).toEqual({ options });
    options.forEach((option, index) => {
      const disambiguation: Disambiguation = index ? 'later' : 'earlier';
      expect(resolveLocalIntent({ ...input, offset: option.offset, disambiguation })).toMatchObject({ startsAt: option.startsAt, disambiguation });
    });
    failure(() => resolveLocalIntent({ ...input, offset: '-04:00', disambiguation: 'later' }), 'offset_mismatch');
    failure(() => resolveLocalIntent({ ...base, offset: '-03:00' }), 'offset_mismatch');
  });

  it('valida IANA/alias y datos imposibles sin adivinar zona ni normalizar la fecha', () => {
    for (const name of ['UTC', zone, cordoba, 'US/Eastern', 'Asia/Katmandu']) expect(isTimeZone(name)).toBe(true);
    for (const name of ['EST', 'UTC-3', '-03:00', 'Argentina', 'America/Falsa']) {
      expect(isTimeZone(name)).toBe(false);
      failure(() => resolveLocalIntent({ ...base, timeZone: name }), 'time_zone_invalid');
    }
    for (const localStart of ['2026-02-30T09:00', '2026-10-22T24:00', '2026-10-22T09:00Z']) {
      failure(() => resolveLocalIntent({ ...base, localStart }), 'validation_failed');
    }
    failure(() => resolveLocalIntent({ ...base, minutes: 0 }), 'validation_failed');
    failure(() => normalizeInstant('2026-10-22T09:00'), 'time_without_zone');
    expect(normalizeInstant('2026-10-22T09:00:00-04:00')).toBe('2026-10-22T13:00:00.000Z');
  });

  it('TZ-T06/T07: fecha completa, día, extremos, zonas y offsets separados del idioma', () => {
    const session = Object.freeze({ startsAt: '2026-10-23T02:30:00Z', endsAt: '2026-10-23T03:20:00Z' });
    const es = presentSessionTime(session, cordoba, 'Europe/London', 'es');
    const en = presentSessionTime(session, cordoba, 'Europe/London', 'en');
    expect(es.recipient.start).toMatchObject({ localStart: '2026-10-22T23:30:00.000', timeZone: cordoba, offset: '-03:00' });
    expect(es.teacher.start).toMatchObject({ localStart: '2026-10-23T03:30:00.000', offset: '+01:00' });
    expect(es.differentDates).toBe(true);
    expect(es.recipient.startLabel).toContain('jueves');
    expect(en.recipient.startLabel).toContain('Thursday');
    expect(es.recipient.startLabel).toContain('2026');
    expect(es.recipient.startLabel).not.toBe(en.recipient.startLabel);
    expect(es.recipient.start).toEqual(en.recipient.start);
    const changed = presentSessionTime(session, 'Europe/London', zone, 'en');
    expect(changed.recipient.start.startsAt).toBe(es.recipient.start.startsAt);
    expect(changed.recipient.end.startsAt).toBe(es.recipient.end.startsAt);
  });

  it('DST dentro de la sesión conserva la duración real y muestra offset de cada extremo', () => {
    const session = resolveLocalIntent({ ...base, localStart: '2026-11-01T01:30', disambiguation: 'earlier' });
    const view = presentSessionTime(session, zone, zone, 'en');
    expect(session.endsAt).toBe('2026-11-01T06:20:00.000Z');
    expect(view.recipient.start.offset).toBe('-04:00');
    expect(view.recipient.end.offset).toBe('-05:00');
  });

  it('TZ-T09: límite exacto de 24 horas transcurridas, también cruzando DST', () => {
    for (const startsAt of ['2026-10-22T13:00:00Z', '2027-03-14T13:00:00Z', '2026-11-01T14:00:00Z']) {
      const now = addElapsed(startsAt, { hours: -24 });
      expect(isAtLeastHoursBefore(startsAt, now, 24)).toBe(true);
      expect(isAtLeastHoursBefore(startsAt, addElapsed(now, { seconds: 1 }), 24)).toBe(false);
    }
    expect(addElapsed(base.localStart + '-04:00', { hours: 2160 })).toBe('2027-01-20T13:00:00.000Z');
  });

  it('AGENDA-04: intervalos semiabiertos, buffer exacto y orden independiente', () => {
    const a = { startsAt: '2026-10-22T13:00:00Z', endsAt: '2026-10-22T13:50:00Z' };
    const b = { startsAt: a.endsAt, endsAt: '2026-10-22T14:40:00Z' };
    expect(intervalsConflict(a, b)).toBe(false);
    expect(intervalsConflict(a, b, 10)).toBe(true);
    expect(intervalsConflict(b, a, 10)).toBe(true);
    expect(intervalsConflict(a, { ...b, startsAt: '2026-10-22T14:00:00Z' }, 10)).toBe(false);
  });
});
