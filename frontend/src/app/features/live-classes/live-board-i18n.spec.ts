import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { LiveClassesComponent } from './live-classes.component';
import { LiveJoinComponent } from './live-join.component';
import { LiveRoomComponent } from './live-room.component';
import { LiveBoardComponent } from './board/live-board.component';
import { LiveClassService } from '../../core/services/live-class.service';
import { CourseService } from '../../core/services/course.service';
import { AuthService } from '../../core/services/auth.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { LIVE_BOARD_EN, LIVE_BOARD_ES } from '../../core/i18n/catalogs/live-board';
import { EN } from '../../core/i18n/catalogs/en';
import { ES } from '../../core/i18n/catalogs/es';
import { BoardElement, BoardOperation, BoardPage, LiveClass, LiveSnapshot } from '../../core/models/live-class.model';

const text = (f: ComponentFixture<unknown>) => (f.nativeElement as HTMLElement).textContent as string;
const placeholders = (value: unknown) => [...JSON.stringify(value).matchAll(/\{([a-zA-Z]\w*)\}/g)].map(m => m[1]).sort();

const klass = (patch: Partial<LiveClass> = {}): LiveClass => ({ id: 1, teacherId: 7, courseId: null, title: 'Mi clase original', status: 'live', allowStudentEdit: true,
  revision: 0, updatedAt: '2026-10-23T15:30:00.000Z', createdAt: '', isOwner: true, ...patch });
const page = (): BoardPage => ({ id: 'page_0001', title: 'Página 1', background: 'plain', elements: [] });
const snapshot = (owner = true): LiveSnapshot => ({ ...klass({ isOwner: owner }), participants: [{ id: 7, name: 'Ana ficticia', isTeacher: true }, { id: 8, name: 'Beto', isTeacher: false }],
  board: { pages: [page()], activePageId: 'page_0001' } });
const operation = (): BoardOperation => ({ id: 'operation_01', type: 'put', pageId: 'page_0001', expectedVersion: 0,
  element: { id: 'element_001', type: 'note', x: 100, y: 100, w: 200, h: 200, text: 'Aporte local', width: 4, color: '#fff2a8', authorId: 7, version: 0 } });
const preferences = { preferences: signal({ timeZone: 'America/Argentina/Buenos_Aires' }) };

describe('clases en vivo y pizarra: idioma', () => {
  it('EN y ES tienen las mismas claves y parámetros, sin vacíos ni duplicados', () => {
    const en = Object.keys(LIVE_BOARD_EN), es = Object.keys(LIVE_BOARD_ES);
    expect(en.length).toBeGreaterThan(150);
    expect(new Set(en).size).toBe(en.length);
    expect([...en].sort()).toEqual([...es].sort());
    for (const key of en) {
      expect(key.startsWith('liveBoard.')).toBe(true);
      const a = (LIVE_BOARD_EN as Record<string, unknown>)[key], b = (LIVE_BOARD_ES as Record<string, unknown>)[key];
      expect(JSON.stringify(a)).not.toBe('""'); expect(JSON.stringify(b)).not.toBe('""');
      expect(placeholders(a)).toEqual(placeholders(b));
      expect(Object.hasOwn(EN, key)).toBe(true); expect(Object.hasOwn(ES, key)).toBe(true);
    }
  });

  describe('lista', () => {
    function setup(over: Partial<Record<string, unknown>> = {}, teacher = true) {
      const api = { list: vi.fn(() => of([klass()])), googleStatus: vi.fn(() => of({ configured: true, connected: true, email: 'docente@example.test' })),
        create: vi.fn(() => throwError(() => ({ status: 403, error: { error: 'texto libre del servidor', code: 'forbidden' } }))), join: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), ...over };
      TestBed.configureTestingModule({ providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map([['google', 'connected']]) } } },
        { provide: LiveClassService, useValue: api }, { provide: CourseService, useValue: { getCourses: vi.fn(() => of([{ id: 3, title: 'Curso original' }])) } },
        { provide: AuthService, useValue: { isTeacher: () => teacher } }, { provide: UserPreferencesService, useValue: preferences }] });
      const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
      const f = TestBed.createComponent(LiveClassesComponent); f.detectChanges();
      return { f, c: f.componentInstance, i18n, api };
    }

    it('cambia textos, estados, fecha con la zona de preferencias y avisos; conserva borrador y no repite peticiones', async () => {
      const { f, c, i18n, api } = setup();
      await f.whenStable(); f.detectChanges();
      expect(text(f)).toContain('Clases en vivo'); expect(text(f)).toContain('Nueva clase'); expect(text(f)).toContain('En vivo');
      expect(text(f)).toContain('Tu cuenta de Google quedó conectada.'); expect(text(f)).toContain('Cuenta conectada: docente@example.test');
      expect(text(f)).toContain('Actualizada'); expect(text(f)).toMatch(/23 oct 2026.*12:30/); expect(text(f)).toContain('Mi clase original');
      c.showCreate.set(true); f.detectChanges();
      c.title = 'Borrador a medias'; c.courseId = 3; await c.create(); f.detectChanges();
      expect(text(f)).toContain('No tienes permiso para realizar esta acción.'); expect(text(f)).not.toContain('texto libre del servidor');
      expect(text(f)).toContain('Prepara una pizarra'); expect(text(f)).toContain('Curso original');
      const requests = [api.list.mock.calls.length, api.googleStatus.mock.calls.length, api.create.mock.calls.length];

      i18n.setLocale('en'); f.detectChanges();
      expect(text(f)).toContain('Live classes'); expect(text(f)).toContain('Create class'); expect(text(f)).toContain('Live');
      expect(text(f)).toContain('Your Google account is now connected.'); expect(text(f)).toContain('Connected account: docente@example.test');
      expect(text(f)).toMatch(/Oct 23, 2026.*12:30/); expect(text(f)).toContain('You do not have permission for this action.');
      expect(text(f)).toContain('Prepare a board'); expect(text(f)).toContain('Standalone room'); expect(text(f)).toContain('Mi clase original');
      expect((f.nativeElement as HTMLElement).querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Filter classes');
      expect(c.title).toBe('Borrador a medias'); expect(c.courseId).toBe(3); expect(c.showCreate()).toBe(true);
      expect([api.list.mock.calls.length, api.googleStatus.mock.calls.length, api.create.mock.calls.length]).toEqual(requests);
      i18n.setLocale('es'); f.detectChanges(); expect(text(f)).toContain('No tienes permiso para realizar esta acción.');
    });

    it('estado vacío y código de invitación inválido por idioma', async () => {
      const { f, c, i18n } = setup({ list: vi.fn(() => of([])) }, false);
      await f.whenStable(); f.detectChanges();
      expect(text(f)).toContain('Aquí encontrarás tus clases en vivo'); expect(text(f)).toContain('Entrar a clase');
      c.code = 'abc'; await c.join(); f.detectChanges();
      expect(text(f)).toContain('Pega el enlace de invitación o el código de 16 caracteres.');
      i18n.setLocale('en'); f.detectChanges();
      expect(text(f)).toContain('Your live classes will appear here'); expect(text(f)).toContain('Paste the invitation link or the 16-character code.');
      expect(c.code).toBe('abc');
    });
  });

  it('acceso por invitación: el error por código se traduce sin repetir la petición', () => {
    const api = { join: vi.fn(() => throwError(() => ({ status: 404, error: { error: 'texto libre', code: 'not_found' } }))) };
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['code', 'x']]) } } }, { provide: LiveClassService, useValue: api }] });
    const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
    const f = TestBed.createComponent(LiveJoinComponent); f.detectChanges();
    expect(text(f)).toContain('Entrar a clase'); expect(text(f)).toContain(i18n.t('errors.not_found'));
    i18n.setLocale('en'); f.detectChanges();
    expect(text(f)).toContain('Join a class'); expect(text(f)).toContain('This resource is not available.'); expect(text(f)).toContain('Retry');
    expect(api.join).toHaveBeenCalledTimes(1);
  });

  describe('sala', () => {
    function setup(owner = true) {
      const data = snapshot(owner);
      const api = { snapshot: vi.fn(() => of(data)), presence: vi.fn(() => of(undefined)), googleStatus: vi.fn(() => of({ configured: true, connected: true, email: 'docente@example.test' })),
        change: vi.fn((..._args: unknown[]): any => throwError(() => ({ status: 409, error: { error: 'texto libre', code: 'version_conflict' } }))), settings: vi.fn(), restore: vi.fn(),
        classroomCourses: vi.fn(), driveFiles: vi.fn(), upload: vi.fn() };
      TestBed.configureTestingModule({ imports: [LiveRoomComponent], providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', '1']]) } } },
        { provide: AuthService, useValue: { currentUser: signal({ id: owner ? 7 : 8, role: owner ? 'teacher' : 'student' }) } },
        { provide: UserPreferencesService, useValue: preferences }, { provide: LiveClassService, useValue: api }] });
      vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
      const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
      const f = TestBed.createComponent(LiveRoomComponent);
      return { f, c: f.componentInstance, i18n, api };
    }
    afterEach(() => vi.unstubAllGlobals());

    it('barra, estado, pestañas y paneles cambian de idioma; el panel abierto y el texto en edición se conservan', async () => {
      const { f, c, i18n, api } = setup();
      await c.refresh(); f.detectChanges();
      const html = f.nativeElement as HTMLElement;
      const aria = (label: string) => html.querySelector(`[aria-label="${label}"]`);
      expect(text(f)).toContain('Todos los cambios guardados'); expect(text(f)).toContain('Invitar alumnos'); expect(text(f)).toContain('Página 1 de 1');
      expect(aria('Herramientas de la pizarra')).toBeTruthy(); expect(aria('Lápiz')).toBeTruthy(); expect(aria('Participantes: 2')).toBeTruthy();
      c.togglePanel('google'); await Promise.resolve(); await Promise.resolve(); f.detectChanges(); await f.whenStable();
      const type = (selector: string, value: string) => { const input = html.querySelector(selector) as HTMLInputElement; input.value = value; input.dispatchEvent(new Event('input')); };
      type('input[maxlength="200"]', 'Actividad propia'); type('input[maxlength="1500"]', 'https://drive.google.com/abc'); await f.whenStable(); f.detectChanges();
      expect(text(f)).toContain('Recurso de Drive'); expect(text(f)).toContain('Buscar pizarras guardadas'); expect(text(f)).toContain('docente@example.test');
      const requests = [api.snapshot.mock.calls.length, api.googleStatus.mock.calls.length];

      i18n.setLocale('en'); f.detectChanges();
      expect(text(f)).toContain('All changes saved'); expect(text(f)).toContain('Invite students'); expect(text(f)).toContain('Page 1 of 1');
      expect(aria('Board tools')).toBeTruthy(); expect(aria('Pen')).toBeTruthy(); expect(aria('Participants: 2')).toBeTruthy(); expect(aria('Pan canvas')).toBeTruthy();
      expect(aria('Board pages')).toBeTruthy(); expect(aria('Zoom out')).toBeTruthy();
      expect(text(f)).toContain('Drive resource'); expect(text(f)).toContain('Find saved boards'); expect(text(f)).toContain('Live');
      expect(c.panel()).toBe('google'); expect(c.resourceTitle).toBe('Actividad propia'); expect(c.resourceUrl).toBe('https://drive.google.com/abc');
      expect((html.querySelector('input[placeholder^="https://drive"]') as HTMLInputElement).value).toBe('https://drive.google.com/abc');
      expect([api.snapshot.mock.calls.length, api.googleStatus.mock.calls.length]).toEqual(requests);

      c.togglePanel('participants'); f.detectChanges();
      expect(text(f)).toContain('Invite to the class'); expect(text(f)).toContain('Teacher'); expect(text(f)).toContain('Student');
      i18n.setLocale('es'); f.detectChanges();
      expect(text(f)).toContain('Invitar a la clase'); expect(text(f)).toContain('Docente'); expect(text(f)).toContain('Alumno');
      c.ngOnDestroy();
    });

    it('con cambios pendientes y error de guardado: se traduce el aviso, se conserva la cola y no se repite la petición', async () => {
      const { f, c, i18n, api } = setup();
      await c.refresh(); f.detectChanges();
      c.queue(operation()); await Promise.resolve(); await Promise.resolve(); f.detectChanges();
      expect(c.pending()).toHaveLength(1); expect(c.syncError()).toBe(i18n.t('errors.version_conflict'));
      expect(text(f)).toContain('Cambios pendientes'); expect(text(f)).toContain('Tus cambios pendientes siguen visibles aquí.'); expect(text(f)).toContain('Reintentar guardado');
      expect(text(f)).not.toContain('texto libre');
      const requests = [api.change.mock.calls.length, api.snapshot.mock.calls.length];
      i18n.setLocale('en'); f.detectChanges();
      expect(text(f)).toContain('Pending changes'); expect(text(f)).toContain('Your pending changes are still visible here.'); expect(text(f)).toContain('Retry saving');
      expect(text(f)).toContain('This information changed. Refresh it before trying again.'); expect(text(f)).toContain('Download a copy');
      expect(c.pending()).toHaveLength(1); expect(c.canEdit()).toBe(false);
      expect([api.change.mock.calls.length, api.snapshot.mock.calls.length]).toEqual(requests);
      c.ask('discard'); f.detectChanges();
      expect(text(f)).toContain('Discard pending changes'); expect(text(f)).toContain('Cancel');
      i18n.setLocale('es'); f.detectChanges();
      expect(text(f)).toContain('Descartar cambios pendientes'); expect(text(f)).toContain('Cancelar'); expect(c.confirm()).toBe('discard'); expect(c.pending()).toHaveLength(1);
      c.ngOnDestroy();
    });

    it('un alumno de sala finalizada ve el modo lectura y el seguimiento en cada idioma', async () => {
      const { f, c, i18n } = setup(false);
      await c.refresh(); c.room.update(r => r && { ...r, status: 'ended' }); f.detectChanges();
      expect(text(f)).toContain('Solo lectura'); expect(text(f)).toContain('Siguiendo al docente'); expect(text(f)).toContain('Finalizada');
      i18n.setLocale('en'); f.detectChanges();
      expect(text(f)).toContain('Read only'); expect(text(f)).toContain('Following the teacher'); expect(text(f)).toContain('Ended');
      c.ngOnDestroy();
    });

    it('los títulos de páginas, de la clase y los nombres no se traducen; las páginas nuevas usan el idioma activo', async () => {
      const { f, c, i18n, api } = setup();
      await c.refresh(); f.detectChanges();
      api.change.mockReturnValue(of({ revision: 1, board: { pages: [page()], activePageId: 'page_0001' } }));
      i18n.setLocale('en'); c.addPage(); await Promise.resolve(); await Promise.resolve();
      expect((api.change.mock.calls[0][1] as unknown[])[0]).toEqual(expect.objectContaining({ type: 'page-add', title: 'Page 2' }));
      expect(text(f)).toContain('Página 1'); expect(text(f)).toContain('Mi clase original');
      c.ngOnDestroy();
    });
  });

  describe('tablero', () => {
    const element: BoardElement = { id: 'element_001', type: 'note', x: 100, y: 100, w: 280, h: 220, color: '#fff2a8', width: 4, text: 'Hola mundo', authorId: 7, version: 1 };
    function setup() {
      TestBed.configureTestingModule({ imports: [LiveBoardComponent] });
      const i18n = TestBed.inject(I18nService); i18n.setLocale('es');
      const f = TestBed.createComponent(LiveBoardComponent);
      f.componentRef.setInput('page', { id: 'page_0001', title: 'Página uno', background: 'plain', elements: [element] });
      f.componentRef.setInput('userId', 7); f.componentRef.setInput('editable', true); f.componentRef.setInput('owner', false);
      f.detectChanges();
      return { f, c: f.componentInstance, i18n, emit: vi.spyOn(f.componentInstance.change, 'emit') };
    }

    it('selección, texto en edición y diálogo de borrado cambian de idioma sin perder el estado', () => {
      const { f, c, i18n, emit } = setup();
      const html = f.nativeElement as HTMLElement;
      c.selectedId.set(element.id); f.detectChanges();
      expect(text(f)).toContain('Nota seleccionada'); expect(text(f)).toContain('Tipo de letra'); expect(text(f)).toContain('Tamaño de letra'); expect(text(f)).toContain('− Tamaño');
      expect(html.querySelector('svg')?.getAttribute('aria-label')).toBe('Página uno. Usa Seleccionar para mover elementos y las flechas del teclado para ajustar su posición.');
      c.editingText.set('Texto a medio escribir'); f.detectChanges();
      c.remove(); f.detectChanges();
      expect(text(f)).toContain('Se eliminará «Hola mundo» de Página uno.');

      i18n.setLocale('en'); f.detectChanges();
      expect(text(f)).toContain('Note selected'); expect(text(f)).toContain('Font family'); expect(text(f)).toContain('Font size'); expect(text(f)).toContain('− Size');
      expect(html.querySelector('svg')?.getAttribute('aria-label')).toBe('Página uno. Use Select to move elements and the keyboard arrows to adjust their position.');
      expect(text(f)).toContain('“Hola mundo” will be deleted from Página uno.'); expect(text(f)).toContain('Hola mundo');
      expect(html.querySelector('textarea')?.value).toBe('Texto a medio escribir');
      expect(c.editingText()).toBe('Texto a medio escribir'); expect(c.deleting()?.id).toBe(element.id); expect(emit).not.toHaveBeenCalled();
    });

    it('una nota nueva usa el texto por defecto del idioma activo y queda como contenido del usuario', () => {
      const { f, c, i18n, emit } = setup();
      f.componentRef.setInput('tool', 'note'); f.detectChanges();
      const svg = (f.nativeElement as HTMLElement).querySelector('svg.live-canvas') as SVGSVGElement;
      svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1600, height: 900 }) as DOMRect;
      const ev = { currentTarget: svg, target: svg, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 600, clientY: 400, preventDefault() {} } as unknown as PointerEvent;
      i18n.setLocale('en'); c.pointerDown(ev);
      expect(emit).toHaveBeenCalledWith(expect.objectContaining({ element: expect.objectContaining({ type: 'note', text: '', fontFamily: 'Nunito Sans', fontSize: 23 }) }));
      i18n.setLocale('es'); f.detectChanges();
      expect((emit.mock.calls[0][0] as BoardOperation).element!.text).toBe('');
      expect(c.editingText()).toBe('');
    });
  });
});
