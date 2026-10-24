import { BoardElement, BoardFormat, BoardOperation, BoardPage, BoardPoint, LiveBoard } from '../../../core/models/live-class.model';
export const BOARD_W = 1600;
export const BOARD_H = 900;
export const WORLD_X = -800;
export const WORLD_Y = -450;
export const WORLD_W = 3200;
export const WORLD_H = 1800;
export const WORLD_RIGHT = WORLD_X + WORLD_W;
export const WORLD_BOTTOM = WORLD_Y + WORLD_H;
const PAGE_SIZES: Record<BoardFormat, { w: number; h: number }> = {
  wide: { w: 1600, h: 900 }, standard: { w: 1200, h: 900 }, square: { w: 900, h: 900 }, portrait: { w: 675, h: 900 }, notebook: { w: 700, h: 900 }
};
export function pageFrame(page?: Pick<BoardPage, 'format'> | BoardFormat): ElementBounds {
  const format = typeof page === 'string' ? page : page?.format || 'wide';
  const { w, h } = PAGE_SIZES[format] || PAGE_SIZES.wide;
  return { x: (BOARD_W - w) / 2, y: (BOARD_H - h) / 2, w, h };
}
export const newId = () => crypto.randomUUID();
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const point = (x: number, y: number): BoardPoint => ({ x: Math.round(clamp(x, WORLD_X, WORLD_RIGHT) * 10) / 10, y: Math.round(clamp(y, WORLD_Y, WORLD_BOTTOM) * 10) / 10 });
export const pathOf = (points: BoardPoint[] = []) => points.length === 1
  ? `M ${points[0].x} ${points[0].y} l 0.1 0.1`
  : points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
export function bounds(a: BoardPoint, b: BoardPoint) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x: clamp(x, WORLD_X, WORLD_RIGHT - 1), y: clamp(y, WORLD_Y, WORLD_BOTTOM - 1), w: Math.max(1, Math.abs(a.x - b.x)), h: Math.max(1, Math.abs(a.y - b.y)) };
}
export function moveElement(e: BoardElement, dx: number, dy: number): BoardElement {
  const x = Math.round(clamp(e.x + dx, WORLD_X, WORLD_RIGHT - e.w) * 10) / 10;
  const y = Math.round(clamp(e.y + dy, WORLD_Y, WORLD_BOTTOM - e.h) * 10) / 10;
  return { ...e, x, y, ...(e.points ? { points: e.points.map(p => point(p.x + x - e.x, p.y + y - e.y)) } : {}) };
}
/** Keep a group together when its shared box reaches the edge of the workspace. */
export function moveSelection(elements: BoardElement[], dx: number, dy: number): BoardElement[] {
  const box = selectionBounds(elements);
  if (!box) return elements;
  const sharedX = clamp(dx, WORLD_X - box.x, WORLD_RIGHT - box.x - box.w);
  const sharedY = clamp(dy, WORLD_Y - box.y, WORLD_BOTTOM - box.y - box.h);
  return elements.map(element => moveElement(element, sharedX, sharedY));
}
export function resizeElement(e: BoardElement, scale: number): BoardElement {
  const maxW = Math.min(WORLD_RIGHT - e.x, 1200), maxH = Math.min(WORLD_BOTTOM - e.y, 800);
  const w = clamp(e.w * scale, Math.min(20, maxW), maxW);
  const h = clamp(e.h * scale, Math.min(20, maxH), maxH);
  return { ...e, w: Math.round(w), h: Math.round(h), ...(e.points ? { points: e.points.map(p => point(e.x + (p.x - e.x) * w / e.w, e.y + (p.y - e.y) * h / e.h)) } : {}) };
}
export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';
export interface ElementBounds { x: number; y: number; w: number; h: number; }
/** Centers PDF pages in a compact grid while keeping every page inside the current frame. */
export function pdfGridLayout(count: number, aspect = 0.707, format?: BoardFormat): ElementBounds[] {
  const total = Math.max(0, Math.min(40, Math.floor(count)));
  if (!total) return [];
  const ratio = clamp(Number.isFinite(aspect) ? aspect : 0.707, 0.35, 2.5);
  const frame = pageFrame(format);
  const margin = 32, gap = 16;
  let best = { columns: 1, rows: total, width: 0, height: 0, area: 0 };
  for (let columns = 1; columns <= total; columns++) {
    const rows = Math.ceil(total / columns);
    const width = Math.min((frame.w - 2 * margin - gap * (columns - 1)) / columns,
      ((frame.h - 2 * margin - gap * (rows - 1)) / rows) * ratio);
    const height = width / ratio, area = width * height;
    if (area > best.area) best = { columns, rows, width, height, area };
  }
  return Array.from({ length: total }, (_, index) => {
    const col = index % best.columns, row = Math.floor(index / best.columns);
    const rowCount = Math.min(best.columns, total - row * best.columns);
    const rowWidth = rowCount * best.width + (rowCount - 1) * gap;
    const x = frame.x + (frame.w - rowWidth) / 2 + col * (best.width + gap);
    const totalHeight = best.rows * best.height + (best.rows - 1) * gap;
    const y = frame.y + (frame.h - totalHeight) / 2 + row * (best.height + gap);
    return { x, y, w: best.width, h: best.height };
  });
}
/** Parse one-based PDF pages such as "1-3, 5"; invalid or excessive selections return null. */
export function parsePdfPageSelection(value: string, totalPages: number): number[] | null {
  if (!Number.isInteger(totalPages) || totalPages < 1 || typeof value !== 'string' || !value.trim()) return null;
  const selected = new Set<number>();
  for (const token of value.split(',')) {
    const part = token.trim();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) return null;
    const first = Number(match[1]), last = Number(match[2] || match[1]);
    if (first < 1 || last > totalPages || first > last || last - first + 1 > 40) return null;
    for (let page = first; page <= last; page++) selected.add(page);
    if (selected.size > 40) return null;
  }
  return selected.size ? [...selected].sort((a, b) => a - b) : null;
}
export function selectionBounds(elements: BoardElement[]): ElementBounds | null {
  if (!elements.length) return null;
  const left = Math.min(...elements.map(e => e.x)), top = Math.min(...elements.map(e => e.y));
  const right = Math.max(...elements.map(e => e.x + e.w)), bottom = Math.max(...elements.map(e => e.y + e.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}
/** Resize a selection from a corner while preserving proportions and keeping it on the workspace. */
export function resizeSelection(elements: BoardElement[], handle: ResizeHandle, start: BoardPoint, end: BoardPoint): BoardElement[] {
  const box = selectionBounds(elements);
  if (!box || !box.w || !box.h) return elements;
  const anchor = {
    x: handle.includes('w') ? box.x + box.w : box.x,
    y: handle.includes('n') ? box.y + box.h : box.y
  };
  const startX = Math.abs(start.x - anchor.x), startY = Math.abs(start.y - anchor.y);
  if (!startX || !startY) return elements;
  const requested = (Math.abs(end.x - anchor.x) / startX + Math.abs(end.y - anchor.y) / startY) / 2;
  const roomX = anchor.x < box.x + box.w / 2 ? WORLD_RIGHT - anchor.x : anchor.x - WORLD_X;
  const roomY = anchor.y < box.y + box.h / 2 ? WORLD_BOTTOM - anchor.y : anchor.y - WORLD_Y;
  const scale = clamp(requested, 0.05, Math.max(0.05, Math.min(roomX / box.w, roomY / box.h)));
  const transform = (value: number, origin: number) => Math.round((origin + (value - origin) * scale) * 10) / 10;
  return elements.map(e => {
    const x = transform(e.x, anchor.x), y = transform(e.y, anchor.y);
    const w = Math.max(1, Math.round(e.w * scale * 10) / 10), h = Math.max(1, Math.round(e.h * scale * 10) / 10);
    return { ...e, x, y, w, h, ...(e.points ? { points: e.points.map(p => point(transform(p.x, anchor.x), transform(p.y, anchor.y))) } : {}) };
  });
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
    else if (op.type === 'page-add') { board.pages.push({ id: op.pageId, title: op.title || 'Página', background: 'plain', format: op.format || 'wide', elements: [] }); board.activePageId = op.pageId; }
    else if (op.type === 'page-active' && page) board.activePageId = page.id;
    else if (op.type === 'page-background' && page && op.background) page.background = op.background;
    else if (op.type === 'page-format' && page && op.format) page.format = op.format;
    else if (op.type === 'page-rename' && page && op.title?.trim()) page.title = op.title.trim().slice(0, 80);
    else if (op.type === 'page-reorder' && page && Number.isInteger(op.index) && op.index! >= 0 && op.index! < board.pages.length) {
      const [moved] = board.pages.splice(board.pages.indexOf(page), 1); board.pages.splice(op.index!, 0, moved);
    }
    else if (op.type === 'page-clear' && page) page.elements = [];
    else if (op.type === 'page-delete' && board.pages.length > 1) { board.pages = board.pages.filter(p => p.id !== op.pageId); if (board.activePageId === op.pageId) board.activePageId = board.pages[0].id; }
  }
  return board;
}
export const editableElement = (e: BoardElement, userId: number, owner: boolean) => owner || e.authorId === userId;
