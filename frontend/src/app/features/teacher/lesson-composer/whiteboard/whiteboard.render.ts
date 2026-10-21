import { DrawOp, MARKER_ALPHA, ellipseFromDrag, lineEnd, normalizeRect, pressureFactor, smoothPath } from './whiteboard.logic';

export type Ctx = Pick<CanvasRenderingContext2D, 'save' | 'restore' | 'beginPath' | 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'stroke' | 'fill' | 'arc' | 'ellipse' | 'rect' | 'strokeRect'> &
  { strokeStyle: any; fillStyle: any; lineWidth: number; lineCap: CanvasLineCap; lineJoin: CanvasLineJoin; globalAlpha: number };

/** Dibuja una operación en el contexto (coordenadas lógicas). El borrador pinta en blanco. */
export function renderOp(ctx: Ctx, op: DrawOp): void {
  if (op.kind === 'clear' || !op.points.length) return;
  const color = op.tool === 'eraser' ? '#ffffff' : op.color;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = op.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = op.tool === 'marker' ? MARKER_ALPHA : 1;
  if (op.kind === 'shape') renderShape(ctx, op);
  else renderStroke(ctx, op);
  ctx.restore();
}

function renderStroke(ctx: Ctx, op: DrawOp): void {
  const path = smoothPath(op.points);
  if (!path) return;
  if (!path.end) { // un solo clic: punto
    ctx.beginPath(); ctx.arc(path.start.x, path.start.y, op.width / 2, 0, Math.PI * 2); ctx.fill(); return;
  }
  const pressureVaries = op.tool === 'pen' && op.points.some(p => p.p !== op.points[0].p);
  if (!pressureVaries) {
    ctx.beginPath(); ctx.moveTo(path.start.x, path.start.y);
    path.curves.forEach(c => ctx.quadraticCurveTo(c.cp.x, c.cp.y, c.to.x, c.to.y));
    ctx.lineTo(path.end.x, path.end.y); ctx.stroke(); return;
  }
  // Con presión variable cada tramo lleva su propio ancho (el lápiz es opaco, no hay solapes visibles).
  const base = op.width;
  let from = path.start;
  const segs = [...path.curves.map(c => ({ cp: c.cp, to: c.to })), { cp: path.end, to: path.end }];
  for (const seg of segs) {
    ctx.lineWidth = base * pressureFactor(seg.cp.p);
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.quadraticCurveTo(seg.cp.x, seg.cp.y, seg.to.x, seg.to.y); ctx.stroke();
    from = seg.to;
  }
}

function renderShape(ctx: Ctx, op: DrawOp): void {
  const [a, b = a] = op.points;
  if (op.tool === 'line') {
    const end = lineEnd(a, b, op.constrain);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(end.x, end.y); ctx.stroke();
  } else if (op.tool === 'rect') {
    const r = normalizeRect(a, b, op.constrain);
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.stroke();
  } else if (op.tool === 'ellipse') {
    const e = ellipseFromDrag(a, b, op.constrain);
    ctx.beginPath(); ctx.ellipse(e.cx, e.cy, Math.max(0.5, e.rx), Math.max(0.5, e.ry), 0, 0, Math.PI * 2); ctx.stroke();
  }
}
