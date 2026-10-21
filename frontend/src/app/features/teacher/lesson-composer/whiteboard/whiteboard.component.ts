import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, effect, input, output, signal } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { BOARD_HEIGHT, BOARD_WIDTH, DrawOp, History, PALETTE, Pt, SIZES, TOOLS, Tool, appendPoint, clampToBoard, isShapeTool, toolForShortcut, visibleOps, widthFor } from './whiteboard.logic';
import { renderOp } from './whiteboard.render';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Pizarra tipo Paint dentro de un diálogo: dibuja sobre un lienzo 4:3 y entrega un PNG (1200×900, fondo blanco). */
@Component({
  selector: 'app-whiteboard',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './whiteboard.component.html',
  styleUrls: ['./whiteboard.component.scss', './whiteboard-toolbar.scss']
})
export class WhiteboardComponent implements AfterViewInit, OnDestroy {
  /** Imagen actual del bloque, para «Partir de la imagen actual». */
  backgroundUrl = input<string | null>(null);
  title = input('Dibujar ilustración');
  done = output<File>();
  cancelled = output<void>();

  @ViewChild('dialog', { static: true }) dialog!: ElementRef<HTMLElement>;
  @ViewChild('base', { static: true }) baseRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('live', { static: true }) liveRef!: ElementRef<HTMLCanvasElement>;

  readonly tools = TOOLS;
  readonly palette = PALETTE;
  readonly sizes = SIZES;

  tool = signal<Tool>('pen');
  color = signal(PALETTE[0].value);
  sizeIndex = signal(1);
  confirm = signal<'discard' | 'clear' | null>(null);
  useBackground = signal(true);
  bgState = signal<'none' | 'loading' | 'ready' | 'error'>('none');
  error = signal('');
  exporting = signal(false);

  private history = new History<DrawOp>();
  private rev = signal(0);
  private bgImage: HTMLImageElement | null = null;
  private bgObjectUrl: string | null = null;
  private scale = 1;
  private ready = false;
  private pointerId: number | null = null;
  private current: DrawOp | null = null;
  private returnTo: HTMLElement | null = null;
  private keyHandler = (event: KeyboardEvent) => this.onKeydown(event);

  canUndo = computed(() => { this.rev(); return this.history.canUndo; });
  canRedo = computed(() => { this.rev(); return this.history.canRedo; });
  hasStrokes = computed(() => { this.rev(); return visibleOps(this.history.items).some(op => op.kind !== 'clear'); });
  isCustomColor = computed(() => !PALETTE.some(c => c.value === this.color()));
  /** Diámetro (px) del punto que representa cada grosor. */
  dot = (i: number): number => Math.round(5 + i * 3.5);

  constructor() {
    effect(() => { this.useBackground(); this.bgState(); if (this.ready) this.redraw(); });
  }

  ngAfterViewInit(): void {
    this.returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.scale = Math.min(2, Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
    for (const canvas of [this.baseRef.nativeElement, this.liveRef.nativeElement]) {
      canvas.width = BOARD_WIDTH * this.scale; canvas.height = BOARD_HEIGHT * this.scale;
      canvas.getContext('2d')?.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    }
    this.ready = true;
    this.redraw();
    // Captura: la pizarra se queda con Escape/Tab/atajos antes que el compositor que está debajo.
    document.addEventListener('keydown', this.keyHandler, true);
    if (this.backgroundUrl()) void this.loadBackground(this.backgroundUrl()!);
    setTimeout(() => this.dialog.nativeElement.querySelector<HTMLElement>('.wb-tool.active')?.focus(), 0);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.keyHandler, true);
    if (this.bgObjectUrl) URL.revokeObjectURL(this.bgObjectUrl);
    if (this.returnTo?.isConnected) setTimeout(() => this.returnTo?.focus(), 0);
  }

  // ---- fondo ----
  private async loadBackground(url: string): Promise<void> {
    this.bgState.set('loading');
    try {
      // Se descarga con CORS y se usa como blob local: así el lienzo nunca queda «contaminado» y se puede exportar.
      const response = await fetch(url, { mode: 'cors', cache: 'reload' });
      if (!response.ok) throw new Error('http ' + response.status);
      this.bgObjectUrl = URL.createObjectURL(await response.blob());
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('decode')); img.src = this.bgObjectUrl!; });
      this.bgImage = img;
      this.bgState.set('ready');
    } catch {
      this.bgImage = null;
      this.bgState.set('error');
    }
  }

  private redraw(): void {
    const ctx = this.baseRef.nativeElement.getContext('2d');
    if (!ctx) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
    if (this.bgImage && this.useBackground() && this.bgState() === 'ready') {
      const k = Math.min(BOARD_WIDTH / this.bgImage.naturalWidth, BOARD_HEIGHT / this.bgImage.naturalHeight);
      const w = this.bgImage.naturalWidth * k, h = this.bgImage.naturalHeight * k;
      ctx.drawImage(this.bgImage, (BOARD_WIDTH - w) / 2, (BOARD_HEIGHT - h) / 2, w, h);
    }
    for (const op of visibleOps(this.history.items)) renderOp(ctx, op);
  }

  // ---- dibujo (Pointer Events) ----
  private toPoint(event: PointerEvent): Pt {
    const rect = this.liveRef.nativeElement.getBoundingClientRect();
    const p = event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.5;
    return clampToBoard({ x: (event.clientX - rect.left) * BOARD_WIDTH / rect.width, y: (event.clientY - rect.top) * BOARD_HEIGHT / rect.height, p });
  }

  onPointerDown(event: PointerEvent): void {
    if (this.pointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    this.confirm.set(null);
    this.dialog.nativeElement.focus({ preventScroll: true });
    this.liveRef.nativeElement.setPointerCapture?.(event.pointerId);
    this.pointerId = event.pointerId;
    const tool = this.tool();
    this.current = { kind: isShapeTool(tool) ? 'shape' : 'stroke', tool, color: this.color(), width: widthFor(tool, SIZES[this.sizeIndex()]), points: [this.toPoint(event)], constrain: event.shiftKey };
    this.drawLive();
  }

  onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId || !this.current) return;
    const events = event.getCoalescedEvents?.().length ? event.getCoalescedEvents() : [event];
    let points = this.current.points;
    for (const e of events) {
      const p = this.toPoint(e);
      points = this.current.kind === 'shape' ? [points[0], p] : appendPoint(points, p);
    }
    this.current = { ...this.current, points, constrain: event.shiftKey };
    this.drawLive();
  }

  onPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId || !this.current) return;
    this.onPointerMove(event);
    const op = this.current;
    this.pointerId = null; this.current = null;
    this.clearLive();
    const [a, b = a] = op.points;
    if (op.kind === 'shape' && Math.hypot(b.x - a.x, b.y - a.y) < 3) return; // clic sin arrastre: no es una forma
    this.history.push(op);
    renderOp(this.baseRef.nativeElement.getContext('2d')!, op);
    this.rev.update(v => v + 1);
  }

  onPointerCancel(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null; this.current = null; this.clearLive();
  }

  private drawLive(): void {
    const ctx = this.liveRef.nativeElement.getContext('2d')!;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
    if (this.current) renderOp(ctx, this.current);
  }
  private clearLive(): void { this.current = null; this.drawLive(); }

  // ---- acciones ----
  undo(): void { if (this.history.undo()) { this.rev.update(v => v + 1); this.redraw(); } }
  redo(): void { if (this.history.redo()) { this.rev.update(v => v + 1); this.redraw(); } }
  askClear(): void { if (this.hasStrokes()) this.confirm.set('clear'); }
  clearAll(): void {
    this.history.push({ kind: 'clear', tool: 'pen', color: '#fff', width: 0, points: [] });
    this.confirm.set(null); this.rev.update(v => v + 1); this.redraw();
  }
  setCustomColor(event: Event): void { this.color.set((event.target as HTMLInputElement).value); }

  requestClose(): void {
    if (this.hasStrokes()) this.confirm.set('discard');
    else this.cancelled.emit();
  }

  async use(): Promise<void> {
    if (this.exporting() || !this.hasStrokes()) return;
    this.exporting.set(true); this.error.set('');
    try {
      let source = this.baseRef.nativeElement;
      if (this.scale !== 1) { // exportación siempre 1200×900
        source = document.createElement('canvas'); source.width = BOARD_WIDTH; source.height = BOARD_HEIGHT;
        source.getContext('2d')!.drawImage(this.baseRef.nativeElement, 0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      }
      const blob = await new Promise<Blob | null>(resolve => source.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('empty');
      this.done.emit(new File([blob], 'ilustracion.png', { type: 'image/png' }));
    } catch {
      this.error.set('No se pudo generar la imagen del dibujo. Prueba sin «Partir de la imagen actual».');
    } finally { this.exporting.set(false); }
  }

  // ---- teclado ----
  private onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (this.confirm()) this.confirm.set(null); else this.requestClose();
      return;
    }
    if (event.key === 'Tab') { this.trapFocus(event); return; }
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'z') { event.preventDefault(); event.stopPropagation(); event.shiftKey ? this.redo() : this.undo(); return; }
    if (mod && key === 'y') { event.preventDefault(); event.stopPropagation(); this.redo(); return; }
    if (mod || event.altKey || (event.target as HTMLElement | null)?.tagName === 'INPUT') return;
    const tool = toolForShortcut(event.key);
    if (tool) { event.preventDefault(); this.tool.set(tool); return; }
    if (event.key === '[') this.sizeIndex.update(i => Math.max(0, i - 1));
    if (event.key === ']') this.sizeIndex.update(i => Math.min(SIZES.length - 1, i + 1));
  }

  private trapFocus(event: KeyboardEvent): void {
    const nodes = [...this.dialog.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1], active = document.activeElement;
    if (!this.dialog.nativeElement.contains(active) || active === this.dialog.nativeElement) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
    else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }
}
