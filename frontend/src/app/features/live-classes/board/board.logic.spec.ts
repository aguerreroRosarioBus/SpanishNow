import { BoardElement, LiveBoard } from '../../../core/models/live-class.model';
import { bounds, moveElement, moveSelection, pageFrame, parsePdfPageSelection, pathOf, pdfGridLayout, point, previewBoard, resizeElement, resizeSelection, selectionBounds, WORLD_BOTTOM, WORLD_RIGHT } from './board.logic';
const e: BoardElement = { id: 'element_001', type: 'note', x: 100, y: 100, w: 280, h: 220, color: '#fff2a8', width: 4, text: 'Hola', authorId: 7, version: 1 };
const board = (): LiveBoard => ({ pages: [{ id: 'page_0001', title: 'Página', background: 'plain', elements: [e] }], activePageId: 'page_0001' });
describe('collaborative board geometry and optimistic preview', () => {
  it('clamps pointer coordinates and preserves stroke direction', () => {
    expect(point(-1000, 2000)).toEqual({ x: -800, y: 1350 });
    expect(bounds(point(300, 200), point(100, 100))).toEqual({ x: 100, y: 100, w: 200, h: 100 });
    expect(pathOf([{ x: 200, y: 0 }, { x: 100, y: 100 }])).toBe('M 200 0 L 100 100');
    expect(pathOf([{ x: 1, y: 2 }])).toContain('l 0.1 0.1');
  });
  it('moves and scales objects and their points anywhere in the surrounding workspace', () => {
    const moved = moveElement({ ...e, type: 'pen', points: [{ x: 100, y: 100 }, { x: 200, y: 200 }] }, -500, 900);
    expect(moved.x).toBe(-400); expect(moved.y).toBe(1000);
    expect(moved.points![0]).toEqual({ x: -400, y: 1000 });
    const resized = resizeElement({ ...e, x: 2399, y: 1349, w: 1, h: 1 }, 2);
    expect(resized.x + resized.w).toBeLessThanOrEqual(WORLD_RIGHT); expect(resized.y + resized.h).toBeLessThanOrEqual(WORLD_BOTTOM);
  });
  it('calculates a shared selection box and resizes every selected object from one corner', () => {
    const second = { ...e, id: 'element_002', x: 500, y: 300, w: 100, h: 100 };
    expect(selectionBounds([e, second])).toEqual({ x: 100, y: 100, w: 500, h: 300 });
    const resized = resizeSelection([e, second], 'se', { x: 600, y: 400 }, { x: 1100, y: 700 });
    expect(resized.map(item => ({ x: item.x, y: item.y, w: item.w, h: item.h }))).toEqual([
      { x: 100, y: 100, w: 560, h: 440 }, { x: 900, y: 500, w: 200, h: 200 }
    ]);
    const constrained = resizeSelection([e, second], 'se', { x: 600, y: 400 }, { x: 4000, y: 4000 });
    expect(Math.max(...constrained.map(item => item.x + item.w))).toBeLessThanOrEqual(WORLD_RIGHT);
    expect(Math.max(...constrained.map(item => item.y + item.h))).toBeLessThanOrEqual(WORLD_BOTTOM);
  });
  it('moves a multi-selection as one unit at the edge of the workspace', () => {
    const first = { ...e, x: 2200, w: 100 }, second = { ...e, id: 'element_002', x: 2300, w: 100 };
    const moved = moveSelection([first, second], 500, 80);
    expect(moved.map(item => item.x)).toEqual([2200, 2300]);
    expect(moved.map(item => item.y)).toEqual([180, 180]);
  });
  it('lays PDF pages out as a centered image grid inside the board bounds', () => {
    const single = pdfGridLayout(1);
    expect(single).toHaveLength(1); expect(single[0].x).toBeGreaterThan(0); expect(single[0].y).toBeGreaterThan(0);
    const grid = pdfGridLayout(7);
    expect(grid).toHaveLength(7);
    expect(Math.min(...grid.map(cell => cell.x))).toBeGreaterThanOrEqual(0);
    expect(Math.min(...grid.map(cell => cell.y))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...grid.map(cell => cell.x + cell.w))).toBeLessThanOrEqual(1600);
    expect(Math.max(...grid.map(cell => cell.y + cell.h))).toBeLessThanOrEqual(900);
    expect(pdfGridLayout(48)).toHaveLength(40);
    const portrait = pageFrame('portrait'), portraitGrid = pdfGridLayout(4, 0.707, 'portrait');
    expect(Math.min(...portraitGrid.map(cell => cell.x))).toBeGreaterThanOrEqual(portrait.x);
    expect(Math.max(...portraitGrid.map(cell => cell.x + cell.w))).toBeLessThanOrEqual(portrait.x + portrait.w);
    expect(Math.max(...portraitGrid.map(cell => cell.y + cell.h))).toBeLessThanOrEqual(portrait.y + portrait.h);
  });
  it('parses selected PDF pages and rejects malformed or excessive ranges', () => {
    expect(parsePdfPageSelection('1-3, 5, 3', 8)).toEqual([1, 2, 3, 5]);
    expect(parsePdfPageSelection(' 2 , 1 ', 8)).toEqual([1, 2]);
    expect(parsePdfPageSelection('', 8)).toBeNull();
    expect(parsePdfPageSelection('3-2', 8)).toBeNull();
    expect(parsePdfPageSelection('1, 9', 8)).toBeNull();
    expect(parsePdfPageSelection('1-41', 50)).toBeNull();
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
  it('previews page renaming and reordering', () => {
    const base = board();
    base.pages.push({ id: 'page_0002', title: 'Segunda', background: 'plain', format: 'wide', elements: [] });
    const renamed = previewBoard(base, [{ id: 'operation_01', type: 'page-rename', pageId: 'page_0001', title: 'Inicio' }])!;
    const reordered = previewBoard(renamed, [{ id: 'operation_02', type: 'page-reorder', pageId: 'page_0001', index: 1 }])!;
    expect(reordered.pages.map(page => page.id)).toEqual(['page_0002', 'page_0001']);
    expect(reordered.pages[1].title).toBe('Inicio');
    expect(base.pages[0].title).toBe('Página');
  });
});
