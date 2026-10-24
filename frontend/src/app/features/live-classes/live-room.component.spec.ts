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

const board = (): LiveBoard => ({ pages: [{ id: 'page_0001', title: 'Página 1', elements: [], background: 'plain', format: 'wide' }], activePageId: 'page_0001' });
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
  it('undoes and redoes saved object changes through versioned board operations', async () => {
    const { c, api } = await create(); const op = operation();
    const added = previewBoard(board(), [op])!;
    api.change.mockReturnValueOnce(of({ revision: 1, board: added })); c.queue(op);
    await Promise.resolve(); await Promise.resolve();
    expect(c.canUndo()).toBe(true); expect(c.undoActions()).toHaveLength(1);
    const empty = board();
    api.change.mockReturnValueOnce(of({ revision: 2, board: empty })); c.undo();
    await Promise.resolve(); await Promise.resolve();
    expect(c.board()!.pages[0].elements).toHaveLength(0); expect(c.canRedo()).toBe(true); expect(c.canUndo()).toBe(false);
    const restored = previewBoard(empty, [{ ...op, id: 'operation_002', expectedVersion: 0 }])!;
    api.change.mockReturnValueOnce(of({ revision: 3, board: restored })); c.redo();
    await Promise.resolve(); await Promise.resolve();
    expect(c.board()!.pages[0].elements[0].text).toBe('Aporte local'); expect(c.canUndo()).toBe(true); expect(c.canRedo()).toBe(false);
    expect(api.change.mock.calls.map(call => call[1][0].type)).toEqual(['put', 'delete', 'put']);
  });
  it('undoes and redoes page format and notebook background together', async () => {
    const { c, api } = await create();
    const originalRaf = globalThis.requestAnimationFrame;
    Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, writable: true, value: (callback: FrameRequestCallback) => { callback(0); return 1; } });
    const notebook: LiveBoard = { ...board(), pages: [{ ...board().pages[0], format: 'notebook', background: 'lines' }] };
    api.change.mockReturnValueOnce(of({ revision: 1, board: notebook })); c.pageFormat('notebook');
    await Promise.resolve(); await Promise.resolve();
    expect(c.currentPage()).toMatchObject({ format: 'notebook', background: 'lines' }); expect(c.canUndo()).toBe(true);
    api.change.mockReturnValueOnce(of({ revision: 2, board: board() })); c.undo();
    await Promise.resolve(); await Promise.resolve();
    expect(c.currentPage()).toMatchObject({ format: 'wide', background: 'plain' }); expect(c.canRedo()).toBe(true);
    expect(api.change.mock.calls[1][1].map((op: BoardOperation) => op.type)).toEqual(['page-format', 'page-background']);
    c.ngOnDestroy();
    if (originalRaf) Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, writable: true, value: originalRaf });
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  });
  it('undoes and redoes a page rename with revision guarded operations', async () => {
    const { c, api } = await create();
    const original = board(), renamed: LiveBoard = { ...board(), pages: [{ ...board().pages[0], title: 'Inicio' }] };
    api.change.mockReturnValueOnce(of({ revision: 1, board: renamed }));
    c.pageTitleDraft.set('Inicio'); c.savePageTitle();
    await Promise.resolve(); await Promise.resolve();
    expect(c.currentPage()?.title).toBe('Inicio'); expect(c.canUndo()).toBe(true);
    api.change.mockReturnValueOnce(of({ revision: 2, board: original })); c.undo();
    await Promise.resolve(); await Promise.resolve();
    expect(c.currentPage()?.title).toBe('Página 1'); expect(c.canRedo()).toBe(true);
    api.change.mockReturnValueOnce(of({ revision: 3, board: renamed })); c.redo();
    await Promise.resolve(); await Promise.resolve();
    expect(c.currentPage()?.title).toBe('Inicio');
    expect(api.change.mock.calls.map(call => call[1][0])).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'page-rename', title: 'Inicio', expectedRevision: 0 }),
      expect.objectContaining({ type: 'page-rename', title: 'Página 1', expectedRevision: 1 })
    ]));
  });
  it('reorders a page and can undo the order change', async () => {
    const { c, api } = await create();
    const twoPages: LiveBoard = { ...board(), pages: [
      { ...board().pages[0] }, { id: 'page_0002', title: 'Página 2', elements: [], background: 'plain', format: 'wide' }
    ] };
    const reordered: LiveBoard = { ...twoPages, pages: [twoPages.pages[1], twoPages.pages[0]] };
    (c as any).base.set(twoPages); c.room.update(room => room ? { ...room, revision: 5 } : room);
    api.change.mockReturnValueOnce(of({ revision: 6, board: reordered })); c.movePage(1);
    await Promise.resolve(); await Promise.resolve();
    expect(c.board()?.pages.map(page => page.id)).toEqual(['page_0002', 'page_0001']);
    api.change.mockReturnValueOnce(of({ revision: 7, board: twoPages })); c.undo();
    await Promise.resolve(); await Promise.resolve();
    expect(c.board()?.pages.map(page => page.id)).toEqual(['page_0001', 'page_0002']);
    expect(api.change.mock.calls[0][1][0]).toMatchObject({ type: 'page-reorder', index: 1, expectedRevision: 5 });
    expect(api.change.mock.calls[1][1][0]).toMatchObject({ type: 'page-reorder', index: 0, expectedRevision: 6 });
  });
  it('keeps normal wheel scrolling separate from modified-wheel and trackpad zoom', async () => {
    const { c } = await create();
    const viewport = document.createElement('div');
    Object.defineProperties(viewport, { scrollWidth: { value: 1000 }, scrollHeight: { value: 900 }, clientWidth: { value: 500 }, clientHeight: { value: 400 }, scrollLeft: { value: 100, writable: true }, scrollTop: { value: 120, writable: true } });
    viewport.getBoundingClientRect = () => ({ left: 10, top: 20, width: 500, height: 400 }) as DOMRect;
    viewport.scrollTo = vi.fn(); (c as any).viewportElement = viewport;
    const wheel = { target: viewport, deltaX: 0, deltaY: -100, ctrlKey: false, metaKey: false, clientX: 260, clientY: 220, preventDefault: vi.fn() } as unknown as WheelEvent;
    c.zoomWheel(wheel);
    expect(c.zoom()).toBe(50); expect(wheel.preventDefault).not.toHaveBeenCalled();
    const pinch = { target: viewport, deltaX: 100, deltaY: -80, ctrlKey: true, metaKey: false, clientX: 260, clientY: 220, preventDefault: vi.fn() } as unknown as WheelEvent;
    c.zoomWheel(pinch);
    expect(c.zoom()).toBeGreaterThan(50); expect(pinch.preventDefault).toHaveBeenCalled();
    const mouseWheel = { target: viewport, deltaX: 0, deltaY: -100, ctrlKey: false, metaKey: true, clientX: 260, clientY: 220, preventDefault: vi.fn() } as unknown as WheelEvent;
    c.zoomWheel(mouseWheel);
    expect(c.zoom()).toBeGreaterThan(50); expect(mouseWheel.preventDefault).toHaveBeenCalled();
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
