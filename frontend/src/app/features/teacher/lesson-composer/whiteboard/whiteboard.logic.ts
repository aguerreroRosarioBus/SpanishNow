/** Lógica pura de la pizarra: herramientas, historial, suavizado y geometría de formas. Sin DOM. */

export const BOARD_WIDTH = 1200;
export const BOARD_HEIGHT = 900;

export type Tool = 'pen' | 'marker' | 'eraser' | 'line' | 'rect' | 'ellipse';
export interface Pt { x: number; y: number; /** presión 0..1 (0.5 = ratón/táctil) */ p: number; }

export interface ToolInfo { id: Tool; labelKey: string; shortcut: string; icon: string; }
export const TOOLS: ToolInfo[] = [
  { id: 'pen', labelKey: 'teacherComposer.wb.tool.pen', shortcut: 'P', icon: 'pencil' },
  { id: 'marker', labelKey: 'teacherComposer.wb.tool.marker', shortcut: 'M', icon: 'highlighter' },
  { id: 'eraser', labelKey: 'teacherComposer.wb.tool.eraser', shortcut: 'E', icon: 'eraser' },
  { id: 'line', labelKey: 'teacherComposer.wb.tool.line', shortcut: 'L', icon: 'line' },
  { id: 'rect', labelKey: 'teacherComposer.wb.tool.rect', shortcut: 'R', icon: 'rectangle' },
  { id: 'ellipse', labelKey: 'teacherComposer.wb.tool.ellipse', shortcut: 'O', icon: 'ellipse' },
];
export const isShapeTool = (tool: Tool): boolean => tool === 'line' || tool === 'rect' || tool === 'ellipse';

export function toolForShortcut(key: string): Tool | null {
  const upper = key.length === 1 ? key.toUpperCase() : '';
  return TOOLS.find(t => t.shortcut === upper)?.id ?? null;
}

/** Colores pensados para ilustraciones infantiles. */
export const PALETTE: { value: string; nameKey: string }[] = [
  { value: '#222222', nameKey: 'teacherComposer.wb.color.black' }, { value: '#e53935', nameKey: 'teacherComposer.wb.color.red' }, { value: '#fb8c00', nameKey: 'teacherComposer.wb.color.orange' },
  { value: '#fdd835', nameKey: 'teacherComposer.wb.color.yellow' }, { value: '#43a047', nameKey: 'teacherComposer.wb.color.green' }, { value: '#26c6da', nameKey: 'teacherComposer.wb.color.cyan' },
  { value: '#1e88e5', nameKey: 'teacherComposer.wb.color.blue' }, { value: '#8e24aa', nameKey: 'teacherComposer.wb.color.purple' }, { value: '#ec407a', nameKey: 'teacherComposer.wb.color.pink' },
  { value: '#8d6e63', nameKey: 'teacherComposer.wb.color.brown' },
];
/** Grosores base (px lógicos) mostrados como puntos de tamaño creciente. */
export const SIZES: number[] = [3, 6, 10, 16, 26];
export const ERASER_FACTOR = 2.2;
export const MARKER_FACTOR = 2.4;
export const MARKER_ALPHA = 0.4;

export interface DrawOp {
  kind: 'stroke' | 'shape' | 'clear';
  tool: Tool;
  color: string;
  width: number;
  points: Pt[]; // stroke: trazo; shape: [inicio, fin]
  constrain?: boolean;
}

/** Modulación por presión del lápiz (0.6x–1.4x); ratón/táctil (0.5) o sin presión no modulan. */
export const pressureFactor = (pressure: number): number => (Math.abs(pressure - 0.5) < 1e-6 || pressure <= 0 ? 1 : 0.6 + 0.8 * Math.min(1, pressure));

/** Ancho efectivo: herramienta × grosor × presión. */
export function widthFor(tool: Tool, size: number, pressure = 0.5): number {
  const factor = tool === 'eraser' ? ERASER_FACTOR : tool === 'marker' ? MARKER_FACTOR : 1;
  return Math.max(0.5, size * factor * pressureFactor(pressure));
}

export interface SmoothPath { start: Pt; curves: { cp: Pt; to: Pt }[]; end: Pt | null; }
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, p: (a.p + b.p) / 2 });

/** Suavizado por curvas cuadráticas: cada punto es punto de control y el destino es el punto medio con el siguiente. */
export function smoothPath(points: Pt[]): SmoothPath | null {
  if (!points.length) return null;
  const curves: { cp: Pt; to: Pt }[] = [];
  for (let i = 1; i < points.length - 1; i++) curves.push({ cp: points[i], to: mid(points[i], points[i + 1]) });
  return { start: points[0], curves, end: points.length > 1 ? points[points.length - 1] : null };
}

/** Añade un punto descartando los que casi no se mueven (reduce ruido y memoria). */
export function appendPoint(points: Pt[], next: Pt, minDistance = 0.8): Pt[] {
  const last = points[points.length - 1];
  if (last && Math.hypot(next.x - last.x, next.y - last.y) < minDistance) return points;
  return [...points, next];
}

export const clampToBoard = (p: Pt): Pt => ({ ...p, x: Math.min(BOARD_WIDTH, Math.max(0, p.x)), y: Math.min(BOARD_HEIGHT, Math.max(0, p.y)) });

/** Rectángulo normalizado entre dos esquinas; con `square` se fuerza un cuadrado (Mayús). */
export function normalizeRect(a: Pt, b: Pt, square = false): { x: number; y: number; w: number; h: number } {
  let dx = b.x - a.x, dy = b.y - a.y;
  if (square) { const s = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * s; dy = Math.sign(dy || 1) * s; }
  return { x: Math.min(a.x, a.x + dx), y: Math.min(a.y, a.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
}

/** Elipse inscrita en el rectángulo arrastrado; con `circle` es un círculo. */
export function ellipseFromDrag(a: Pt, b: Pt, circle = false): { cx: number; cy: number; rx: number; ry: number } {
  const r = normalizeRect(a, b, circle);
  return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, rx: r.w / 2, ry: r.h / 2 };
}

/** Extremo de la línea; con `snap` se ajusta al múltiplo de 45° más cercano. */
export function lineEnd(a: Pt, b: Pt, snap = false): Pt {
  if (!snap) return b;
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: a.x + Math.cos(angle) * len, y: a.y + Math.sin(angle) * len, p: b.p };
}

/** Historial de operaciones con deshacer/rehacer. Inmutable hacia fuera (devuelve copias). */
export class History<T> {
  private done: T[] = [];
  private undone: T[] = [];
  constructor(private readonly limit = 300) {}

  get items(): readonly T[] { return this.done; }
  get canUndo(): boolean { return this.done.length > 0; }
  get canRedo(): boolean { return this.undone.length > 0; }

  push(item: T): void {
    this.done.push(item);
    if (this.done.length > this.limit) this.done.shift();
    this.undone = [];
  }
  undo(): T | undefined { const item = this.done.pop(); if (item !== undefined) this.undone.push(item); return item; }
  redo(): T | undefined { const item = this.undone.pop(); if (item !== undefined) this.done.push(item); return item; }
}

/** Operaciones visibles: lo posterior al último «borrar todo» (que sí se puede deshacer). */
export function visibleOps(ops: readonly DrawOp[]): DrawOp[] {
  let from = 0;
  ops.forEach((op, i) => { if (op.kind === 'clear') from = i + 1; });
  return ops.slice(from);
}
