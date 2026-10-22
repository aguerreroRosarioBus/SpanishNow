import { Component, computed, input, output, signal } from '@angular/core';
import { BoardElement, BoardOperation, BoardPage, BoardPoint, BoardTool } from '../../../core/models/live-class.model';
import { bounds, clamp, editableElement, moveElement, newId, pathOf, point, resizeElement } from './board.logic';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

interface Gesture { pointer: number; pageId: string; start: BoardPoint; original: BoardElement | null; element: BoardElement; mode: 'draw' | 'move'; }
@Component({
  selector: 'app-live-board', standalone: true, imports: [IconComponent, NgbDropdownModule, ConfirmDialogComponent],
  templateUrl: './live-board.component.html', styleUrl: './live-board.component.scss'
})
export class LiveBoardComponent {
  page = input.required<BoardPage>();
  editable = input(false);
  panning = input(false);
  owner = input(false);
  userId = input.required<number>();
  tool = input<BoardTool>('pen');
  color = input('#2b2b2b');
  size = input(4);
  change = output<BoardOperation>();
  selectedId = signal<string | null>(null);
  drawing = signal<BoardElement | null>(null);
  editingText = signal<string | null>(null);
  deleting = signal<BoardElement | null>(null);
  selected = computed(() => this.panning() ? null : this.page().elements.find(e => e.id === this.selectedId()) || null);
  visible = computed(() => this.page().elements.map(e => this.drawing()?.id === e.id ? this.drawing()! : e));
  canChangeSelected = computed(() => { const e = this.selected(); return !!e && this.editable() && editableElement(e, this.userId(), this.owner()); });
  newDrawing = computed(() => { const d = this.drawing(); return d && !this.page().elements.some(e => e.id === d.id) ? d : null; });
  private gesture: Gesture | null = null;
  readonly path = pathOf;
  readonly noteLines = (e: BoardElement) => {
    const width = Math.max(8, Math.floor((e.w - 30) / (e.type === 'text' ? 16 : 12)));
    return (e.text || '').split('\n').flatMap(line => {
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
    }).slice(0, Math.max(1, Math.floor((e.h - 20) / (e.type === 'text' ? 36 : 28))));
  };
  private position(event: PointerEvent): BoardPoint {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    return point((event.clientX - rect.left) * 1600 / rect.width, (event.clientY - rect.top) * 900 / rect.height);
  }
  pointerDown(event: PointerEvent): void {
    if (this.panning() || this.gesture || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const target = (event.target as Element).closest('[data-element]')?.getAttribute('data-element');
    const old = this.page().elements.find(e => e.id === target);
    if (!this.editable()) { this.selectedId.set(old?.id || null); return; }
    const p = this.position(event);
    event.preventDefault();
    (event.currentTarget as SVGSVGElement).focus({ preventScroll: true });
    this.editingText.set(null);
    if (this.tool() === 'eraser') { if (old && editableElement(old, this.userId(), this.owner())) this.remove(old); return; }
    if (this.tool() === 'select') {
      this.selectedId.set(old?.id || null);
      if (!old || !editableElement(old, this.userId(), this.owner())) return;
      this.gesture = { pointer: event.pointerId, pageId: this.page().id, start: p, original: old, element: old, mode: 'move' };
    } else if (this.tool() === 'note' || this.tool() === 'text') {
      const note = this.tool() === 'note';
      const e: BoardElement = { id: newId(), type: note ? 'note' : 'text', x: clamp(p.x, 0, 1320), y: clamp(p.y, 0, 680), w: 280, h: 220,
        color: note ? '#fff2a8' : this.color(), width: this.size(), text: note ? 'Tu nota' : 'Tu texto', authorId: this.userId(), version: 0 };
      this.selectedId.set(e.id); this.put(e, 0); return;
    } else {
      this.selectedId.set(null);
      const e: BoardElement = { id: newId(), type: this.tool() as 'pen' | 'line' | 'rect' | 'ellipse', ...bounds(p, p), color: this.color(), width: this.size(),
        ...(['pen', 'line'].includes(this.tool()) ? { points: [p] } : {}), authorId: this.userId(), version: 0 };
      this.gesture = { pointer: event.pointerId, pageId: this.page().id, start: p, original: null, element: e, mode: 'draw' };
    }
    (event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId);
    this.drawing.set(this.gesture.element);
  }
  pointerMove(event: PointerEvent): void {
    const g = this.gesture;
    if (!g || g.pointer !== event.pointerId) return;
    if (!this.editable() || g.pageId !== this.page().id) { this.cancel(); return; }
    const p = this.position(event);
    if (g.mode === 'move') g.element = moveElement(g.original!, p.x - g.start.x, p.y - g.start.y);
    else if (g.element.type === 'pen') {
      let points = [...(g.element.points || [])];
      if (Math.hypot(p.x - points[points.length - 1].x, p.y - points[points.length - 1].y) < 1.5) return;
      if (points.length >= 1199) points = points.filter((_, i) => i % 2 === 0);
      points.push(p);
      const xs = points.map(v => v.x), ys = points.map(v => v.y);
      g.element = { ...g.element, points, ...bounds(point(Math.min(...xs), Math.min(...ys)), point(Math.max(...xs), Math.max(...ys))) };
    } else g.element = { ...g.element, ...bounds(g.start, p), ...(g.element.type === 'line' ? { points: [g.start, p] } : {}) };
    this.drawing.set({ ...g.element });
  }
  pointerUp(event: PointerEvent): void {
    const g = this.gesture;
    if (!g || g.pointer !== event.pointerId) return;
    this.pointerMove(event);
    this.cancel();
    if (!this.editable() || g.pageId !== this.page().id) return;
    if (g.mode === 'move' && g.element.x === g.original!.x && g.element.y === g.original!.y) return;
    if (g.mode === 'draw' && g.element.type !== 'pen' && g.element.w < 3 && g.element.h < 3) return;
    this.put(g.element, g.original?.version || 0);
  }
  cancel(): void { this.gesture = null; this.drawing.set(null); }
  private put(element: BoardElement, version: number): void {
    this.change.emit({ id: newId(), type: 'put', pageId: this.page().id, element, expectedVersion: version });
  }
  remove(e = this.selected()): void {
    if (!e || !this.editable() || !editableElement(e, this.userId(), this.owner())) return;
    this.deleting.set(e);
  }
  confirmRemove(): void {
    const e = this.deleting(); this.deleting.set(null);
    if (!e || !this.editable() || !editableElement(e, this.userId(), this.owner())) return;
    this.change.emit({ id: newId(), type: 'delete', pageId: this.page().id, elementId: e.id, expectedVersion: e.version });
    this.selectedId.set(null); this.editingText.set(null);
  }
  resize(scale: number): void { const e = this.selected(); if (e && this.canChangeSelected()) this.put(resizeElement(e, scale), e.version); }
  saveText(): void {
    const e = this.selected(), text = this.editingText()?.trim();
    if (e && text && this.canChangeSelected()) { this.put({ ...e, text }, e.version); this.editingText.set(null); }
  }
  keydown(event: KeyboardEvent): void {
    const e = this.selected();
    if (!e || !this.canChangeSelected() || event.target !== event.currentTarget) return;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); this.remove(e); }
    const steps: Record<string, [number, number]> = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] };
    if (steps[event.key]) { event.preventDefault(); const [dx, dy] = steps[event.key]; this.put(moveElement(e, dx, dy), e.version); }
  }
}
