import { AfterViewInit, Component, ElementRef, NgZone, OnChanges, OnDestroy, SimpleChanges, computed, effect, inject, input, output, signal } from '@angular/core';
import { BoardElement, BoardOperation, BoardPage, BoardPoint, BoardTool } from '../../../core/models/live-class.model';
import { bounds, clamp, editableElement, moveElement, moveSelection, newId, pathOf, pageFrame, point, resizeElement, resizeSelection, selectionBounds, ResizeHandle, WORLD_BOTTOM, WORLD_H, WORLD_RIGHT, WORLD_W, WORLD_X, WORLD_Y } from './board.logic';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

interface Gesture { pointer: number; pageId: string; start: BoardPoint; originals: BoardElement[]; element: BoardElement | null; mode: 'draw' | 'move' | 'resize' | 'marquee'; handle?: ResizeHandle; }
interface DrawDiagnosticSample {
  event: string;
  elapsedMs: number;
  clientX: number;
  clientY: number;
  canvasX: number;
  canvasY: number;
  boardX: number;
  boardY: number;
  pressure: number;
  distanceFromPrevious: number | null;
  accepted: boolean;
  pointCount: number;
  previewNodePresent: boolean;
  previewPathLength: number;
}
interface DrawDiagnostic {
  id: string;
  elementId: string;
  pageId: string;
  startedAt: number;
  samples: DrawDiagnosticSample[];
  totalSamples: number;
  acceptedMoves: number;
  ignoredMoves: number;
}
@Component({
  selector: 'app-live-board', standalone: true, imports: [IconComponent, NgbDropdownModule, ConfirmDialogComponent, TranslatePipe],
  templateUrl: './live-board.component.html', styleUrl: './live-board.component.scss'
})
export class LiveBoardComponent implements AfterViewInit, OnChanges, OnDestroy {
  private i18n = inject(I18nService);
  private host: ElementRef<HTMLElement> = inject(ElementRef);
  private zone = inject(NgZone);
  page = input.required<BoardPage>();
  editable = input(false);
  panning = input(false);
  owner = input(false);
  userId = input.required<number>();
  tool = input<BoardTool>('pen');
  color = input('#2b2b2b');
  size = input(4);
  boardChange = output<BoardOperation | BoardOperation[]>();
  selectedId = signal<string | null>(null);
  selectedIds = signal<string[]>([]);
  drafts = signal<BoardElement[]>([]);
  private movingIds = signal<ReadonlySet<string>>(new Set());
  private moveOffset = signal<{ x: number; y: number } | null>(null);
  editingText = signal<string | null>(null);
  editorPosition = signal({ left: 16, top: 96 });
  deleting = signal<BoardElement | null>(null);
  selected = computed(() => this.panning() || this.selectedIds().length > 1 ? null : this.page().elements.find(e => e.id === this.selectedId()) || null);
  selectedCount = computed(() => this.selectedIds().length);
  selectedBox = computed(() => selectionBounds(this.page().elements.filter(e => this.selectedIds().includes(e.id))));
  frame = computed(() => pageFrame(this.page()));
  canChangeSelection = computed(() => this.editable() && this.selectedIds().length > 1 && this.page().elements
    .filter(e => this.selectedIds().includes(e.id)).every(e => editableElement(e, this.userId(), this.owner())));
  visible = computed(() => this.page().elements.map(e => this.drafts().find(d => d.id === e.id) || e));
  canChangeSelected = computed(() => { const e = this.selected(); return !!e && this.editable() && editableElement(e, this.userId(), this.owner()); });
  newDrawings = computed(() => this.drafts().filter(d => !this.page().elements.some(e => e.id === d.id)));
  private gesture: Gesture | null = null;
  private gestureRect: DOMRect | null = null;
  private canvas: SVGSVGElement | null = null;
  private moveBounds: ReturnType<typeof selectionBounds> = null;
  private moveDelta: { x: number; y: number } | null = null;
  private movingNodes: SVGGElement[] = [];
  private selectionNodes: SVGGElement[] = [];
  private selectionNodesCaptured = false;
  private drawNode: SVGGElement | null = null;
  private drawPath = '';
  private drawExtents: { left: number; top: number; right: number; bottom: number } | null = null;
  private drawDiagnostic: DrawDiagnostic | null = null;
  private readonly nativePointerMove = (event: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    if (gesture.mode === 'move') {
      if (!this.editable() || gesture.pageId !== this.page().id) {
        this.zone.run(() => this.cancel());
        return;
      }
      this.updateMovePreview(event);
      return;
    }
    if (gesture.mode === 'draw') {
      if (!this.editable() || gesture.pageId !== this.page().id) {
        this.zone.run(() => this.cancel());
        return;
      }
      this.updateDrawPreview(event);
      return;
    }
    this.zone.run(() => this.pointerMove(event));
  };
  private readonly nativePointerUp = (event: PointerEvent) => {
    const gesture = this.gesture;
    if (!gesture || gesture.pointer !== event.pointerId) return;
    console.info('[BoardDraw] pointerup observado en window', {
      pointerId: event.pointerId, gesturePointer: gesture.pointer,
      target: event.target instanceof Element ? event.target.tagName.toLowerCase() : null,
      traceId: this.drawDiagnostic?.id || null
    });
    this.zone.run(() => this.pointerUp(event));
  };
  private readonly nativePointerCancel = (event: PointerEvent) => {
    if (this.gesture?.pointer === event.pointerId) this.zone.run(() => this.pointerCancel(event));
  };
  private readonly nativeWindowBlur = () => {
    if (this.gesture) this.cancel('window-blur');
  };
  marquee = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  private editorViewport: HTMLElement | null = null;
  private editorFrame = 0;
  private editorResizeObserver?: ResizeObserver;
  private readonly repositionEditor = () => this.scheduleEditorPosition();
  private readonly editorPositionEffect = effect(() => {
    this.selectedId(); this.selectedIds(); this.editingText(); this.page();
    this.scheduleEditorPosition();
  });
  ngAfterViewInit(): void {
    this.editorViewport = this.host.nativeElement.closest('.canvas-viewport');
    this.editorViewport?.addEventListener('scroll', this.repositionEditor, { passive: true });
    window.addEventListener('resize', this.repositionEditor, { passive: true });
    const canvas = this.host.nativeElement.querySelector<SVGSVGElement>('svg.live-canvas');
    this.canvas = canvas;
    canvas?.addEventListener('pointermove', this.nativePointerMove, { passive: false });
    if (canvas && typeof ResizeObserver === 'function') {
      this.editorResizeObserver = new ResizeObserver(this.repositionEditor);
      this.editorResizeObserver.observe(canvas);
    }
    this.scheduleEditorPosition();
  }
  ngOnDestroy(): void {
    this.editorViewport?.removeEventListener('scroll', this.repositionEditor);
    window.removeEventListener('resize', this.repositionEditor);
    this.editorResizeObserver?.disconnect();
    this.canvas?.removeEventListener('pointermove', this.nativePointerMove);
    if (this.editorFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.editorFrame);
  }
  private scheduleEditorPosition(): void {
    if (typeof requestAnimationFrame !== 'function') { this.updateEditorPosition(); return; }
    if (this.editorFrame) cancelAnimationFrame(this.editorFrame);
    this.editorFrame = requestAnimationFrame(() => { this.editorFrame = 0; this.updateEditorPosition(); });
  }
  private updateEditorPosition(): void {
    const host = this.host.nativeElement;
    const toolbar = host.querySelector<HTMLElement>('.object-editor');
    const selectedId = this.selectedId();
    if (!toolbar || !selectedId) return;
    const target = this.selectedIds().length > 1
      ? host.querySelector<SVGRectElement>('.selection-group rect.selection')
      : [...host.querySelectorAll<SVGGElement>('[data-element]')].find(element => element.getAttribute('data-element') === selectedId);
    if (!target) return;
    const viewport = this.editorViewport?.getBoundingClientRect();
    const bounds = target.getBoundingClientRect();
    const header = document.querySelector<HTMLElement>('.board-header')?.getBoundingClientRect();
    const footer = document.querySelector<HTMLElement>('.canvas-footer')?.getBoundingClientRect();
    const leftEdge = Math.max(8, viewport?.left ?? 0) + 8;
    const rightEdge = Math.min(window.innerWidth - 8, viewport?.right ?? window.innerWidth) - 8;
    const topEdge = Math.max(8, viewport?.top ?? 0, (header?.bottom ?? 0) + 8);
    const bottomEdge = Math.min(window.innerHeight - 8, viewport?.bottom ?? window.innerHeight, (footer?.top ?? window.innerHeight) - 8);
    const width = toolbar.offsetWidth;
    const height = toolbar.offsetHeight;
    const left = clamp(bounds.left + (bounds.width - width) / 2, leftEdge, Math.max(leftEdge, rightEdge - width));
    let top = bounds.top - height - 8;
    if (top < topEdge) top = bounds.bottom + 8;
    if (top + height > bottomEdge) top = Math.max(topEdge, bottomEdge - height);
    this.editorPosition.set({ left, top });
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['page'] && !changes['page'].firstChange && changes['page'].previousValue?.id !== changes['page'].currentValue?.id) {
      this.clearSelection(); this.cancel(); this.editingText.set(null);
    } else if (changes['page'] && this.selectedId() && !this.page().elements.some(element => element.id === this.selectedId())) {
      this.clearSelection(); this.editingText.set(null);
    } else if (changes['page'] && this.editingText() !== null) {
      const previous = changes['page'].previousValue?.elements?.find((element: BoardElement) => element.id === this.selectedId());
      const current = this.page().elements.find(element => element.id === this.selectedId());
      if (previous && current && previous.version !== current.version && current.text !== this.editingText()) this.editingText.set(null);
    }
  }
  private pathCache = new WeakMap<BoardPoint[], string>();
  private noteLineCache = new WeakMap<BoardElement, string[]>();
  readonly path = (points: BoardPoint[] = []) => {
    const cached = this.pathCache.get(points);
    if (cached !== undefined) return cached;
    const path = pathOf(points);
    this.pathCache.set(points, path);
    return path;
  };
  moveTransform(id: string): string | null {
    const offset = this.moveOffset();
    return offset && this.movingIds().has(id) ? `translate(${offset.x} ${offset.y})` : null;
  }
  selectionTransform(): string | null {
    const offset = this.moveOffset();
    return offset ? `translate(${offset.x} ${offset.y})` : null;
  }
  readonly noteColors = ['#fff2a8', '#ffd7cc', '#dff3dd', '#d9ecff', '#eadcff', '#ffffff'];
  readonly textColors = ['#2b2b2b', '#c94a14', '#b3372f', '#2f7d4f', '#2f6f9f', '#8b5e9e'];
  readonly defaultFontFamily = 'Nunito Sans';
  readonly fontFamilies = [this.defaultFontFamily, 'Arial', 'Verdana', 'Georgia', 'Courier New'];
  readonly fontSizes = [14, 16, 18, 20, 23, 26, 30, 36, 44, 56, 72, 96];
  readonly fontSizeOf = (e: BoardElement) => e.fontSize || (e.type === 'text' ? 30 : 23);
  readonly lineHeightOf = (e: BoardElement) => Math.ceil(this.fontSizeOf(e) * 1.22);
  readonly noteLines = (e: BoardElement) => {
    const cached = this.noteLineCache.get(e);
    if (cached) return cached;
    const fontSize = this.fontSizeOf(e), lineHeight = this.lineHeightOf(e);
    const width = Math.max(1, Math.floor((e.w - 30) / (fontSize * 0.53)));
    const lines = (e.text || '').split('\n').flatMap(line => {
      const words = line.split(/\s+/); const lines: string[] = []; let current = '';
      for (let word of words) {
        while (word.length > width) {
          if (current) { lines.push(current); current = ''; }
          lines.push(word.slice(0, width)); word = word.slice(width);
        }
        if (current && current.length + word.length + 1 > width) { lines.push(current); current = word; }
        else current += (current ? ' ' : '') + word;
      }
      lines.push(current); return lines;
    }).slice(0, Math.max(1, Math.floor((e.h - 20) / lineHeight)));
    this.noteLineCache.set(e, lines);
    return lines;
  };
  private position(event: PointerEvent): BoardPoint {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = this.gestureRect || svg.getBoundingClientRect();
    return point(WORLD_X + (event.clientX - rect.left) * WORLD_W / rect.width, WORLD_Y + (event.clientY - rect.top) * WORLD_H / rect.height);
  }
  private startDrawDiagnostic(event: PointerEvent, element: BoardElement, position: BoardPoint): void {
    if (element.type !== 'pen') return;
    const rect = this.gestureRect;
    const trace: DrawDiagnostic = {
      id: newId(), elementId: element.id, pageId: this.page().id, startedAt: performance.now(),
      samples: [], totalSamples: 0, acceptedMoves: 0, ignoredMoves: 0
    };
    this.drawDiagnostic = trace;
    console.info('[BoardDraw] inicio', {
      traceId: trace.id, elementId: trace.elementId, pageId: trace.pageId,
      pointerId: event.pointerId, pointerType: event.pointerType, button: event.button,
      pressure: event.pressure, client: { x: event.clientX, y: event.clientY },
      canvas: { x: event.clientX - (rect?.left || 0), y: event.clientY - (rect?.top || 0) },
      board: position, canvasRect: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewBox: this.canvas?.getAttribute('viewBox'), pointerCaptured: this.canvas?.hasPointerCapture(event.pointerId)
    });
    this.recordDrawSample(event, position, 'pointerdown', true, null);
  }
  private recordDrawSample(event: PointerEvent, position: BoardPoint, phase: string, accepted: boolean, distance: number | null): void {
    const trace = this.drawDiagnostic;
    if (!trace) return;
    const rect = this.gestureRect;
    const path = this.drawNode?.querySelector('path')?.getAttribute('d') || '';
    trace.totalSamples++;
    if (phase === 'pointermove' || phase === 'pointerup') {
      if (accepted) trace.acceptedMoves++; else trace.ignoredMoves++;
    }
    // Keep the trace bounded if the device emits an unusually large number of samples.
    if (trace.samples.length < 3000) trace.samples.push({
      event: phase, elapsedMs: Math.round((performance.now() - trace.startedAt) * 10) / 10,
      clientX: event.clientX, clientY: event.clientY,
      canvasX: Math.round((event.clientX - (rect?.left || 0)) * 10) / 10,
      canvasY: Math.round((event.clientY - (rect?.top || 0)) * 10) / 10,
      boardX: position.x, boardY: position.y, pressure: event.pressure,
      distanceFromPrevious: distance === null ? null : Math.round(distance * 10) / 10,
      accepted, pointCount: this.gesture?.element?.points?.length || 0,
      previewNodePresent: !!this.drawNode?.isConnected, previewPathLength: path.length
    });
  }
  private finishDrawDiagnostic(outcome: string, details: Record<string, unknown> = {}): string | null {
    const trace = this.drawDiagnostic;
    if (!trace) return null;
    const element = this.gesture?.element;
    const path = this.drawNode?.querySelector('path')?.getAttribute('d') || '';
    const points = element?.points || [];
    const traceId = trace.id;
    console.groupCollapsed(`[BoardDraw] ${outcome}: ${trace.id}`);
    console.info('Resumen', {
      traceId: trace.id, elementId: trace.elementId, pageId: trace.pageId, outcome,
      elapsedMs: Math.round((performance.now() - trace.startedAt) * 10) / 10,
      totalSamples: trace.totalSamples, loggedSamples: trace.samples.length,
      truncatedSamples: Math.max(0, trace.totalSamples - trace.samples.length),
      acceptedMoves: trace.acceptedMoves, ignoredMoves: trace.ignoredMoves,
      pointCount: points.length, bounds: element && { x: element.x, y: element.y, width: element.w, height: element.h },
      previewNodePresent: !!this.drawNode?.isConnected, previewPathLength: path.length,
      ...details
    });
    if (trace.samples.length) console.table(trace.samples);
    console.groupEnd();
    this.drawDiagnostic = null;
    return traceId;
  }
  private verifyDrawCommit(traceId: string, element: BoardElement): void {
    const check = (stage: string) => {
      const pageElement = this.page().elements.find(item => item.id === element.id);
      const node = [...(this.canvas?.querySelectorAll<SVGGElement>('[data-element]') || [])]
        .find(item => item.getAttribute('data-element') === element.id);
      const path = node?.querySelector('path')?.getAttribute('d') || '';
      const pagePoints = pageElement?.points || [];
      console.info('[BoardDraw] comprobación de trazo', {
        traceId, stage, elementId: element.id, pageId: this.page().id,
        operationEmitted: true, pageContainsElement: !!pageElement, pagePointCount: pagePoints.length,
        svgContainsElement: !!node?.isConnected, svgPathPresent: !!path, svgPathLength: path.length,
        svgPathMatchesPage: !!pageElement && path === pathOf(pagePoints),
        expectedPointCount: element.points?.length || 0
      });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => check('siguiente frame'));
    else setTimeout(() => check('siguiente tarea'), 0);
    setTimeout(() => check('250 ms'), 250);
  }
  pointerDown(event: PointerEvent): void {
    if (this.panning() || this.gesture || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (this.editingText() !== null) this.saveText();
    const handle = (event.target as Element).closest('[data-handle]')?.getAttribute('data-handle') as ResizeHandle | null;
    const target = (event.target as Element).closest('[data-element]')?.getAttribute('data-element');
    const old = this.page().elements.find(e => e.id === target);
    if (!this.editable()) { this.selectedId.set(old?.id || null); return; }
    const p = this.position(event);
    (event.currentTarget as SVGSVGElement).focus({ preventScroll: true });
    this.editingText.set(null);
    if (handle && this.tool() === 'select' && this.selectedIds().length) {
      const originals = this.page().elements.filter(e => this.selectedIds().includes(e.id) && editableElement(e, this.userId(), this.owner()));
      if (!originals.length) return;
      this.gesture = { pointer: event.pointerId, pageId: this.page().id, start: p, originals, element: originals[0], mode: 'resize', handle };
    } else if (this.tool() === 'select') {
      if (!old) {
        if (event.shiftKey) return;
        this.selectedIds.set([]); this.selectedId.set(null);
        this.gesture = { pointer: event.pointerId, pageId: this.page().id, start: p, originals: [], element: null, mode: 'marquee' };
      } else if (!editableElement(old, this.userId(), this.owner())) {
        if (!event.shiftKey) { this.selectedIds.set([]); this.selectedId.set(null); }
        return;
      }
      if (old && editableElement(old, this.userId(), this.owner())) {
        const selected = this.selectedIds();
        if (event.shiftKey) {
          const next = selected.includes(old.id) ? selected.filter(id => id !== old.id) : selected.length < 40 ? [...selected, old.id] : selected;
          this.selectedIds.set(next); this.selectedId.set(next.at(-1) || null); return;
        }
        const originals = selected.includes(old.id) && selected.length > 1
          ? this.page().elements.filter(e => selected.includes(e.id) && editableElement(e, this.userId(), this.owner()))
          : [old];
        this.selectedIds.set(originals.length > 1 ? originals.map(e => e.id) : [old.id]);
        this.selectedId.set(old.id);
        this.gesture = { pointer: event.pointerId, pageId: this.page().id, start: p, originals, element: old, mode: 'move' };
      }
    }
    if (this.tool() === 'eraser') { if (old && editableElement(old, this.userId(), this.owner())) this.remove(old); return; }
    if (this.tool() === 'select') {
      // Selection and resize gestures were handled above.
    } else if (this.tool() === 'note' || this.tool() === 'text') {
      const note = this.tool() === 'note';
      const e: BoardElement = { id: newId(), type: note ? 'note' : 'text', x: clamp(p.x, WORLD_X, WORLD_RIGHT - 280), y: clamp(p.y, WORLD_Y, WORLD_BOTTOM - 220), w: 280, h: 220,
        color: note ? '#fff2a8' : this.color(), width: this.size(), text: '', fontFamily: this.defaultFontFamily, fontSize: note ? 23 : 30, textColor: '#2b2b2b', authorId: this.userId(), version: 0 };
      this.put(e, 0); this.beginTextEditing(e); return;
    } else {
      this.selectedId.set(null); this.selectedIds.set([]);
      const e: BoardElement = { id: newId(), type: this.tool() as 'pen' | 'line' | 'rect' | 'ellipse', ...bounds(p, p), color: this.color(), width: this.size(),
        ...(['pen', 'line'].includes(this.tool()) ? { points: [p] } : {}), authorId: this.userId(), version: 0 };
      this.gesture = { pointer: event.pointerId, pageId: this.page().id, start: p, originals: [], element: e, mode: 'draw' };
    }
    if (!this.gesture) return;
    // The canvas owns this gesture. Prevent Chrome from starting its native drag or
    // text-selection behavior, which can delay pointer movement on SVG elements.
    event.preventDefault();
    window.addEventListener('pointerup', this.nativePointerUp, true);
    window.addEventListener('pointercancel', this.nativePointerCancel, true);
    window.addEventListener('blur', this.nativeWindowBlur);
    this.gestureRect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    if (this.gesture.mode === 'move') {
      this.movingIds.set(new Set(this.gesture.originals.map(element => element.id)));
      this.moveOffset.set({ x: 0, y: 0 });
      this.moveBounds = selectionBounds(this.gesture.originals);
      this.moveDelta = { x: 0, y: 0 };
      this.movingNodes = [...(event.currentTarget as SVGSVGElement).querySelectorAll<SVGGElement>('[data-element]')]
        .filter(node => this.movingIds().has(node.getAttribute('data-element') || ''));
      this.selectionNodes = [];
      this.selectionNodesCaptured = false;
    } else if (this.gesture.mode === 'draw' && this.gesture.element) {
      this.drawNode = null;
      this.drawPath = this.gesture.element.type === 'pen' ? pathOf(this.gesture.element.points) : '';
      this.drawExtents = { left: p.x, top: p.y, right: p.x, bottom: p.y };
    }
    (event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId);
    this.drafts.set(this.gesture.mode === 'draw' && this.gesture.element ? [this.gesture.element] : []);
    if (this.gesture.mode === 'draw' && this.gesture.element) this.startDrawDiagnostic(event, this.gesture.element, p);
  }
  pointerMove(event: PointerEvent): void {
    const g = this.gesture;
    if (!g || g.pointer !== event.pointerId) return;
    if (!this.editable() || g.pageId !== this.page().id) { this.cancel(); return; }
    const p = this.position(event);
    if (g.mode === 'draw') {
      this.updateDrawPreview(event, p);
      return;
    }
    if (g.mode === 'move') {
      this.updateMovePreview(event);
    }
    else if (g.mode === 'resize') this.drafts.set(resizeSelection(g.originals, g.handle!, g.start, p));
    else if (g.mode === 'marquee') this.marquee.set(bounds(g.start, p));
    else if (g.element) g.element = { ...g.element, ...bounds(g.start, p), ...(g.element.type === 'line' ? { points: [g.start, p] } : {}) };
  }
  preventNativeDrag(event: DragEvent): void { event.preventDefault(); }
  pointerUp(event: PointerEvent): void {
    const g = this.gesture;
    if (!g || g.pointer !== event.pointerId) return;
    if (g.mode === 'move') this.updateMovePreview(event);
    else if (g.mode === 'draw') this.updateDrawPreview(event);
    else this.pointerMove(event);
    const offset = this.moveDelta;
    const result = g.mode === 'move' && offset
      ? moveSelection(g.originals, offset.x, offset.y)
      : this.drafts();
    const area = this.marquee();
    const drawElement = g.mode === 'draw' && g.element?.type === 'pen' ? g.element : null;
    const drawTraceId = drawElement ? this.finishDrawDiagnostic('pointerup', {
      pointerId: event.pointerId, pointerType: event.pointerType, pressure: event.pressure,
      finalClient: { x: event.clientX, y: event.clientY }, finalBoard: this.position(event),
      pointerCaptured: this.canvas?.hasPointerCapture(event.pointerId)
    }) : null;
    this.cancel();
    if (!this.editable() || g.pageId !== this.page().id) {
      if (drawTraceId) console.warn('[BoardDraw] commit omitido', { traceId: drawTraceId, reason: !this.editable() ? 'pizarra no editable al soltar' : 'la página cambió durante el trazo' });
      return;
    }
    if (g.mode === 'marquee') {
      if (!area || area.w < 3 || area.h < 3) return;
      const selected = this.page().elements.filter(e => editableElement(e, this.userId(), this.owner())
        && e.x <= area.x + area.w && e.x + e.w >= area.x && e.y <= area.y + area.h && e.y + e.h >= area.y)
        .slice(0, 40);
      this.selectedIds.set(selected.map(e => e.id)); this.selectedId.set(selected.at(-1)?.id || null);
      return;
    }
    if (!g.element) {
      if (drawTraceId) console.warn('[BoardDraw] commit omitido', { traceId: drawTraceId, reason: 'no hay elemento al soltar' });
      return;
    }
    if (g.mode === 'move' && result.every((e, i) => e.x === g.originals[i].x && e.y === g.originals[i].y)) {
      if (g.element?.type === 'note' || g.element?.type === 'text') this.beginTextEditing(g.element);
      return;
    }
    if (g.mode === 'resize' && result.every((e, i) => e.x === g.originals[i].x && e.y === g.originals[i].y && e.w === g.originals[i].w && e.h === g.originals[i].h)) return;
    if (g.mode === 'draw' && g.element.type !== 'pen' && g.element.w < 3 && g.element.h < 3) return;
    if (g.mode === 'draw') {
      const committed = g.element.type === 'pen' && g.element.points ? { ...g.element, points: [...g.element.points] } : g.element;
      this.put(committed, 0);
      if (drawTraceId && committed.type === 'pen') this.verifyDrawCommit(drawTraceId, committed);
    }
    else this.putMany(result.map((element, index) => ({ id: newId(), type: 'put' as const, pageId: this.page().id, element, expectedVersion: g.originals[index].version })));
  }
  pointerCancel(event: PointerEvent): void {
    if (this.gesture?.pointer === event.pointerId) this.cancel('pointercancel');
  }
  lostPointerCapture(event: PointerEvent): void {
    const gesture = this.gesture;
    if (gesture?.pointer === event.pointerId) console.warn('[BoardDraw] captura perdida; se espera pointerup o pointercancel', {
      pointerId: event.pointerId, traceId: this.drawDiagnostic?.id || null,
      gestureMode: gesture.mode, eventTarget: event.target instanceof Element ? event.target.tagName.toLowerCase() : null
    });
  }
  cancel(reason = 'cancel'): void {
    if (this.drawDiagnostic) this.finishDrawDiagnostic(reason, { pointerId: this.gesture?.pointer });
    window.removeEventListener('pointerup', this.nativePointerUp, true);
    window.removeEventListener('pointercancel', this.nativePointerCancel, true);
    window.removeEventListener('blur', this.nativeWindowBlur);
    for (const node of [...this.movingNodes, ...this.selectionNodes]) node.removeAttribute('transform');
    this.movingNodes = [];
    this.selectionNodes = [];
    this.selectionNodesCaptured = false;
    this.moveBounds = null;
    this.moveDelta = null;
    this.drawNode = null;
    this.drawPath = '';
    this.drawExtents = null;
    this.gestureRect = null;
    this.gesture = null;
    this.drafts.set([]);
    this.marquee.set(null);
    this.movingIds.set(new Set());
    this.moveOffset.set(null);
  }
  private updateMovePreview(event: PointerEvent): void {
    const gesture = this.gesture, box = this.moveBounds;
    if (!gesture || !box) return;
    const p = this.position(event);
    const dx = clamp(p.x - gesture.start.x, WORLD_X - box.x, WORLD_RIGHT - box.x - box.w);
    const dy = clamp(p.y - gesture.start.y, WORLD_Y - box.y, WORLD_BOTTOM - box.y - box.h);
    this.moveDelta = { x: dx, y: dy };
    const transform = `translate(${dx} ${dy})`;
    for (const node of this.movingNodes) node.setAttribute('transform', transform);
    if (!this.selectionNodesCaptured) {
      this.selectionNodes = [...(this.canvas?.querySelectorAll<SVGGElement>('.selection-group') || [])];
      this.selectionNodesCaptured = true;
    }
    for (const node of this.selectionNodes) node.setAttribute('transform', transform);
  }
  private updateDrawPreview(event: PointerEvent, position = this.position(event)): void {
    const gesture = this.gesture, element = gesture?.element;
    if (!gesture || gesture.mode !== 'draw' || !element) return;
    const p = position;
    let accepted = true;
    let distance: number | null = null;
    if (element.type === 'pen') {
      const points = element.points || [];
      const last = points[points.length - 1];
      distance = last ? Math.hypot(p.x - last.x, p.y - last.y) : null;
      accepted = !last || distance! >= 1.5;
      if (accepted) {
        if (points.length >= 1199) {
          const reduced = points.filter((_, index) => index % 2 === 0);
          points.splice(0, points.length, ...reduced);
          this.drawPath = pathOf(points);
        }
        points.push(p);
        this.drawPath += ` L ${p.x} ${p.y}`;
        const extents = this.drawExtents || { left: p.x, top: p.y, right: p.x, bottom: p.y };
        extents.left = Math.min(extents.left, p.x); extents.top = Math.min(extents.top, p.y);
        extents.right = Math.max(extents.right, p.x); extents.bottom = Math.max(extents.bottom, p.y);
        this.drawExtents = extents;
        const topLeft = point(extents.left, extents.top), bottomRight = point(extents.right, extents.bottom);
        gesture.element = { ...element, points, ...bounds(topLeft, bottomRight) };
      }
    } else {
      gesture.element = { ...element, ...bounds(gesture.start, p), ...(element.type === 'line' ? { points: [gesture.start, p] } : {}) };
    }

    const current = gesture.element;
    if (!current) return;
    if (!this.drawNode && this.canvas) this.drawNode = [...this.canvas.querySelectorAll<SVGGElement>('[data-draft]')]
      .find(node => node.getAttribute('data-draft') === current.id) || null;
    if (!this.drawNode) {
      this.recordDrawSample(event, p, event.type, accepted, distance);
      return;
    }
    if (current.type === 'pen' || current.type === 'line') {
      this.drawNode.querySelector('path')?.setAttribute('d', current.type === 'pen' ? this.drawPath : pathOf(current.points));
    } else if (current.type === 'rect') {
      const rect = this.drawNode.querySelector('rect');
      rect?.setAttribute('x', String(current.x)); rect?.setAttribute('y', String(current.y));
      rect?.setAttribute('width', String(current.w)); rect?.setAttribute('height', String(current.h));
    } else if (current.type === 'ellipse') {
      const ellipse = this.drawNode.querySelector('ellipse');
      ellipse?.setAttribute('cx', String(current.x + current.w / 2)); ellipse?.setAttribute('cy', String(current.y + current.h / 2));
      ellipse?.setAttribute('rx', String(current.w / 2)); ellipse?.setAttribute('ry', String(current.h / 2));
    }
    this.recordDrawSample(event, p, event.type, accepted, distance);
  }
  beginTextEditing(e = this.selected()): void {
    if (!e || !this.editable() || !editableElement(e, this.userId(), this.owner()) || (e.type !== 'note' && e.type !== 'text')) return;
    this.selectedId.set(e.id); this.selectedIds.set([e.id]); this.editingText.set(e.text || '');
    const focus = () => this.host.nativeElement.querySelector<HTMLTextAreaElement>(`[data-text-editor="${e.id}"]`)?.focus();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focus); else focus();
  }
  editTextAt(event: MouseEvent): void {
    const id = (event.target as Element).closest('[data-element]')?.getAttribute('data-element');
    const element = this.page().elements.find(item => item.id === id);
    if (!element || (element.type !== 'note' && element.type !== 'text') || !editableElement(element, this.userId(), this.owner())) return;
    event.preventDefault(); this.beginTextEditing(element);
  }
  textEditorBlur(event: FocusEvent): void {
    if ((event.relatedTarget as Element | null)?.closest?.('.object-editor')) return;
    this.saveText();
  }
  textEditorKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); this.saveText(); }
  }
  private put(element: BoardElement, version: number): void {
    this.boardChange.emit({ id: newId(), type: 'put', pageId: this.page().id, element, expectedVersion: version });
  }
  private putMany(operations: BoardOperation[]): void { this.boardChange.emit(operations.length === 1 ? operations[0] : operations); }
  remove(e = this.selected()): void {
    if (!e || !this.editable() || !editableElement(e, this.userId(), this.owner())) return;
    this.deleting.set(e);
  }
  confirmRemove(): void {
    const e = this.deleting(); this.deleting.set(null);
    if (!e || !this.editable() || !editableElement(e, this.userId(), this.owner())) return;
    const selected = this.selectedIds().length > 1
      ? this.selectedIds().filter(id => this.page().elements.some(item => item.id === id && editableElement(item, this.userId(), this.owner())))
      : [e.id];
    const operations = this.page().elements.filter(item => selected.includes(item.id)).map(item => ({ id: newId(), type: 'delete' as const, pageId: this.page().id, elementId: item.id, expectedVersion: item.version }));
    this.putMany(operations);
    this.selectedId.set(null); this.selectedIds.set([]); this.editingText.set(null);
  }
  removeSelection(): void {
    if (!this.canChangeSelection()) return;
    this.deleting.set(this.page().elements.find(item => this.selectedIds().includes(item.id)) || null);
  }
  clearSelection(): void { this.selectedId.set(null); this.selectedIds.set([]); }
  recolorSelected(color: string): void {
    const e = this.selected();
    if (e && this.canChangeSelected() && (e.type === 'note' || e.type === 'text')) this.updateTextStyle(e.type === 'note' ? { color } : { textColor: color });
  }
  changeFontFamily(event: Event): void {
    const fontFamily = (event.target as HTMLSelectElement).value, e = this.selected();
    if (e && this.canChangeSelected() && this.fontFamilies.includes(fontFamily)) this.updateTextStyle({ fontFamily });
  }
  changeFontSize(event: Event): void {
    const fontSize = Number((event.target as HTMLSelectElement).value), e = this.selected();
    if (e && this.canChangeSelected() && this.fontSizes.includes(fontSize)) this.updateTextStyle({ fontSize });
  }
  private updateTextStyle(patch: Partial<BoardElement>): void {
    const e = this.selected();
    if (!e || !this.canChangeSelected()) return;
    const draft = this.editingText();
    this.put({ ...e, ...patch, ...(draft !== null ? { text: draft } : {}) }, e.version);
  }
  resize(scale: number): void { const e = this.selected(); if (e && this.canChangeSelected()) this.put(resizeElement(e, scale), e.version); }
  saveText(): void {
    const e = this.selected(), text = this.editingText();
    if (!e || text === null || !this.canChangeSelected()) return;
    if ((e.type === 'note' || e.type === 'text') && text !== e.text) this.put({ ...e, text }, e.version);
    else if (e.type === 'link' && text.trim() && text !== e.text) this.put({ ...e, text }, e.version);
    this.editingText.set(null);
  }
  keydown(event: KeyboardEvent): void {
    const e = this.selected();
    if (event.target !== event.currentTarget) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && this.editable()) {
      event.preventDefault(); this.selectedIds.set(this.page().elements.filter(item => editableElement(item, this.userId(), this.owner())).slice(0, 40).map(item => item.id));
      this.selectedId.set(this.selectedIds().at(-1) || null); return;
    }
    if (this.selectedIds().length > 1 && this.canChangeSelection()) {
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.removeSelection(); return; }
      const groupSteps: Record<string, [number, number]> = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] };
      if (groupSteps[event.key]) {
        event.preventDefault(); const [dx, dy] = groupSteps[event.key];
        const operations = this.page().elements.filter(item => this.selectedIds().includes(item.id)).map(item => ({
          id: newId(), type: 'put' as const, pageId: this.page().id, element: moveElement(item, dx, dy), expectedVersion: item.version
        }));
        this.putMany(operations); return;
      }
    }
    if (!e || !this.canChangeSelected()) return;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.remove(e); }
    const steps: Record<string, [number, number]> = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] };
    if (steps[event.key]) { event.preventDefault(); const [dx, dy] = steps[event.key]; this.put(moveElement(e, dx, dy), e.version); }
  }
}
