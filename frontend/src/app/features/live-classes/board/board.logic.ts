import { BoardElement, BoardOperation, BoardPoint, LiveBoard } from '../../../core/models/live-class.model';
export const BOARD_W = 1600;
export const BOARD_H = 900;
export const newId = () => crypto.randomUUID();
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const point = (x: number, y: number): BoardPoint => ({ x: Math.round(clamp(x, 0, BOARD_W) * 10) / 10, y: Math.round(clamp(y, 0, BOARD_H) * 10) / 10 });
export const pathOf = (points: BoardPoint[] = []) => points.length === 1
  ? `M ${points[0].x} ${points[0].y} l 0.1 0.1`
  : points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
export function bounds(a: BoardPoint, b: BoardPoint) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x: Math.min(x, 1599), y: Math.min(y, 899), w: Math.max(1, Math.abs(a.x - b.x)), h: Math.max(1, Math.abs(a.y - b.y)) };
}
export function moveElement(e: BoardElement, dx: number, dy: number): BoardElement {
  const x = Math.round(clamp(e.x + dx, 0, BOARD_W - e.w) * 10) / 10;
  const y = Math.round(clamp(e.y + dy, 0, BOARD_H - e.h) * 10) / 10;
  return { ...e, x, y, ...(e.points ? { points: e.points.map(p => point(p.x + x - e.x, p.y + y - e.y)) } : {}) };
}
export function resizeElement(e: BoardElement, scale: number): BoardElement {
  const maxW = Math.min(BOARD_W - e.x, 1200), maxH = Math.min(BOARD_H - e.y, 800);
  const w = clamp(e.w * scale, Math.min(20, maxW), maxW);
  const h = clamp(e.h * scale, Math.min(20, maxH), maxH);
  return { ...e, w: Math.round(w), h: Math.round(h), ...(e.points ? { points: e.points.map(p => point(e.x + (p.x - e.x) * w / e.w, e.y + (p.y - e.y) * h / e.h)) } : {}) };
}
/** Local preview only. The server remains authoritative and checks ownership, versions and limits. */
export function previewBoard(base: LiveBoard | null, pending: BoardOperation[]): LiveBoard | null {
  if (!base || !pending.length) return base;
  const board = structuredClone(base);
  for (const op of pending) {
    const page = board.pages.find(p => p.id === op.pageId);
    if (op.type === 'put' && page && op.element) {
      const index = page.elements.findIndex(e => e.id === op.element!.id);
      const e = { ...op.element, version: (op.expectedVersion || 0) + 1 };
      if (index < 0) page.elements.push(e); else page.elements[index] = e;
    } else if (op.type === 'delete' && page) page.elements = page.elements.filter(e => e.id !== op.elementId);
    else if (op.type === 'page-add') { board.pages.push({ id: op.pageId, title: op.title || 'Página', background: 'plain', elements: [] }); board.activePageId = op.pageId; }
    else if (op.type === 'page-active' && page) board.activePageId = page.id;
    else if (op.type === 'page-background' && page && op.background) page.background = op.background;
    else if (op.type === 'page-clear' && page) page.elements = [];
    else if (op.type === 'page-delete' && board.pages.length > 1) { board.pages = board.pages.filter(p => p.id !== op.pageId); if (board.activePageId === op.pageId) board.activePageId = board.pages[0].id; }
  }
  return board;
}
export const editableElement = (e: BoardElement, userId: number, owner: boolean) => owner || e.authorId === userId;
