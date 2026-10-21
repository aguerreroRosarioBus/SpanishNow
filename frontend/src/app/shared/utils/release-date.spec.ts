import { describe, expect, it } from 'vitest';
import { availableOnLabel, contentLockedFrom, formatAvailableDate, isStillLocked, releaseRuleLabel } from './release-date';

describe('release-date', () => {
  it('formatea la fecha en español y en inglés', () => {
    expect(formatAvailableDate('2026-10-21T15:00:00.000Z', 'es')).toBe('21 de octubre de 2026');
    expect(formatAvailableDate('2026-10-21T15:00:00.000Z', 'en-US')).toBe('October 21, 2026');
  });

  it('una fecha pura YYYY-MM-DD no se corre de día por la zona horaria', () => {
    expect(formatAvailableDate('2027-03-01', 'es')).toBe('1 de marzo de 2027');
    expect(formatAvailableDate('2027-03-01', 'es', 'short')).toBe('1 mar 2027');
  });

  it('fecha vacía o inválida da texto vacío', () => {
    expect(formatAvailableDate(null)).toBe('');
    expect(formatAvailableDate('basura')).toBe('');
  });

  it('arma «Disponible el …» y tiene un texto sin fecha', () => {
    expect(availableOnLabel('2026-10-21T15:00:00.000Z')).toBe('Disponible el 21 de octubre de 2026');
    expect(availableOnLabel(null)).toBe('Disponible próximamente');
  });

  it('isStillLocked compara con el momento dado', () => {
    const now = Date.parse('2026-10-21T12:00:00Z');
    expect(isStillLocked('2026-10-22T00:00:00Z', now)).toBe(true);
    expect(isStillLocked('2026-10-21T00:00:00Z', now)).toBe(false);
    expect(isStillLocked(null, now)).toBe(false);
  });

  it('describe la regla del docente', () => {
    expect(releaseRuleLabel(1, null)).toBe('Se libera al día de la inscripción');
    expect(releaseRuleLabel(7, null)).toBe('Se libera a los 7 días de la inscripción');
    expect(releaseRuleLabel(null, '2026-10-21T15:00:00Z')).toBe('Se libera el 21 de octubre de 2026');
    expect(releaseRuleLabel(7, '2026-10-21T15:00:00Z')).toBe('Se libera a los 7 días de la inscripción, pero no antes del 21 de octubre de 2026');
    expect(releaseRuleLabel(null, null)).toBe('');
  });

  it('reconoce el 403 content_locked y nada más', () => {
    expect(contentLockedFrom({ status: 403, error: { code: 'content_locked', availableAt: '2026-10-21T00:00:00Z' } })).toEqual({ availableAt: '2026-10-21T00:00:00Z' });
    expect(contentLockedFrom({ status: 403, error: { code: 'content_locked' } })).toEqual({ availableAt: null });
    expect(contentLockedFrom({ status: 403, error: { code: 'other' } })).toBeNull();
    expect(contentLockedFrom({ status: 404, error: { code: 'content_locked' } })).toBeNull();
    expect(contentLockedFrom(null)).toBeNull();
  });
});
