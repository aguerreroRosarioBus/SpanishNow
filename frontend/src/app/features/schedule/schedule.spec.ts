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
    auth = { currentUser: signal<{ id: number; role: string } | null>({ id: 1, role: 'student' }), hasPermission: () => false } as typeof auth;
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

  const confirmed = (sync: { provider: string; status: string; syncedVersion: number }[]) => ({ ...session(), status: 'confirmed', sync, proposal: null });
  it('el aviso de integraciones pendientes se oculta si todo está ready y aparece si no', () => {
    for (const [sync, shown] of [[[{ provider: 'zoom', status: 'ready', syncedVersion: 1 }, { provider: 'google_calendar', status: 'ready', syncedVersion: 1 }], false],
      [[{ provider: 'zoom', status: 'ready', syncedVersion: 1 }, { provider: 'google_calendar', status: 'needs_attention', syncedVersion: 1 }], true], [[], true]] as const) {
      api.get.mockReturnValue(of(confirmed([...sync])));
      const fixture = TestBed.createComponent(ClassSessionCardComponent); fixture.componentRef.setInput('sessionId', 10); fixture.detectChanges();
      expect(fixture.nativeElement.textContent.includes('Las integraciones externas no están listas')).toBe(shown); fixture.destroy();
    }
  });

  it('la docente inicia la reunión con hostUrl de zoom.us; la alumna solo entra como participante', () => {
    const sync = [{ provider: 'zoom', status: 'ready', syncedVersion: 1 }];
    const api2 = api as typeof api & { join: ReturnType<typeof vi.fn> };
    api2.join = vi.fn(() => of({ hostUrl: 'https://us02web.zoom.us/s/1?zak=x', joinUrl: 'https://us02web.zoom.us/j/1', manual: false }));
    api.get.mockReturnValue(of(confirmed(sync)));
    auth.currentUser.set({ id: 2, role: 'teacher' });
    let fixture = TestBed.createComponent(ClassSessionCardComponent); fixture.componentRef.setInput('sessionId', 10); fixture.detectChanges();
    const button = () => fixture.nativeElement.querySelector('[data-testid="join-button"]') as HTMLButtonElement | null;
    expect(button()?.textContent).toContain('Iniciar reunión');
    expect(button()).toBeTruthy(); button()!.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[data-testid="meeting-link"][href*="zak=x"]')).toBeTruthy(); fixture.destroy();
    api2.join.mockReturnValue(of({ hostUrl: 'https://evil.example/s/1', manual: false }));
    fixture = TestBed.createComponent(ClassSessionCardComponent); fixture.componentRef.setInput('sessionId', 10); fixture.detectChanges();
    button()!.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[data-testid="meeting-link"]')).toBeNull(); fixture.destroy();
    auth.currentUser.set({ id: 1, role: 'student' });
    fixture = TestBed.createComponent(ClassSessionCardComponent); fixture.componentRef.setInput('sessionId', 10); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Iniciar reunión'); fixture.destroy();
  });

  it('si la reunión de Zoom no existe, la alumna ve que no está lista y la docente conserva el aviso de conexión', () => {
    const sync = [{ provider: 'zoom', status: 'needs_attention', syncedVersion: 1 }];
    const api2 = api as typeof api & { join: ReturnType<typeof vi.fn> };
    api2.join = vi.fn(() => throwError(() => ({ status: 409, error: { code: 'integration_not_connected' } })));
    api.get.mockReturnValue(of(confirmed(sync)));
    const click = (fixture: { nativeElement: HTMLElement; detectChanges(): void }, label: string) => {
      ([...fixture.nativeElement.querySelectorAll('[data-testid="join-button"]')] as HTMLButtonElement[]).find(b => b.textContent?.includes(label))!.click(); fixture.detectChanges();
    };
    let fixture = TestBed.createComponent(ClassSessionCardComponent); fixture.componentRef.setInput('sessionId', 10); fixture.detectChanges();
    click(fixture, 'Entrar a la clase');
    expect(fixture.nativeElement.textContent).toContain('La reunión todavía no está lista');
    expect(fixture.nativeElement.textContent).not.toContain('Conecta el servicio'); expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull(); fixture.destroy();
    auth.currentUser.set({ id: 2, role: 'teacher' });
    fixture = TestBed.createComponent(ClassSessionCardComponent); fixture.componentRef.setInput('sessionId', 10); fixture.detectChanges();
    click(fixture, 'Iniciar reunión');
    expect(fixture.nativeElement.textContent).not.toContain('La reunión todavía no está lista'); expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeTruthy();
  });

  describe('Tanda C: tarjeta de clase', () => {
    const render = (s: ClassSession) => {
      api.get.mockReturnValue(of(s));
      const fixture = TestBed.createComponent(ClassSessionCardComponent); fixture.componentRef.setInput('sessionId', 10); fixture.detectChanges();
      return fixture;
    };
    const text = (f: { nativeElement: HTMLElement }) => f.nativeElement.textContent || '';
    const ready = [{ provider: 'zoom', status: 'ready', syncedVersion: 1 }, { provider: 'google_calendar', status: 'ready', syncedVersion: 1 }];

    it('muestra la fecha (con año) una sola vez y en formato compacto, con la zona como texto secundario', () => {
      const fixture = render(confirmed(ready));
      const main = fixture.nativeElement.querySelector('.when-main') as HTMLElement;
      expect(main.textContent).toMatch(/\d{2}:\d{2}–\d{2}:\d{2}/);
      expect(main.textContent).toContain('2027'); expect((main.textContent!.match(/2027/g) || []).length).toBe(1);
      expect(text(fixture)).toContain('America/Argentina/Cordoba'); fixture.destroy();
    });
    it('el horario del docente solo aparece cuando difiere del de quien mira', () => {
      let fixture = render(confirmed(ready));
      expect(fixture.nativeElement.querySelector('[data-testid="teacher-time"]')).toBeTruthy(); fixture.destroy();
      const same = { ...confirmed(ready), teacher: { id: 2, name: 'Docente', timeZone: 'America/Argentina/Cordoba' }, timeZone: 'America/Argentina/Cordoba' };
      fixture = render(same);
      expect(fixture.nativeElement.querySelector('[data-testid="teacher-time"]')).toBeNull();
      expect(text(fixture)).not.toContain('Horario del docente'); fixture.destroy();
    });
    it('el botón principal depende del rol y del estado', () => {
      let fixture = render(confirmed(ready));
      expect(fixture.nativeElement.querySelector('[data-testid="join-button"]')?.textContent).toContain('Entrar a la clase'); fixture.destroy();
      auth.currentUser.set({ id: 2, role: 'teacher' });
      fixture = render(confirmed(ready));
      expect(fixture.nativeElement.querySelector('[data-testid="join-button"]')?.textContent).toContain('Iniciar reunión'); fixture.destroy();
      auth.currentUser.set({ id: 1, role: 'student' });
      fixture = render(session());
      expect(fixture.nativeElement.querySelector('[data-testid="join-button"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('.card-actions .btn-primary')?.textContent).toContain('Aceptar esta propuesta'); fixture.destroy();
    });
    it('todos los desplegables comparten el mismo estilo (asistencia, clases compradas, corrección y calendario)', () => {
      auth.currentUser.set({ id: 2, role: 'teacher' });
      const base = confirmed(ready);
      const fixture = render({ ...base, purchases: [{ id: 5, expiresAt: '2027-03-01T00:00:00Z', unitsAvailable: 2, unitsReserved: 0, unitsConsumed: 0 }] });
      const details = Array.from(fixture.nativeElement.querySelectorAll('details')) as HTMLElement[];
      expect(details.map(d => d.querySelector('summary')!.textContent!.trim())).toEqual(['Registrar asistencia', 'Clases compradas', 'Calendario y reunión']);
      expect(details.every(d => d.classList.contains('card-details'))).toBe(true);
      expect(details.every(d => d.querySelector(':scope > summary')?.getAttribute('class') === null)).toBe(true); fixture.destroy();
    });
    describe('participantes en la tarjeta', () => {
      it('con una sola participante no se repite «nombre · estado» bajo el encabezado, ni para la docente', () => {
        auth.currentUser.set({ id: 2, role: 'teacher' });
        const fixture = render(confirmed(ready));
        expect(fixture.nativeElement.querySelector('.participants')).toBeNull();
        expect(fixture.nativeElement.querySelector('.card-title h2')?.textContent).toContain('Alumno');
        expect(fixture.nativeElement.querySelector('[data-testid="session-status"]')?.textContent).toContain('Confirmada');
        expect(fixture.nativeElement.querySelector('[data-testid="attendance-recorded"]')).toBeNull(); fixture.destroy();
      });
      it('si la asistencia de la única participante ya se registró, queda como texto secundario', () => {
        auth.currentUser.set({ id: 2, role: 'teacher' });
        const base = confirmed(ready);
        const fixture = render({ ...base, status: 'completed', participants: [{ ...base.participants[0], status: 'confirmed', attendance: 'attended' }] });
        expect(fixture.nativeElement.querySelector('.participants')).toBeNull();
        expect(fixture.nativeElement.querySelector('[data-testid="attendance-recorded"]')?.textContent).toContain('Asistencia registrada: Asistió'); fixture.destroy();
      });
      it('en un grupo sí se lista cada participante con su estado, para la docente y para la alumna', () => {
        const base = confirmed(ready);
        const group = { ...base, kind: 'group', participants: [base.participants[0], { userId: 3, name: 'Otra Alumna', status: 'confirmed', acceptedVersion: 1, attendance: 'pending' }] };
        for (const user of [{ id: 2, role: 'teacher' }, { id: 1, role: 'student' }]) {
          auth.currentUser.set(user);
          const fixture = render(group);
          const items = Array.from(fixture.nativeElement.querySelectorAll('.participants li')).map(li => (li as HTMLElement).textContent!.trim().replace(/\s+/g, ' '));
          expect(items.length).toBe(2); expect(items[1]).toContain('Otra Alumna · Confirmada'); fixture.destroy();
        }
      });
    });
    describe('propuesta pendiente vista por la alumna: «Rechazar» frente a «Cancelar clase»', () => {
      const cancelButton = (f: { nativeElement: HTMLElement }) => Array.from(f.nativeElement.querySelectorAll<HTMLButtonElement>('.card-actions button')).find(b => b.textContent!.includes('Cancelar clase'));
      const open = (f: { componentInstance: ClassSessionCardComponent; detectChanges(): void }, action: 'decline' | 'cancel') => { f.componentInstance.startDecision(action); f.detectChanges(); };
      it('propuesta inicial de clase individual: solo «Rechazar» (cancelar no agrega nada), sin cargo', () => {
        const fixture = render(session());
        const labels = Array.from(fixture.nativeElement.querySelectorAll('.card-actions button')).map(b => (b as HTMLElement).textContent!.trim());
        expect(labels).toContain('Rechazar');
        expect(cancelButton(fixture)).toBeUndefined();
        open(fixture, 'decline');
        expect(document.body.querySelector('[data-testid="decline-hint"]')?.textContent).toContain('no se usa ninguna clase'); fixture.destroy();
      });
      it('cambio de horario de una clase confirmada: ambas acciones y el texto explica que cancelar anula la clase confirmada', () => {
        const base = confirmed(ready);
        const proposal = { ...session().proposal!, kind: 'reschedule', status: 'pending', version: base.version };
        const fixture = render({ ...base, proposal, proposals: [proposal] });
        expect(cancelButton(fixture)).toBeTruthy();
        expect(fixture.nativeElement.textContent).toContain('Rechazar');
        open(fixture, 'decline');
        expect(document.body.querySelector('[data-testid="decline-hint"]')?.textContent).toContain('la clase sigue en su horario actual');
        open(fixture, 'cancel');
        expect(document.body.querySelector('[data-testid="cancel-hint"]')?.textContent).toContain('cancela la clase confirmada'); fixture.destroy();
      });
      it('propuesta inicial de clase en grupo: ambas acciones, con el texto que explica la diferencia', () => {
        const group = { ...session(), kind: 'group', status: 'forming' };
        const fixture = render(group);
        expect(cancelButton(fixture)).toBeTruthy();
        open(fixture, 'cancel');
        expect(document.body.querySelector('[data-testid="cancel-hint"]')?.textContent).toContain('te quita de la clase en grupo'); fixture.destroy();
      });
      it('sin propuesta que responder (clase confirmada) «Cancelar clase» sigue disponible y sin texto extra', () => {
        const fixture = render(confirmed(ready));
        expect(cancelButton(fixture)).toBeTruthy();
        open(fixture, 'cancel');
        expect(document.body.querySelector('[data-testid="cancel-hint"]')).toBeNull(); fixture.destroy();
      });
    });
    it('«Reintentar sincronización» solo aparece si falta sincronizar algo, y solo para la docente', () => {
      auth.currentUser.set({ id: 2, role: 'teacher' });
      let fixture = render(confirmed(ready));
      expect(fixture.nativeElement.querySelector('[data-testid="retry-sync"]')).toBeNull(); fixture.destroy();
      fixture = render(confirmed([ready[0], { provider: 'google_calendar', status: 'needs_attention', syncedVersion: 1 }]));
      expect(fixture.nativeElement.querySelector('[data-testid="retry-sync"]')).toBeTruthy(); fixture.destroy();
      auth.currentUser.set({ id: 1, role: 'student' });
      fixture = render(confirmed([{ provider: 'zoom', status: 'needs_attention', syncedVersion: 1 }]));
      expect(fixture.nativeElement.querySelector('[data-testid="retry-sync"]')).toBeNull(); fixture.destroy();
    });
    it('el estado es una etiqueta y la clase cancelada se muestra atenuada, sin acción de reunión', () => {
      let fixture = render(confirmed(ready));
      expect(fixture.nativeElement.querySelector('[data-testid="session-status"]')?.classList).toContain('status-success');
      expect(fixture.nativeElement.querySelector('.schedule-card').classList).not.toContain('is-inactive'); fixture.destroy();
      fixture = render({ ...session(), status: 'cancelled' });
      expect(fixture.nativeElement.querySelector('[data-testid="session-status"]')?.textContent).toContain('Cancelada');
      expect(fixture.nativeElement.querySelector('.schedule-card').classList).toContain('is-inactive');
      expect(fixture.nativeElement.querySelector('[data-testid="join-button"]')).toBeNull(); fixture.destroy();
    });
    it('conserva la condición de cancelación y no ofrece «Actualizar» salvo ante un error', () => {
      const fixture = render(confirmed(ready));
      expect(text(fixture)).toContain('Sin cargo al cancelar con al menos 24 horas');
      expect(text(fixture)).not.toContain('Actualizar'); fixture.destroy();
    });
  });

  it('el campo de zona IANA usa el ancho disponible (sin w-auto) para leerse completo en pantallas angostas', () => {
    const fixture = TestBed.createComponent(ScheduleComponent); fixture.detectChanges();
    fixture.componentInstance.zoneEditorOpen.set(true); fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#scheduleZone') as HTMLInputElement;
    expect(input.closest('app-time-zone-select')).toBeTruthy(); expect(input.getAttribute('role')).toBe('combobox'); expect(input.classList.contains('w-auto')).toBe(false);
    fixture.destroy();
  });

  it('catálogo de agenda conserva paridad EN/ES y claves propias', () => {
    expect(Object.keys(SCHEDULE_MESSAGES.en).sort()).toEqual(Object.keys(SCHEDULE_MESSAGES.es).sort());
    expect(Object.keys(SCHEDULE_MESSAGES.en).every(key => key.startsWith('schedule.') || key.startsWith('errors.'))).toBe(true);
  });

  describe('Tanda C: formulario de propuesta', () => {
    it('el formulario está cerrado hasta que la docente lo abre con una acción visible, y se cierra al volver', () => {
      auth.currentUser.set({ id: 2, role: 'teacher' });
      const fixture = TestBed.createComponent(ScheduleComponent); fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="schedule-form"]')).toBeNull();
      (el.querySelector('[data-testid="open-schedule-form"]') as HTMLButtonElement).click(); fixture.detectChanges();
      expect(document.body.querySelector('[data-testid="schedule-form"]')).toBeTruthy();
      expect((el.querySelector('[data-testid="open-schedule-form"]') as HTMLButtonElement).disabled).toBe(true);
      fixture.componentInstance.closeForm(); fixture.detectChanges();
      expect(el.querySelector('[data-testid="schedule-form"]')).toBeNull(); fixture.destroy();
    });
    it('la alumna no ve la acción de proponer y el filtro de fechas queda dentro de la lista de clases', () => {
      const fixture = TestBed.createComponent(ScheduleComponent); fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="open-schedule-form"]')).toBeNull();
      expect(el.querySelector('section.class-list form.date-filters')).toBeTruthy(); fixture.destroy();
    });
  });

  describe('Tanda B: clave de idempotencia al proponer una clase', () => {
    const setup = () => {
      auth.currentUser.set({ id: 2, role: 'teacher' });
      api.options.mockReturnValue(of({ studentId: 7, students: [{ id: 7, name: 'Alumno' }], cohorts: [],
        purchases: [{ id: 5, cohortId: null, minutesPerSession: 50, seatsCovered: 1, status: 'active', expiresAt: '2027-06-01T00:00:00Z', available: 4, beneficiaryIds: [7] }] }));
      const fixture = TestBed.createComponent(ScheduleComponent); fixture.detectChanges();
      const c = fixture.componentInstance; c.selectPurchase(5);
      c.patch({ localStart: '2027-01-11T09:00', timeZone: 'America/New_York' });
      return { fixture, c };
    };
    const keys = () => api.create.mock.calls.map(call => call[1] as string);
    it('tras una propuesta creada, proponer de nuevo los mismos datos usa una clave nueva (no repite la clase anterior)', () => {
      const { fixture, c } = setup();
      c.submit(); c.submit();
      expect(api.create).toHaveBeenCalledTimes(2);
      expect(keys()[1]).not.toBe(keys()[0]);
      expect(api.create.mock.calls[1][0]).toEqual(api.create.mock.calls[0][0]);
      fixture.destroy();
    });
    it('un corte de red conserva la clave para reintentar sin duplicar; una respuesta 4xx la renueva', () => {
      const { fixture, c } = setup();
      api.create.mockReturnValueOnce(throwError(() => ({ status: 0 }))).mockReturnValueOnce(throwError(() => ({ status: 503 })))
        .mockReturnValueOnce(throwError(() => ({ status: 409, error: { code: 'operation_key_conflict' } })));
      c.submit(); c.submit(); c.submit(); c.submit();
      const [a, b, third, fourth] = keys();
      expect(b).toBe(a); expect(third).toBe(a);
      expect(fourth).not.toBe(a);
      fixture.destroy();
    });
    it('datos distintos usan otra clave y el mismo envío mientras espera no se duplica', () => {
      const { fixture, c } = setup();
      const pending = new Subject<ClassSession>(); api.create.mockReturnValueOnce(pending);
      c.submit(); c.submit();
      expect(api.create).toHaveBeenCalledTimes(1);
      pending.next(session()); pending.complete();
      c.patch({ localStart: '2027-01-12T09:00' }); c.submit();
      expect(keys()[1]).not.toBe(keys()[0]);
      fixture.destroy();
    });
  });
});
