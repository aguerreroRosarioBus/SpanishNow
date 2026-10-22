import { BoardElement, LiveBoard } from '../../../core/models/live-class.model';
import { bounds, moveElement, pathOf, point, previewBoard, resizeElement } from './board.logic';
const e: BoardElement = { id: 'element_001', type: 'note', x: 100, y: 100, w: 280, h: 220, color: '#fff2a8', width: 4, text: 'Hola', authorId: 7, version: 1 };
const board = (): LiveBoard => ({ pages: [{ id: 'page_0001', title: 'Página', background: 'plain', elements: [e] }], activePageId: 'page_0001' });
describe('collaborative board geometry and optimistic preview', () => {
  it('clamps pointer coordinates and preserves stroke direction', () => {
    expect(point(-10, 1000)).toEqual({ x: 0, y: 900 });
    expect(bounds(point(300, 200), point(100, 100))).toEqual({ x: 100, y: 100, w: 200, h: 100 });
    expect(pathOf([{ x: 200, y: 0 }, { x: 100, y: 100 }])).toBe('M 200 0 L 100 100');
    expect(pathOf([{ x: 1, y: 2 }])).toContain('l 0.1 0.1');
  });
  it('moves and scales objects and their points without leaving the page', () => {
    const moved = moveElement({ ...e, type: 'pen', points: [{ x: 100, y: 100 }, { x: 200, y: 200 }] }, -500, 900);
    expect(moved.x).toBe(0); expect(moved.y).toBe(680);
    expect(moved.points![0]).toEqual({ x: 0, y: 680 });
    const resized = resizeElement({ ...e, x: 1599, y: 899, w: 1, h: 1 }, 2);
    expect(resized.x + resized.w).toBeLessThanOrEqual(1600); expect(resized.y + resized.h).toBeLessThanOrEqual(900);
  });
  it('preview preserves unrelated remote objects and never mutates confirmed state', () => {
    const base = board();
    const next = previewBoard(base, [{ id: 'operation_01', type: 'put', pageId: base.activePageId, element: { ...e, id: 'element_002', text: 'Nuevo' }, expectedVersion: 0 }])!;
    expect(next.pages[0].elements).toHaveLength(2); expect(base.pages[0].elements).toHaveLength(1);
    expect(next.pages[0].elements[1].version).toBe(1);
  });
  it('deletes only the selected element and supports page management previews', () => {
    const base = board();
    const next = previewBoard(base, [{ id: 'operation_01', type: 'delete', pageId: base.activePageId, elementId: e.id },
      { id: 'operation_02', type: 'page-add', pageId: 'page_0002', title: 'Otra página' }])!;
    expect(next.pages[0].elements).toEqual([]); expect(next.activePageId).toBe('page_0002');
    const deleted = previewBoard(next, [{ id: 'operation_03', type: 'page-delete', pageId: 'page_0002' }])!;
    expect(deleted.pages).toHaveLength(1); expect(deleted.activePageId).toBe(base.activePageId);
  });
});
