import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { LiveRoomComponent } from './live-room.component';
import { LiveClassService } from '../../core/services/live-class.service';
import { AuthService } from '../../core/services/auth.service';
import { BoardOperation, LiveBoard, LiveSnapshot } from '../../core/models/live-class.model';
import { previewBoard } from './board/board.logic';

const board = (): LiveBoard => ({ pages: [{ id: 'page_0001', title: 'Página 1', elements: [], background: 'plain' }], activePageId: 'page_0001' });
const snapshot = (owner = true): LiveSnapshot => ({ id: 1, teacherId: 7, courseId: null, title: 'Mi clase', status: 'live', allowStudentEdit: true,
  revision: 0, updatedAt: '', createdAt: '', isOwner: owner, participants: [], board: board() });
const operation = (): BoardOperation => ({ id: 'operation_01', type: 'put', pageId: 'page_0001', expectedVersion: 0,
  element: { id: 'element_001', type: 'note', x: 100, y: 100, w: 200, h: 200, text: 'Aporte local', width: 4, color: '#fff2a8', authorId: 7, version: 0 } });
describe('LiveRoomComponent collaboration', () => {
  async function create(owner = true) {
    const data = snapshot(owner);
    const api = { snapshot: vi.fn(() => of(data)), presence: vi.fn(() => of(undefined)), googleStatus: vi.fn(() => of({ configured: false, connected: false, email: null })), change: vi.fn(), settings: vi.fn(), restore: vi.fn() };
    TestBed.configureTestingModule({ imports: [LiveRoomComponent], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: new Map([['id', '1']]) } } },
      { provide: AuthService, useValue: { currentUser: signal({ id: owner ? 7 : 8, role: owner ? 'teacher' : 'student' }) } },
      { provide: LiveClassService, useValue: api }] });
    const fixture = TestBed.createComponent(LiveRoomComponent); const c = fixture.componentInstance;
    await c.refresh();
    return { fixture, c, api, data };
  }
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
});
