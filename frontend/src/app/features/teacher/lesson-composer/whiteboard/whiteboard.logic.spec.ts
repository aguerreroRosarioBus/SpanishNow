import { BOARD_WIDTH, DrawOp, History, Pt, TOOLS, appendPoint, clampToBoard, ellipseFromDrag, lineEnd, normalizeRect, smoothPath, toolForShortcut, visibleOps, widthFor } from './whiteboard.logic';
import { renderOp } from './whiteboard.render';

const pt = (x: number, y: number, p = 0.5): Pt => ({ x, y, p });
const op = (n: number, kind: DrawOp['kind'] = 'stroke'): DrawOp => ({ kind, tool: 'pen', color: '#000', width: n, points: [pt(n, n)] });

describe('whiteboard.logic', () => {
  describe('History', () => {
    it('deshace y rehace en orden', () => {
      const h = new History<number>();
      h.push(1); h.push(2); h.push(3);
      expect(h.undo()).toBe(3); expect(h.undo()).toBe(2);
      expect(h.items).toEqual([1]);
      expect(h.canRedo).toBe(true);
      expect(h.redo()).toBe(2);
      expect(h.items).toEqual([1, 2]);
    });
    it('un trazo nuevo descarta lo rehacible', () => {
      const h = new History<number>();
      h.push(1); h.push(2); h.undo(); h.push(9);
      expect(h.canRedo).toBe(false);
      expect(h.items).toEqual([1, 9]);
    });
    it('deshacer sin historial no falla y respeta el límite', () => {
      const h = new History<number>(2);
      expect(h.undo()).toBeUndefined();
      h.push(1); h.push(2); h.push(3);
      expect(h.items).toEqual([2, 3]);
    });
  });

  it('visibleOps ignora lo anterior a «borrar todo», que se puede deshacer', () => {
    const h = new History<DrawOp>();
    h.push(op(1)); h.push(op(2)); h.push(op(0, 'clear')); h.push(op(3));
    expect(visibleOps(h.items).map(o => o.width)).toEqual([3]);
    h.undo(); h.undo();
    expect(visibleOps(h.items).map(o => o.width)).toEqual([1, 2]);
  });

  describe('smoothPath', () => {
    it('sin puntos devuelve null y con uno es un punto', () => {
      expect(smoothPath([])).toBeNull();
      expect(smoothPath([pt(1, 1)])!.end).toBeNull();
    });
    it('dos puntos: sin curvas, solo línea', () => {
      const s = smoothPath([pt(0, 0), pt(10, 0)])!;
      expect(s.curves).toEqual([]);
      expect(s.end).toEqual(pt(10, 0));
    });
    it('usa cada punto intermedio como control y el punto medio como destino', () => {
      const s = smoothPath([pt(0, 0), pt(10, 0), pt(10, 10)])!;
      expect(s.curves).toHaveLength(1);
      expect(s.curves[0].cp).toEqual(pt(10, 0));
      expect(s.curves[0].to).toMatchObject({ x: 10, y: 5 });
    });
  });

  it('appendPoint descarta puntos casi idénticos', () => {
    const a = [pt(0, 0)];
    expect(appendPoint(a, pt(0.2, 0.2))).toBe(a);
    expect(appendPoint(a, pt(5, 5))).toHaveLength(2);
  });

  it('clampToBoard mantiene el punto dentro de la pizarra', () => {
    expect(clampToBoard(pt(-5, 99999))).toMatchObject({ x: 0, y: 900 });
    expect(clampToBoard(pt(BOARD_WIDTH + 10, 3)).x).toBe(BOARD_WIDTH);
  });

  describe('formas', () => {
    it('normalizeRect funciona arrastrando en cualquier dirección', () => {
      expect(normalizeRect(pt(50, 60), pt(10, 20))).toEqual({ x: 10, y: 20, w: 40, h: 40 });
    });
    it('con Mayús el rectángulo es cuadrado y conserva el cuadrante', () => {
      expect(normalizeRect(pt(50, 50), pt(20, 40), true)).toEqual({ x: 20, y: 20, w: 30, h: 30 });
    });
    it('elipse inscrita en el arrastre y círculo forzado', () => {
      expect(ellipseFromDrag(pt(0, 0), pt(100, 40))).toEqual({ cx: 50, cy: 20, rx: 50, ry: 20 });
      expect(ellipseFromDrag(pt(0, 0), pt(100, 40), true)).toEqual({ cx: 50, cy: 50, rx: 50, ry: 50 });
    });
    it('la línea se ajusta a 45° con snap', () => {
      const end = lineEnd(pt(0, 0), pt(100, 10), true);
      expect(end.x).toBeCloseTo(Math.hypot(100, 10), 5); expect(end.y).toBeCloseTo(0, 5);
      const diag = lineEnd(pt(0, 0), pt(50, 60), true);
      expect(diag.x).toBeCloseTo(diag.y, 5);
      expect(lineEnd(pt(0, 0), pt(7, 3))).toEqual(pt(7, 3));
    });
  });

  describe('widthFor', () => {
    it('el marcador y el borrador son más gruesos que el lápiz', () => {
      expect(widthFor('marker', 10)).toBeGreaterThan(widthFor('pen', 10));
      expect(widthFor('eraser', 10)).toBeGreaterThan(widthFor('pen', 10));
    });
    it('el ratón (0.5) no modula; el lápiz con más presión engrosa', () => {
      expect(widthFor('pen', 10, 0.5)).toBe(10);
      expect(widthFor('pen', 10, 0.9)).toBeGreaterThan(widthFor('pen', 10, 0.2));
    });
  });

  it('atajos: P M E L R O abren su herramienta y otras teclas no', () => {
    expect(TOOLS.map(t => toolForShortcut(t.shortcut.toLowerCase()))).toEqual(['pen', 'marker', 'eraser', 'line', 'rect', 'ellipse']);
    expect(toolForShortcut('z')).toBeNull();
    expect(toolForShortcut('Enter')).toBeNull();
  });

  describe('renderOp', () => {
    const fakeCtx = () => {
      const calls: string[] = [];
      const ctx: any = { strokeStyle: '', fillStyle: '', lineWidth: 0, lineCap: '', lineJoin: '', globalAlpha: 1 };
      for (const m of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'stroke', 'fill', 'arc', 'ellipse', 'rect', 'strokeRect']) ctx[m] = () => calls.push(m);
      return { ctx, calls };
    };
    it('un solo punto se dibuja como círculo relleno', () => {
      const { ctx, calls } = fakeCtx();
      renderOp(ctx, { kind: 'stroke', tool: 'pen', color: '#f00', width: 6, points: [pt(5, 5)] });
      expect(calls).toContain('arc'); expect(calls).toContain('fill');
    });
    it('el marcador usa transparencia y el borrador pinta blanco', () => {
      const m = fakeCtx(); let alpha = 0;
      m.ctx.stroke = () => { alpha = m.ctx.globalAlpha; };
      renderOp(m.ctx, { kind: 'stroke', tool: 'marker', color: '#f00', width: 20, points: [pt(0, 0), pt(10, 10)] });
      expect(alpha).toBeLessThan(1);
      const e = fakeCtx(); let style = '';
      e.ctx.stroke = () => { style = e.ctx.strokeStyle; };
      renderOp(e.ctx, { kind: 'stroke', tool: 'eraser', color: '#f00', width: 20, points: [pt(0, 0), pt(10, 10)] });
      expect(style).toBe('#ffffff');
    });
    it('las formas usan rect y ellipse', () => {
      const { ctx, calls } = fakeCtx();
      renderOp(ctx, { kind: 'shape', tool: 'rect', color: '#000', width: 3, points: [pt(0, 0), pt(10, 10)] });
      renderOp(ctx, { kind: 'shape', tool: 'ellipse', color: '#000', width: 3, points: [pt(0, 0), pt(10, 10)] });
      expect(calls).toContain('rect'); expect(calls).toContain('ellipse');
    });
  });
});
