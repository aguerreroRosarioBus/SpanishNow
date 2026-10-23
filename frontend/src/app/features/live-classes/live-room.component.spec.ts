import { TestBed } from '@angular/core/testing';
import { ElementRef, signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { LiveRoomComponent } from './live-room.component';
import { LiveClassService } from '../../core/services/live-class.service';
import { AuthService } from '../../core/services/auth.service';
import { BoardOperation, GoogleStatus, LiveBoard, LiveSnapshot } from '../../core/models/live-class.model';
import { previewBoard } from './board/board.logic';
import { I18nService } from '../../core/i18n/i18n.service';

const board = (): LiveBoard => ({ pages: [{ id: 'page_0001', title: 'Página 1', elements: [], background: 'plain' }], activePageId: 'page_0001' });
const snapshot = (owner = true): LiveSnapshot => ({ id: 1, teacherId: 7, courseId: null, title: 'Mi clase', status: 'live', allowStudentEdit: true,
  revision: 0, updatedAt: '', createdAt: '', isOwner: owner, participants: [], board: board() });
const operation = (): BoardOperation => ({ id: 'operation_01', type: 'put', pageId: 'page_0001', expectedVersion: 0,
  element: { id: 'element_001', type: 'note', x: 100, y: 100, w: 200, h: 200, text: 'Aporte local', width: 4, color: '#fff2a8', authorId: 7, version: 0 } });
describe('LiveRoomComponent collaboration', () => {
  async function create(owner = true) {
    const data = snapshot(owner);
    const api = { snapshot: vi.fn(() => of(data)), presence: vi.fn(() => of(undefined)), googleStatus: vi.fn(() => of<GoogleStatus>({ configured: false, connected: false, email: null })), change: vi.fn(), settings: vi.fn(), restore: vi.fn() };
    TestBed.configureTestingModule({ imports: [LiveRoomComponent], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', '1']]) } } },
      { provide: AuthService, useValue: { currentUser: signal({ id: owner ? 7 : 8, role: owner ? 'teacher' : 'student' }) } },
      { provide: LiveClassService, useValue: api }] });
    TestBed.inject(I18nService).setLocale('es');
    const fixture = TestBed.createComponent(LiveRoomComponent); const c = fixture.componentInstance;
    await c.refresh();
    return { fixture, c, api, data };
  }
  it('refreshes Google connection when reopening the panel after OAuth', async () => {
    const { c, api } = await create();
    expect(c.google()?.connected).toBe(false);
    c.togglePanel('google'); await Promise.resolve();
    c.togglePanel('google');
    api.googleStatus.mockReturnValue(of({ configured: true, connected: true, email: 'teacher@example.com' }));
    c.togglePanel('google'); await Promise.resolve();
    expect(api.googleStatus).toHaveBeenCalledTimes(3);
    expect(c.google()).toEqual({ configured: true, connected: true, email: 'teacher@example.com' });
    expect(c.googleLoading()).toBe(false);
  });
  it('coalesces Google status requests and ignores responses after leaving the room', async () => {
    const { c, api } = await create(); const response = new Subject<GoogleStatus>();
    api.googleStatus.mockReturnValue(response as any);
    c.togglePanel('google'); c.togglePanel('google'); c.togglePanel('google');
    expect(c.googleLoading()).toBe(true); expect(api.googleStatus).toHaveBeenCalledTimes(2);
    c.ngOnDestroy();
    response.next({ configured: true, connected: true, email: 'teacher@example.com' }); response.complete();
    await Promise.resolve();
    expect(c.google()?.connected).toBe(false);
  });
  it('allows retry after a Google status failure without changing board errors', async () => {
    const { c, api } = await create();
    api.googleStatus.mockReturnValue(throwError(() => ({ status: 0 })));
    c.togglePanel('google'); await Promise.resolve();
    expect(c.googleError()).not.toBe(''); expect(c.error()).toBe(''); expect(c.googleLoading()).toBe(false);
    api.googleStatus.mockReturnValue(of({ configured: true, connected: true, email: 'teacher@example.com' }));
    await c.loadGoogleStatus();
    expect(c.googleError()).toBe(''); expect(c.google()?.connected).toBe(true);
  });
  it('does not request a student’s Google connection', async () => {
    const { c, api } = await create(false);
    c.togglePanel('google'); await c.loadGoogleStatus();
    expect(api.googleStatus).not.toHaveBeenCalled();
  });
  it('previews a pending contribution, then reconciles it with the saved server state', async () => {
    const { c, api } = await create();
    const response = new Subject<{ revision: number; board: LiveBoard }>(); api.change.mockReturnValue(response);
    const op = operation(); c.queue(op);
    expect(c.pending()).toHaveLength(1); expect(c.board()!.pages[0].elements[0].text).toBe('Aporte local');
    response.next({ revision: 1, board: previewBoard(board(), [op])! }); response.complete();
    await Promise.resolve(); await Promise.resolve();
    expect(c.pending()).toHaveLength(0); expect(c.room()!.revision).toBe(1); expect(c.board()!.pages[0].elements).toHaveLength(1);
  });
  it('retains unsaved work on failure and retries with the same operation identifier', async () => {
    const { c, api } = await create(); const op = operation();
    api.change.mockReturnValue(throwError(() => ({ status: 0 }))); c.queue(op); await Promise.resolve(); await Promise.resolve();
    expect(c.syncError()).toContain('conexión'); expect(c.pending()).toHaveLength(1); expect(c.canEdit()).toBe(false);
    api.change.mockReturnValue(of({ revision: 1, board: previewBoard(board(), [op])! })); c.retry(); await Promise.resolve(); await Promise.resolve();
    expect(api.change.mock.calls.map(call => call[1][0].id)).toEqual([op.id, op.id]); expect(c.pending()).toHaveLength(0); expect(c.syncError()).toBe('');
  });
  it('an older in-flight poll cannot overwrite a newer confirmed board', async () => {
    const { c, api } = await create(); const read = new Subject<LiveSnapshot>(); api.snapshot.mockReturnValue(read as any);
    const refreshing = c.refresh();
    const op = operation(); api.change.mockReturnValue(of({ revision: 2, board: previewBoard(board(), [op])! })); c.queue(op); await Promise.resolve(); await Promise.resolve();
    read.next(snapshot()); read.complete(); await refreshing;
    expect(c.room()!.revision).toBe(2); expect(c.board()!.pages[0].elements).toHaveLength(1);
  });
  it('a student follows the teacher page unless they explicitly browse independently', async () => {
    const { c, api, data } = await create(false);
    data.board!.pages.push({ id: 'page_0002', title: 'Página 2', background: 'plain', elements: [] });
    data.board!.activePageId = 'page_0002'; data.revision = 1;
    await c.refresh(true);
    expect(c.currentPage()!.id).toBe('page_0002');
    c.toggleFollow(); expect(c.currentPage()!.id).toBe('page_0002'); c.toggleFollow();
    c.choosePage('page_0001'); expect(c.follow()).toBe(false); expect(c.currentPage()!.id).toBe('page_0001');
    expect(api.change).not.toHaveBeenCalled();
  });
  it('teacher lock and ended status disable student changes; owners can prepare boards', async () => {
    const { c, api, data } = await create(false);
    c.room.set({ ...data, allowStudentEdit: false }); c.queue(operation()); expect(api.change).not.toHaveBeenCalled();
    c.room.set({ ...data, status: 'ended' }); expect(c.canEdit()).toBe(false);
    c.room.set({ ...data, status: 'ended', isOwner: true }); expect(c.canEdit()).toBe(true);
  });
  it('discard is confirmed and reloads authoritative state instead of losing work immediately', async () => {
    const { c, api } = await create(); api.change.mockReturnValue(throwError(() => ({ error: { error: 'Conflicto' } })));
    c.queue(operation()); await Promise.resolve(); await Promise.resolve(); c.ask('discard');
    expect(c.pending()).toHaveLength(1); expect(c.confirmationMessage).toContain('descargar');
    await c.confirmAction(); expect(c.pending()).toHaveLength(0); expect(c.board()!.pages[0].elements).toHaveLength(0);
  });
  it('destructive page actions do not execute until confirmed and carry a revision check', async () => {
    const { c, api } = await create(); api.change.mockReturnValue(of({ revision: 1, board: board() }));
    c.ask('clear'); expect(api.change).not.toHaveBeenCalled(); await c.confirmAction();
    expect(api.change).toHaveBeenCalledWith(1, [expect.objectContaining({ type: 'page-clear', expectedRevision: 0, pageId: 'page_0001' })]);
  });
  it('fits the frame to the measured viewport and bounds local zoom without writing to the board', async () => {
    const { c, api } = await create();
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const viewport = document.createElement('div');
    Object.defineProperties(viewport, { clientWidth: { value: 1000 }, clientHeight: { value: 800 } });
    viewport.scrollTo = vi.fn();
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => { callback(0); return 1; });
    c.viewport = new ElementRef(viewport); c.fitBoard();
    expect(c.zoom()).toBe(50); expect(viewport.scrollTo).toHaveBeenCalledWith({ left: 0, top: 0 });
    c.zoomBy(500); expect(c.zoom()).toBe(200);
    c.zoomBy(-500); expect(c.zoom()).toBe(10);
    c.fitBoard(); expect(c.zoom()).toBe(50); expect(api.change).not.toHaveBeenCalled();
    c.ngOnDestroy(); raf.mockRestore(); vi.unstubAllGlobals();
  });
  it('hand panning changes only viewport scroll, including for a read-only student', async () => {
    const { c, api } = await create(false);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const viewport = document.createElement('div'); viewport.scrollLeft = 200; viewport.scrollTop = 300;
    c.viewport = new ElementRef(viewport);
    const down = { currentTarget: viewport, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100, preventDefault() {} } as unknown as PointerEvent;
    c.startPan(down); expect(c.dragging()).toBe(false);
    c.hand.set(true); c.startPan(down); c.movePan({ ...down, clientX: 70, clientY: 60 });
    expect(viewport.scrollLeft).toBe(230); expect(viewport.scrollTop).toBe(340); expect(c.dragging()).toBe(true);
    c.endPan(); expect(c.dragging()).toBe(false); expect(api.change).not.toHaveBeenCalled();
    c.selectTool('pen'); expect(c.hand()).toBe(false); expect(c.tool()).toBe('pen');
    c.ngOnDestroy(); vi.unstubAllGlobals();
  });
});
