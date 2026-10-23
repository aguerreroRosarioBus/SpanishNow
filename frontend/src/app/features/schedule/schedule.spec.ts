import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { ClassSession, ClassSessionsService } from '../../core/services/class-sessions.service';
import { FeaturesService } from '../../core/services/features.service';
import { I18N_CATALOGS, I18nService } from '../../core/i18n/i18n.service';
import { ClassSessionCardComponent } from './class-session-card.component';
import { ScheduleComponent } from './schedule.component';
import { SCHEDULE_MESSAGES } from './schedule.messages';

const session = (): ClassSession => ({ id: 10, teacherId: 2, teacher: { id: 2, name: 'Docente', timeZone: 'America/New_York' }, kind: 'individual', cohortId: null,
  status: 'proposed', version: 1, startsAt: '2027-01-11T14:00:00.000Z', endsAt: '2027-01-11T14:50:00.000Z', localStart: '2027-01-11T09:00', timeZone: 'America/New_York', utcOffset: '-05:00', minutes: 50,
  participants: [{ userId: 1, name: 'Alumno', status: 'invited', acceptedVersion: null, attendance: 'pending' }],
  proposal: { version: 1, status: 'pending', kind: 'initial', startsAt: '2027-01-11T14:00:00.000Z', endsAt: '2027-01-11T14:50:00.000Z', localStart: '2027-01-11T09:00', timeZone: 'America/New_York', utcOffset: '-05:00', minutes: 50, expiresAt: '2027-01-10T14:00:00Z', leadTimeException: false },
  proposals: [], sync: [], rules: { freeCancelHours: 24, arrivalToleranceMinutes: 10 }, serverNow: '2026-10-22T13:00:00Z', groupResolutionRequired: false, timeZoneRulesChanged: false, replacementSessionId: null });

describe('W06: interfaz conectada por contratos de agenda', () => {
  let api: { get: ReturnType<typeof vi.fn>; list: ReturnType<typeof vi.fn>; reminders: ReturnType<typeof vi.fn>; options: ReturnType<typeof vi.fn>; respond: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  let auth: { currentUser: ReturnType<typeof signal<{ id: number; role: string } | null>> };
  beforeEach(() => {
    localStorage.clear(); localStorage.setItem('spanishnow.locale', 'es');
    const s = session(); s.proposals = [s.proposal!];
    api = { get: vi.fn(() => of(s)), list: vi.fn(() => of({ items: [], truncated: false })), reminders: vi.fn(() => of({ items: [] })),
      options: vi.fn(() => of({ studentId: null, students: [], purchases: [], cohorts: [] })), respond: vi.fn(() => of({ ...s, status: 'confirmed' })), create: vi.fn(() => of(s)) };
    auth = { currentUser: signal<{ id: number; role: string } | null>({ id: 1, role: 'student' }) };
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: AuthService, useValue: auth }, { provide: ClassSessionsService, useValue: api },
      { provide: UserPreferencesService, useValue: { preferences: signal({ timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: '2026-10-22T13:00:00Z' }), saving: signal(false), errorMessage: signal('') } },
      { provide: FeaturesService, useValue: { load: vi.fn(), enabled: () => true } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
      { provide: I18N_CATALOGS, multi: true, useValue: SCHEDULE_MESSAGES }
    ] });
  });
  afterEach(() => { TestBed.resetTestingModule(); localStorage.clear(); });

  it('acepta solo tras ver resumen y reconocer la versión; envía exactamente la propuesta visible', () => {
    const fixture = TestBed.createComponent(ClassSessionCardComponent);
    fixture.componentRef.setInput('sessionId', 10); fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('America/Argentina/Cordoba');
    expect(fixture.nativeElement.textContent).toContain('America/New_York');
    component.startDecision('accept'); fixture.detectChanges();
    component.respond(); expect(api.respond).not.toHaveBeenCalled();
    component.acknowledge = true; component.respond();
    expect(api.respond).toHaveBeenCalledWith(10, 1, 'accept', true);
    fixture.destroy();
  });

  it('una tarjeta histórica no acepta una propuesta nueva sin revisarla', () => {
    const s = session(); s.version = 2; s.proposals = [s.proposal!]; api.get.mockReturnValue(of(s));
    const fixture = TestBed.createComponent(ClassSessionCardComponent);
    fixture.componentRef.setInput('sessionId', 10); fixture.componentRef.setInput('proposalVersion', 1); fixture.detectChanges();
    expect(fixture.componentInstance.canRespond()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('reemplazada o resuelta');
    fixture.componentInstance.startDecision('accept'); fixture.componentInstance.acknowledge = true; fixture.componentInstance.respond();
    expect(api.respond).not.toHaveBeenCalled(); fixture.destroy();
  });

  it('cambiar idioma conserva zona, instantes y reconocimiento pendiente', () => {
    const fixture = TestBed.createComponent(ClassSessionCardComponent); fixture.componentRef.setInput('sessionId', 10); fixture.detectChanges();
    const c = fixture.componentInstance; c.startDecision('accept'); c.acknowledge = true;
    const before = c.session()?.startsAt;
    TestBed.inject(I18nService).setLocale('en'); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Your time'); expect(c.session()?.startsAt).toBe(before);
    expect(c.zone()).toBe('America/Argentina/Cordoba'); expect(c.acknowledge).toBe(true); fixture.destroy();
  });

  it('respuestas de otra sesión/cuenta se descartan y no muestran datos privados viejos', () => {
    const old = new Subject<ClassSession>(); api.get.mockReturnValue(old);
    const fixture = TestBed.createComponent(ClassSessionCardComponent); fixture.componentRef.setInput('sessionId', 10); fixture.detectChanges();
    auth.currentUser.set(null); fixture.detectChanges(); old.next(session());
    expect(fixture.componentInstance.session()).toBeNull(); expect(fixture.nativeElement.textContent).not.toContain('Docente'); fixture.destroy();
  });

  it('un 409 conserva el error y recarga la versión vigente sin aceptar automáticamente', () => {
    const fixture = TestBed.createComponent(ClassSessionCardComponent); fixture.componentRef.setInput('sessionId', 10); fixture.detectChanges();
    api.respond.mockReturnValue(throwError(() => ({ status: 409, error: { code: 'proposal_stale' } })));
    const c = fixture.componentInstance; c.startDecision('accept'); c.acknowledge = true; c.respond(); fixture.detectChanges();
    expect(c.busy()).toBe(false); expect(c.decision()).toBeNull(); expect(api.get).toHaveBeenCalledTimes(2); expect(api.respond).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('horas inexistentes y repetidas se resuelven explícitamente, sin normalización oculta', () => {
    auth.currentUser.set({ id: 2, role: 'teacher' });
    const fixture = TestBed.createComponent(ScheduleComponent); fixture.detectChanges(); const c = fixture.componentInstance;
    c.patch({ localStart: '2027-03-14T02:30', timeZone: 'America/New_York', minutes: 50 });
    expect(c.choices().value).toBeNull(); expect(c.choices().alternatives).toHaveLength(2);
    c.patch({ localStart: '2026-11-01T01:30' }); expect(c.choices().options).toHaveLength(2);
    c.choose('-05:00', 1); expect(c.choices().value?.startsAt).toBe('2026-11-01T06:30:00.000Z');
    const before = c.draft(); TestBed.inject(I18nService).setLocale('en'); fixture.detectChanges(); expect(c.draft()).toEqual(before);
    fixture.destroy();
  });

  it('catálogo de agenda conserva paridad EN/ES y claves propias', () => {
    expect(Object.keys(SCHEDULE_MESSAGES.en).sort()).toEqual(Object.keys(SCHEDULE_MESSAGES.es).sort());
    expect(Object.keys(SCHEDULE_MESSAGES.en).every(key => key.startsWith('schedule.'))).toBe(true);
  });
});
