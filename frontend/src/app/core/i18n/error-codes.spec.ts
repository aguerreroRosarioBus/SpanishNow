import {TestBed} from '@angular/core/testing';
import {I18nService} from './i18n.service';

describe('errorMessage: códigos de clases en vivo, compositor y alumnos', () => {
  const failure = (status: number, code?: string) => ({status, error: {error: 'texto libre del servidor', ...(code ? {code} : {})}});

  it('traduce el mensaje específico por code en EN y ES', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('es');
    expect(i18n.errorMessage(failure(409, 'live_not_live'), 'liveBoard.generic')).toBe('La clase no está en vivo. Pide al docente que la inicie.');
    expect(i18n.errorMessage(failure(403, 'live_editing_paused'))).toBe('El docente pausó la edición de los alumnos.');
    expect(i18n.errorMessage(failure(409, 'lesson_plan_revision_conflict'))).toContain('El borrador cambió');
    i18n.setLocale('en');
    expect(i18n.errorMessage(failure(409, 'live_not_live'))).toBe('The class is not live yet. Ask the teacher to start it.');
    expect(i18n.errorMessage(failure(409, 'lesson_plan_revision_conflict'))).toContain('The draft changed');
  });

  it('sin code, 403 y 409 usan una clave propia por estado y no el genérico; el texto libre nunca se muestra', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLocale('en');
    expect(i18n.errorMessage(failure(403), 'errors.unexpected')).toBe('You do not have permission for this action.');
    expect(i18n.errorMessage(failure(409), 'errors.unexpected')).toBe('This information changed. Refresh it before trying again.');
    expect(i18n.errorMessage(failure(500), 'errors.unexpected')).toBe('Something went wrong. Please try again.');
    expect(i18n.errorMessage(failure(409), 'errors.unexpected')).not.toContain('texto libre');
  });
});
