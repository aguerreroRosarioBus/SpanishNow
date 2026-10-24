import { Component, ElementRef, HostListener, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgbDropdown, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { LiveClassService } from '../../core/services/live-class.service';
import { BoardElement, BoardFormat, BoardOperation, BoardPage, BoardTool, ClassroomCourse, DriveBoardFile, GoogleStatus, LiveBoard, LiveClass, LiveSnapshot, LiveStatus } from '../../core/models/live-class.model';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ImageSearchComponent } from '../../shared/components/image-search/image-search.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { copyText } from '../../shared/utils/clipboard';
import { IMAGE_ACCEPT, imageFileErrorKey } from '../teacher/lesson-composer/image-file';
import { LiveBoardComponent } from './board/live-board.component';
import { BoardPreviewComponent } from './board/board-preview.component';
import { newId, pageFrame, parsePdfPageSelection, pdfGridLayout, previewBoard, WORLD_H, WORLD_W } from './board/board.logic';
import { downloadBlob, exportBoardPdf, exportPagePng } from './board/board.export';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { LiveNotice, noticeError, noticeKey, noticeText, liveStatusText } from './live-notice';

type Confirmation = 'clear' | 'delete-page' | 'restore' | 'end' | 'discard';
interface BoardHistoryChange { pageId: string; elementId: string; before: BoardElement | null; after: BoardElement | null; current: BoardElement | null; }
interface BoardPageSettings { format: BoardFormat; background: BoardPage['background']; title: string; index: number; }
interface BoardPageHistoryChange { pageId: string; before: BoardPageSettings; after: BoardPageSettings; current: BoardPageSettings; }
interface BoardHistoryAction { changes: BoardHistoryChange[]; pageChanges?: BoardPageHistoryChange[]; }
interface BoardHistoryGroup { kind: 'new' | 'undo' | 'redo'; action: BoardHistoryAction; remaining: number; }
const BOARD_OPERATION_TYPES = new Set<BoardOperation['type']>(['put', 'delete', 'page-add', 'page-delete', 'page-active', 'page-background', 'page-clear', 'page-format', 'page-rename', 'page-reorder']);
function isBoardOperation(value: unknown): value is BoardOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const operation = value as Partial<BoardOperation>;
  return typeof operation.id === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(operation.id)
    && typeof operation.pageId === 'string' && !!operation.pageId
    && typeof operation.type === 'string' && BOARD_OPERATION_TYPES.has(operation.type);
}
@Component({
  selector: 'app-live-room', standalone: true,
  imports: [FormsModule, RouterLink, NgbDropdownModule, IconComponent, ImageSearchComponent, ConfirmDialogComponent, LiveBoardComponent, BoardPreviewComponent, TranslatePipe],
  templateUrl: './live-room.component.html', styleUrls: ['./live-room.component.scss', './live-room-controls.scss']
})
export class LiveRoomComponent implements OnInit, OnDestroy {
  readonly WORLD_W = WORLD_W;
  readonly WORLD_H = WORLD_H;
  readonly pageFrame = pageFrame;
  private api = inject(LiveClassService);
  readonly i18n = inject(I18nService);
  private route = inject(ActivatedRoute);
  private element: ElementRef<HTMLElement> = inject(ElementRef);
  readonly user = inject(AuthService).currentUser;
  readonly id = Number(this.route.snapshot.paramMap.get('id'));
  room = signal<LiveSnapshot | null>(null);
  private base = signal<LiveBoard | null>(null);
  pending = signal<BoardOperation[]>([]);
  pdfImportProgress = signal<{ current: number; total: number } | null>(null);
  pdfSelection = signal<{ file: File; totalPages: number; pages: string } | null>(null);
  readonly selectedPdfPages = computed(() => { const selection = this.pdfSelection(); return selection ? parsePdfPageSelection(selection.pages, selection.totalPages) : null; });
  renamingPage = signal(false);
  pageTitleDraft = signal('');
  sending = signal(false);
  private syncFailure = signal<LiveNotice | null>(null);
  readonly syncError = computed(() => noticeText(this.i18n, this.syncFailure()));
  connectionLost = signal(false);
  loading = signal(true);
  busy = signal(false);
  private errorNotice = signal<LiveNotice | null>(null);
  private infoNotice = signal<LiveNotice | null>(null);
  readonly error = computed(() => noticeText(this.i18n, this.errorNotice()));
  readonly info = computed(() => noticeText(this.i18n, this.infoNotice()));
  tool = signal<BoardTool>('select');
  undoActions = signal<BoardHistoryAction[]>([]);
  redoActions = signal<BoardHistoryAction[]>([]);
  hand = signal(false);
  zoom = signal(50);
  readonly zoomPercent = computed(() => Math.round(this.zoom()));
  viewportWidth = signal(1000);
  viewportHeight = signal(700);
  framesOpen = signal(true);
  toolbarMoreAbove = signal(false);
  toolbarMoreBelow = signal(false);
  dragging = signal(false);
  toolOptions = computed(() => !this.hand() && this.canEdit() && ['pen', 'line', 'rect', 'ellipse', 'text'].includes(this.tool()));
  activeToolLabel = computed(() => this.i18n.t(this.hand() ? 'liveBoard.room.tool.pan' : this.tools.find(t => t.id === this.tool())?.labelKey || 'liveBoard.room.tool.select'));
  pageNumber = computed(() => (this.board()?.pages.findIndex(p => p.id === this.currentPage()?.id) ?? 0) + 1);
  color = signal('#2b2b2b');
  size = signal(4);
  follow = signal(true);
  localPage = signal<string | null>(null);
  panel = signal<'none' | 'images' | 'google' | 'participants'>('none');
  confirm = signal<Confirmation | null>(null);
  private confirmationPage: BoardPage | null = null;
  google = signal<GoogleStatus | null>(null);
  googleLoading = signal(false);
  private googleFailure = signal<LiveNotice | null>(null);
  readonly googleError = computed(() => noticeText(this.i18n, this.googleFailure()));
  classroomCourses = signal<ClassroomCourse[]>([]);
  nextCoursePage = signal<string | null>(null);
  driveFiles = signal<DriveBoardFile[]>([]);
  nextDrivePage = signal<string | null>(null);
  driveLoaded = signal(false);
  selectedDriveFile = signal<DriveBoardFile | null>(null);
  classroomId = '';
  resourceTitle = '';
  resourceUrl = '';
  board = computed(() => previewBoard(this.base(), this.pending()));
  currentPage = computed(() => {
    const board = this.board();
    return board?.pages.find(p => p.id === (!this.room()?.isOwner && !this.follow() ? this.localPage() : board.activePageId)) || board?.pages[0] || null;
  });
  canEdit = computed(() => !!this.room() && !this.syncFailure() && !this.busy() && (this.room()!.isOwner || (this.room()!.status === 'live' && this.room()!.allowStudentEdit)));
  canManage = computed(() => !!this.room()?.isOwner && !this.busy() && !this.pending().length);
  canUndo = computed(() => this.canEdit() && !this.sending() && !this.pending().length && this.undoActions().length > 0);
  canRedo = computed(() => this.canEdit() && !this.sending() && !this.pending().length && this.redoActions().length > 0);
  readonly imageAccept = IMAGE_ACCEPT;
  readonly fileAccept = `${IMAGE_ACCEPT},application/pdf,.pdf`;
  readonly statusLabel = (status: string) => liveStatusText(this.i18n, status);
  readonly palette = [{ color: '#2b2b2b', nameKey: 'black' }, { color: '#c94a14', nameKey: 'orange' }, { color: '#b3372f', nameKey: 'red' }, { color: '#2f7d4f', nameKey: 'green' }, { color: '#2f6f9f', nameKey: 'blue' }, { color: '#8b5e9e', nameKey: 'violet' }].map(c => ({ ...c, nameKey: `liveBoard.room.color.${c.nameKey}` }));
  readonly strokeSizes = [{ value: 2, labelKey: 'liveBoard.room.stroke.thin' }, { value: 4, labelKey: 'liveBoard.room.stroke.medium' }, { value: 8, labelKey: 'liveBoard.room.stroke.thick' }, { value: 16, labelKey: 'liveBoard.room.stroke.extra' }];
  readonly tools: { id: BoardTool; labelKey: string; icon: string }[] = ([
    ['select', 'move'], ['pen', 'pencil'], ['line', 'line'], ['rect', 'rectangle'], ['ellipse', 'ellipse'], ['note', 'sticky-note'], ['text', 'type'], ['eraser', 'eraser']
  ] as [BoardTool, string][]).map(([id, icon]) => ({ id, icon, labelKey: `liveBoard.room.tool.${id}` }));
  readonly backgrounds: { id: BoardPage['background']; nameKey: string }[] = (['plain', 'dots', 'grid', 'lines'] as const).map(id => ({ id, nameKey: `liveBoard.room.bg.${id}` }));
  readonly pageFormats: { id: BoardFormat; nameKey: string }[] = (['wide', 'standard', 'square', 'portrait', 'notebook'] as const).map(id => ({ id, nameKey: `liveBoard.room.format.${id}` }));
  private alive = true;
  private polling = false;
  private pollTimer?: ReturnType<typeof setInterval>;
  private presenceTimer?: ReturnType<typeof setInterval>;
  private lastPoll = 0;
  private viewportElement?: HTMLDivElement;
  private toolbarElement?: HTMLDivElement;
  private resizeObserver?: ResizeObserver;
  private manualZoom = false;
  private pan: { pointer: number; x: number; y: number; left: number; top: number } | null = null;
  private historyDrafts = new Map<string, string>();
  private historyGroups = new Map<string, BoardHistoryGroup>();
  @ViewChildren(NgbDropdown) private dropdowns!: QueryList<NgbDropdown>;

  @ViewChild('canvasViewport') set viewport(ref: ElementRef<HTMLDivElement> | undefined) {
    this.resizeObserver?.disconnect();
    this.viewportElement = ref?.nativeElement;
    if (!this.viewportElement) return;
    this.resizeObserver = new ResizeObserver(() => {
      this.measureViewport();
      this.measureToolbarScroll();
      if (!this.manualZoom) this.fitBoard();
    });
    // Observe the stable layout box. Observing the scroll container itself makes its
    // scrollbar appearance trigger fitBoard(), so an ordinary wheel scroll looks like zoom.
    this.resizeObserver.observe(this.viewportElement.parentElement || this.viewportElement);
    queueMicrotask(() => { if (this.alive && !this.manualZoom) this.fitBoard(); });
  }
  @ViewChild('boardToolbar') set boardToolbar(ref: ElementRef<HTMLDivElement> | undefined) {
    this.toolbarElement = ref?.nativeElement;
    const measure = () => this.measureToolbarScroll();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(measure); else queueMicrotask(measure);
  }

  ngOnInit(): void {
    void this.refresh();
    this.pollTimer = setInterval(() => {
      const interval = document.hidden ? 10000 : 1800;
      if (Date.now() - this.lastPoll >= interval) void this.refresh();
    }, 900);
    this.presenceTimer = setInterval(() => this.presence(), 12000);
  }
  ngOnDestroy(): void { this.alive = false; clearInterval(this.pollTimer); clearInterval(this.presenceTimer); this.resizeObserver?.disconnect(); }
  @HostListener('document:pointerdown', ['$event'])
  closeOverlaysOnOutside(event: PointerEvent): void {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest('.dropdown-menu, [ngbdropdown], [ngbdropdowntoggle]')) this.dropdowns?.forEach(dropdown => dropdown.close());
    if (this.panel() !== 'none' && !event.target.closest('.room-panel, .panel-toggle')) this.panel.set('none');
  }
  measureToolbarScroll(): void {
    const toolbar = this.toolbarElement;
    if (!toolbar) return;
    this.toolbarMoreAbove.set(toolbar.scrollTop > 2);
    this.toolbarMoreBelow.set(toolbar.scrollTop + toolbar.clientHeight < toolbar.scrollHeight - 2);
  }
  selectTool(tool: BoardTool): void { this.hand.set(false); this.tool.set(tool); }
  private measureViewport(): void {
    if (!this.viewportElement) return;
    this.viewportWidth.set(this.viewportElement.clientWidth);
    this.viewportHeight.set(this.viewportElement.clientHeight);
  }
  fitBoard(): void {
    const viewport = this.viewportElement;
    if (!viewport) return;
    this.measureViewport();
    this.manualZoom = false;
    const margin = viewport.clientWidth < 640 ? 100 : 200;
    const frame = pageFrame(this.currentPage() || 'wide');
    const fit = Math.min((viewport.clientWidth - margin) / frame.w, (viewport.clientHeight - 240) / frame.h);
    this.zoom.set(Math.max(10, Math.min(100, Math.floor(fit * 100))));
    // Leave space around the frame so the hand can pan even when the whole page fits.
    requestAnimationFrame(() => {
      if (this.alive) viewport.scrollTo?.({ left: Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2), top: Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2) });
    });
  }
  zoomBy(delta: number): void {
    const viewport = this.viewportElement, next = Math.max(10, Math.min(200, this.zoom() + delta));
    if (viewport) this.zoomAt(next, viewport.clientWidth / 2, viewport.clientHeight / 2, true);
    else { this.manualZoom = true; this.zoom.set(next); }
  }
  zoomWheel(event: WheelEvent): void {
    const viewport = this.viewportElement;
    if (!viewport || !(event.target instanceof Node) || !viewport.contains(event.target)) return;
    // Vertical and horizontal wheel input scroll the workspace. Trackpad pinch and deliberate
    // mouse-wheel zoom both arrive with Ctrl/Meta held in Chrome.
    if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest('button, input, textarea, select, a, [contenteditable="true"]')) return;
    if (!event.deltaY) return;
    event.preventDefault();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? viewport.clientHeight : 1;
    const delta = Math.max(-240, Math.min(240, event.deltaY * unit));
    const next = Math.max(10, Math.min(200, this.zoom() * Math.exp(-delta * 0.0015)));
    if (Math.abs(next - this.zoom()) < 0.1) return;
    this.zoomAt(next, event.clientX, event.clientY);
  }
  private zoomAt(next: number, x: number, y: number, local = false): void {
    const viewport = this.viewportElement;
    this.manualZoom = true;
    if (!viewport) { this.zoom.set(next); return; }
    const rect = viewport.getBoundingClientRect();
    const offsetX = local ? x : x - rect.left, offsetY = local ? y : y - rect.top;
    const anchorX = (viewport.scrollLeft + offsetX) / Math.max(1, viewport.scrollWidth);
    const anchorY = (viewport.scrollTop + offsetY) / Math.max(1, viewport.scrollHeight);
    this.zoom.set(next);
    const reposition = () => {
      if (!this.alive) return;
      viewport.scrollTo?.({ left: anchorX * viewport.scrollWidth - offsetX, top: anchorY * viewport.scrollHeight - offsetY });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reposition); else reposition();
  }
  startPan(event: PointerEvent): void {
    if ((!this.hand() && event.button !== 1) || (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1)) return;
    if ((event.target as Element | null)?.closest?.('button, input, textarea, select, a')) return;
    const viewport = event.currentTarget as HTMLDivElement;
    viewport.setPointerCapture?.(event.pointerId);
    this.pan = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    this.dragging.set(true);
  }
  movePan(event: PointerEvent): void {
    if (!this.pan || this.pan.pointer !== event.pointerId || !this.viewportElement) return;
    this.viewportElement.scrollLeft = this.pan.left - event.clientX + this.pan.x;
    this.viewportElement.scrollTop = this.pan.top - event.clientY + this.pan.y;
  }
  endPan(): void { this.pan = null; this.dragging.set(false); }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent): void {
    if (this.pending().length || this.busy()) { event.preventDefault(); event.returnValue = ''; }
  }
  @HostListener('window:keydown', ['$event']) historyShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && event.shiftKey && this.canRedo()) { event.preventDefault(); this.redo(); }
    else if (key === 'z' && this.canUndo()) { event.preventDefault(); this.undo(); }
    else if (key === 'y' && this.canRedo()) { event.preventDefault(); this.redo(); }
  }
  canLeave(): boolean { return !(this.pending().length || this.busy()) || window.confirm(this.i18n.t('teacherDashboard.live.leavePrompt')); }
  async refresh(force = false): Promise<void> {
    if (!this.alive || this.polling || (!force && (this.sending() || this.pending().length || this.busy()))) return;
    this.polling = true; this.lastPoll = Date.now();
    try {
      const result = await firstValueFrom(this.api.snapshot(this.id, force ? undefined : this.room()?.revision));
      if (!this.alive) return;
      const first = !this.room();
      if (!this.room() || result.revision >= this.room()!.revision) {
        this.room.set(result);
        if (result.board) this.base.set(result.board);
      }
      this.connectionLost.set(false);
      if (first) {
        this.presence();
        if (result.isOwner) void this.loadGoogleStatus();
      }
    } catch (e: any) {
      if (!this.alive) return;
      if (!this.room()) this.errorNotice.set(noticeError(e, 'liveBoard.error.openClass'));
      this.connectionLost.set(true);
    } finally { this.polling = false; if (this.alive) this.loading.set(false); }
  }
  private presence(): void {
    if (!this.alive || !this.room()) return;
    this.api.presence(this.id).subscribe({ error: () => {} });
  }
  queue(input: BoardOperation | BoardOperation[]): void {
    if (!this.canEdit()) return;
    const ops = (Array.isArray(input) ? input : [input]).filter(isBoardOperation);
    if (!ops.length) return;
    this.enqueue(ops, 'new');
  }
  private enqueue(ops: BoardOperation[], kind: 'new' | 'undo' | 'redo', action?: BoardHistoryAction): void {
    const groupId = newId();
    const changes: BoardHistoryChange[] = [];
    if (kind === 'new') {
      const board = this.board();
      const pageChanges = new Map<string, BoardPageHistoryChange>();
      for (const op of ops) {
        if (op.type === 'page-background' || op.type === 'page-format' || op.type === 'page-rename' || op.type === 'page-reorder') {
          const page = board?.pages.find(p => p.id === op.pageId);
          if (!page) continue;
          const existing = pageChanges.get(page.id);
          const before = existing?.before || this.pageState(board, page.id)!;
          const after = { ...(existing?.after || before), ...(op.type === 'page-format' && op.format ? { format: op.format } : {}), ...(op.type === 'page-background' && op.background ? { background: op.background } : {}), ...(op.type === 'page-rename' && op.title ? { title: op.title } : {}), ...(op.type === 'page-reorder' && op.index !== undefined ? { index: op.index } : {}) };
          pageChanges.set(page.id, { pageId: page.id, before, after, current: { ...after } });
          continue;
        }
        if (op.type !== 'put' && op.type !== 'delete') continue;
        const page = board?.pages.find(p => p.id === op.pageId);
        const elementId = op.type === 'put' ? op.element?.id : op.elementId;
        const before = page?.elements.find(e => e.id === elementId) || null;
        if (!elementId || (op.type === 'delete' && !before)) continue;
        const after = op.type === 'put' && op.element ? { ...structuredClone(op.element), version: (op.expectedVersion || 0) + 1 } : null;
        changes.push({ pageId: op.pageId, elementId, before: before ? structuredClone(before) : null, after, current: after ? structuredClone(after) : null });
      }
      if (changes.length || pageChanges.size) {
        const historyAction: BoardHistoryAction = { changes, ...(pageChanges.size ? { pageChanges: [...pageChanges.values()] } : {}) };
        this.historyGroups.set(groupId, { kind, action: historyAction, remaining: ops.length });
        for (const op of ops) this.historyDrafts.set(op.id, groupId);
      }
    } else if (action) {
      this.historyGroups.set(groupId, { kind, action, remaining: ops.length });
      for (const op of ops) this.historyDrafts.set(op.id, groupId);
    }
    this.pending.update(pending => [...pending, ...ops]);
    void this.flush();
  }
  async flush(): Promise<void> {
    if (this.sending() || !this.alive || this.syncFailure()) return;
    this.sending.set(true);
    let activePenBatch: Array<{ operationId: string; pageId: string; elementId: string; pointCount: number }> = [];
    try {
      while (this.pending().length && this.alive) {
        const batch = this.pending().slice(0, 40);
        activePenBatch = batch.flatMap(operation => {
          const element = operation.type === 'put' ? operation.element : undefined;
          return element?.type === 'pen'
            ? [{ operationId: operation.id, pageId: operation.pageId, elementId: element.id, pointCount: element.points?.length || 0 }]
            : [];
        });
        if (activePenBatch.length) console.info('[BoardDraw] envío de trazos al servidor', { strokes: activePenBatch });
        const result = await firstValueFrom(this.api.change(this.id, batch));
        if (!this.alive) return;
        if (activePenBatch.length) console.info('[BoardDraw] respuesta del servidor', {
          revision: result.revision,
          strokes: activePenBatch.map(stroke => {
            const element = result.board.pages.find(page => page.id === stroke.pageId)?.elements.find(item => item.id === stroke.elementId);
            return { ...stroke, persisted: !!element, persistedPointCount: element?.points?.length || 0 };
          })
        });
        // A slow read started before this mutation must never replace this newer version.
        if (result.revision >= (this.room()?.revision ?? -1)) {
          this.base.set(result.board);
          this.room.update(room => room ? { ...room, revision: result.revision } : room);
        }
        this.finishHistory(batch, result.board);
        this.pending.update(ops => ops.slice(batch.length));
        this.connectionLost.set(false);
        activePenBatch = [];
      }
    } catch (e) {
      if (activePenBatch.length) console.error('[BoardDraw] error al guardar trazos', { strokes: activePenBatch, error: e });
      if (this.alive) this.syncFailure.set(noticeError(e, 'liveBoard.error.syncInterrupted'));
    } finally { this.sending.set(false); }
  }
  dismissInfo(): void { this.infoNotice.set(null); }
  retry(): void { this.syncFailure.set(null); void this.flush(); }
  undo(): void { this.applyHistory('undo'); }
  redo(): void { this.applyHistory('redo'); }
  private applyHistory(kind: 'undo' | 'redo'): void {
    if ((kind === 'undo' ? !this.canUndo() : !this.canRedo())) return;
    const source = kind === 'undo' ? this.undoActions() : this.redoActions();
    const action = source[source.length - 1], board = this.base();
    if (!action || !board) return;
    const operations: BoardOperation[] = [];
    for (const change of action.changes) {
      const page = board.pages.find(p => p.id === change.pageId);
      const current = page?.elements.find(e => e.id === change.elementId) || null;
      if (!page || current?.version !== change.current?.version || !!current !== !!change.current) {
        this.errorNotice.set(noticeKey('liveBoard.error.historyConflict'));
        return;
      }
      const desired = kind === 'undo' ? change.before : change.after;
      if (desired) operations.push({ id: newId(), type: 'put', pageId: change.pageId, element: desired, expectedVersion: current?.version || 0 });
      else if (current) operations.push({ id: newId(), type: 'delete', pageId: change.pageId, elementId: change.elementId, expectedVersion: current.version });
    }
    for (const change of action.pageChanges || []) {
      const current = this.pageState(board, change.pageId);
      if (!current || current.format !== change.current.format || current.background !== change.current.background || current.title !== change.current.title || current.index !== change.current.index) {
        this.errorNotice.set(noticeKey('liveBoard.error.historyConflict'));
        return;
      }
      const desired = kind === 'undo' ? change.before : change.after;
      if (desired.title !== current.title) operations.push({ id: newId(), type: 'page-rename', pageId: change.pageId, title: desired.title, expectedRevision: this.room()?.revision });
      if (desired.index !== current.index) operations.push({ id: newId(), type: 'page-reorder', pageId: change.pageId, index: desired.index, expectedRevision: this.room()?.revision });
      if (desired.format !== current.format) operations.push({ id: newId(), type: 'page-format', pageId: change.pageId, format: desired.format });
      if (desired.background !== current.background) operations.push({ id: newId(), type: 'page-background', pageId: change.pageId, background: desired.background });
    }
    if (operations.length) this.enqueue(operations, kind, action);
  }
  private finishHistory(batch: BoardOperation[], board: LiveBoard): void {
    const groupIds = new Set(batch.map(op => this.historyDrafts.get(op.id)).filter((id): id is string => !!id));
    for (const groupId of groupIds) {
      const group = this.historyGroups.get(groupId);
      if (!group) continue;
      const committed = batch.filter(op => this.historyDrafts.get(op.id) === groupId);
      for (const op of committed) this.historyDrafts.delete(op.id);
      group.remaining -= committed.length;
      if (group.remaining > 0) continue;
      for (const change of group.action.changes) {
        const page = board.pages.find(p => p.id === change.pageId);
        const current = page?.elements.find(e => e.id === change.elementId) || null;
        change.current = current ? structuredClone(current) : null;
      }
      for (const change of group.action.pageChanges || []) {
        const current = this.pageState(board, change.pageId);
        if (current) change.current = current;
      }
      if (group.kind === 'new') {
        this.undoActions.update(items => [...items.slice(-29), group.action]); this.redoActions.set([]);
      } else if (group.kind === 'undo') {
        this.undoActions.update(items => items.filter(item => item !== group.action)); this.redoActions.update(items => [...items.slice(-29), group.action]);
      } else {
        this.redoActions.update(items => items.filter(item => item !== group.action)); this.undoActions.update(items => [...items.slice(-29), group.action]);
      }
      this.historyGroups.delete(groupId);
    }
  }
  private pageState(board: LiveBoard | null, pageId: string): BoardPageSettings | null {
    const index = board?.pages.findIndex(page => page.id === pageId) ?? -1;
    if (!board || index < 0) return null;
    const page = board.pages[index];
    return { format: page.format || 'wide', background: page.background, title: page.title, index };
  }
  ask(action: Confirmation): void { this.confirmationPage = this.currentPage(); this.confirm.set(action); }
  get confirmationTitle(): string {
    const keys = { clear: 'clearTitle', 'delete-page': 'deletePageTitle', restore: 'restoreTitle', end: 'endTitle', discard: 'discardTitle' } as const;
    return this.i18n.t(`teacherDashboard.live.${keys[this.confirm() || 'clear']}`);
  }
  get confirmationMessage(): string {
    const page = this.confirmationPage?.title || this.i18n.t('teacherDashboard.live.thisPage');
    switch (this.confirm()) {
      case 'clear': return this.i18n.t('teacherDashboard.live.clearMessage', { page });
      case 'delete-page': return this.i18n.t('teacherDashboard.live.deletePageMessage', { page });
      case 'restore': return this.i18n.t('teacherDashboard.live.restoreMessage', { name: this.selectedDriveFile()?.name ?? '' });
      case 'end': return this.i18n.t('teacherDashboard.live.endMessage', { title: this.room()?.title ?? '' });
      default: return this.i18n.t('teacherDashboard.live.discardMessage');
    }
  }
  get confirmationAction(): string {
    const keys = { end: 'endAction', restore: 'restoreAction', discard: 'discardAction' } as const;
    const action = this.confirm();
    return this.i18n.t(`teacherDashboard.live.${action && action in keys ? keys[action as keyof typeof keys] : 'deleteAction'}`);
  }
  async confirmAction(): Promise<void> {
    const action = this.confirm(); this.confirm.set(null);
    if (action === 'discard') { this.pending.set([]); this.historyDrafts.clear(); this.historyGroups.clear(); this.syncFailure.set(null); await this.refresh(true); return; }
    if (action === 'end') { await this.setStatus('ended'); return; }
    if (action === 'restore') { await this.restore(); return; }
    if ((action === 'clear' || action === 'delete-page') && this.confirmationPage && this.canManage()) {
      this.queue({ id: newId(), type: action === 'clear' ? 'page-clear' : 'page-delete', pageId: this.confirmationPage.id, expectedRevision: this.room()!.revision });
    }
  }
  choosePage(id: string): void {
    if (this.room()?.isOwner) { if (this.canManage()) this.queue({ id: newId(), type: 'page-active', pageId: id }); }
    else { this.localPage.set(id); this.follow.set(false); }
  }
  toggleFollow(): void {
    this.localPage.set(this.currentPage()?.id || null);
    this.follow.update(value => !value);
  }
  addPage(): void {
    if (!this.canManage() || (this.board()?.pages.length || 0) >= 20) return;
    this.queue({ id: newId(), type: 'page-add', pageId: newId(), title: this.i18n.t('liveBoard.room.defaultPageTitle', { number: (this.board()?.pages.length || 0) + 1 }), format: this.currentPage()?.format || 'wide' });
  }
  background(value: string): void {
    if (this.canManage() && this.currentPage()) this.queue({ id: newId(), type: 'page-background', pageId: this.currentPage()!.id, background: value as BoardPage['background'] });
  }
  pageFormat(value: BoardFormat): void {
    const page = this.currentPage();
    if (!this.canManage() || !page || !this.pageFormats.some(format => format.id === value)) return;
    const operations: BoardOperation[] = [{ id: newId(), type: 'page-format', pageId: page.id, format: value }];
    if (value === 'notebook' && page.background !== 'lines') operations.push({ id: newId(), type: 'page-background', pageId: page.id, background: 'lines' });
    this.queue(operations);
    requestAnimationFrame(() => this.fitBoard());
  }
  startRenamePage(): void {
    const page = this.currentPage();
    if (!this.canManage() || !page) return;
    this.pageTitleDraft.set(page.title); this.renamingPage.set(true);
    requestAnimationFrame(() => {
      const input = this.element.nativeElement.querySelector<HTMLInputElement>('[data-page-title-input]');
      input?.focus(); input?.select();
    });
  }
  savePageTitle(event?: Event): void {
    event?.preventDefault();
    const page = this.currentPage(), title = this.pageTitleDraft().trim();
    if (!this.canManage() || !page || !title || title.length > 80) return;
    if (title !== page.title) this.queue({ id: newId(), type: 'page-rename', pageId: page.id, title, expectedRevision: this.room()?.revision });
    this.renamingPage.set(false);
  }
  cancelPageRename(): void { this.renamingPage.set(false); }
  movePage(offset: -1 | 1): void {
    const board = this.board(), page = this.currentPage();
    if (!this.canManage() || !board || !page) return;
    const index = board.pages.findIndex(item => item.id === page.id), target = index + offset;
    if (target < 0 || target >= board.pages.length) return;
    this.queue({ id: newId(), type: 'page-reorder', pageId: page.id, index: target, expectedRevision: this.room()?.revision });
  }
  private updateRoom(result: LiveClass): void { this.room.update(room => room ? { ...room, ...result } : room); }
  private async action(fn: () => Promise<void>, fallback = 'liveBoard.error.generic'): Promise<void> {
    if (this.busy() || this.pending().length) return;
    this.busy.set(true); this.errorNotice.set(null); this.infoNotice.set(null);
    try { await fn(); } catch (e) { if (this.alive) this.errorNotice.set(noticeError(e, fallback)); } finally { if (this.alive) this.busy.set(false); }
  }
  async setStatus(status: LiveStatus): Promise<void> { if (this.canManage()) await this.action(async () => this.updateRoom(await firstValueFrom(this.api.settings(this.id, { status })))); }
  async toggleEditing(): Promise<void> { if (this.canManage()) await this.action(async () => this.updateRoom(await firstValueFrom(this.api.settings(this.id, { allowStudentEdit: !this.room()!.allowStudentEdit })))); }
  get joinUrl(): string { return `${window.location.origin}/live/join/${this.room()?.joinCode || ''}`; }
  openInvitePanel(): void { this.togglePanel('participants'); }
  async share(): Promise<void> {
    const copied = await copyText(this.joinUrl);
    this.infoNotice.set(noticeKey(copied ? 'liveBoard.info.inviteCopied' : 'liveBoard.info.inviteCopyFailed'));
    this.panel.set('participants');
  }
  togglePanel(panel: 'images' | 'google' | 'participants'): void {
    this.panel.update(current => current === panel ? 'none' : panel);
    if (this.panel() === 'google') void this.loadGoogleStatus();
  }
  async loadGoogleStatus(): Promise<void> {
    if (!this.alive || !this.room()?.isOwner || this.googleLoading()) return;
    this.googleLoading.set(true); this.googleFailure.set(null);
    try {
      const status = await firstValueFrom(this.api.googleStatus());
      if (this.alive) this.google.set(status);
    } catch (e) {
      if (this.alive) this.googleFailure.set(noticeError(e, 'liveBoard.error.googleStatus'));
    } finally { if (this.alive) this.googleLoading.set(false); }
  }
  async insertImage(file: File): Promise<void> {
    if (!this.canEdit() || this.pending().length) return;
    const invalid = imageFileErrorKey(file);
    if (invalid) { this.errorNotice.set(noticeKey(invalid)); return; }
    const pageId = this.currentPage()!.id;
    let url = '';
    await this.action(async () => { const result = await firstValueFrom(this.api.upload(this.id, file)); url = result.url; });
    if (!url || !this.alive || !this.canEdit()) return;
    const e: BoardElement = { id: newId(), type: 'image', x: 160, y: 100, w: 500, h: 400, color: this.color(), width: 1, url, authorId: this.user()!.id, version: 0 };
    this.queue({ id: newId(), type: 'put', pageId, expectedVersion: 0, element: e }); this.tool.set('select');
  }
  fileSelected(event: Event): void {
    const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = '';
    if (!file) return;
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) void this.preparePdf(file);
    else void this.insertImage(file);
  }
  async preparePdf(file: File): Promise<void> {
    const maxBytes = 20 * 1024 * 1024;
    if (!this.canEdit() || this.pending().length) return;
    if (file.size > maxBytes) { this.errorNotice.set(noticeKey('liveBoard.error.pdfTooLarge')); return; }
    let loadingTask: import('pdfjs-dist').PDFDocumentLoadingTask | null = null;
    this.busy.set(true); this.errorNotice.set(null); this.infoNotice.set(null);
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('assets/pdf.worker.min.mjs', document.baseURI).toString();
      loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      const loaded = await loadingTask.promise;
      if (!loaded.numPages) throw new Error('pdf_page_limit');
      this.pdfSelection.set({ file, totalPages: loaded.numPages, pages: `1-${Math.min(loaded.numPages, 40)}` });
    } catch {
      this.errorNotice.set(noticeKey('liveBoard.error.pdfImport'));
    } finally {
      try { await loadingTask?.destroy(); } catch { /* The document can already be closed after a read error. */ }
      this.busy.set(false);
    }
  }
  updatePdfPageSelection(pages: string): void { this.pdfSelection.update(selection => selection ? { ...selection, pages } : selection); }
  cancelPdfSelection(): void { this.pdfSelection.set(null); }
  async confirmPdfImport(): Promise<void> {
    const selection = this.pdfSelection(), pageNumbers = this.selectedPdfPages();
    if (!selection || !pageNumbers?.length || !this.canEdit() || this.pending().length) return;
    const pageId = this.currentPage()?.id, userId = this.user()?.id;
    if (!pageId || userId === undefined) return;
    const operations: BoardOperation[] = [];
    let loadingTask: import('pdfjs-dist').PDFDocumentLoadingTask | null = null;
    this.busy.set(true); this.errorNotice.set(null); this.infoNotice.set(null);
    try {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('assets/pdf.worker.min.mjs', document.baseURI).toString();
      loadingTask = pdfjs.getDocument({ data: new Uint8Array(await selection.file.arrayBuffer()) });
      const loaded = await loadingTask.promise;
      if (pageNumbers.some(page => page > loaded.numPages)) throw new Error('pdf_page_limit');
      const firstPage = await loaded.getPage(pageNumbers[0]), firstViewport = firstPage.getViewport({ scale: 1 });
      const cells = pdfGridLayout(pageNumbers.length, firstViewport.width / firstViewport.height, this.currentPage()?.format);
      this.pdfImportProgress.set({ current: 0, total: pageNumbers.length });
      for (let index = 0; index < pageNumbers.length; index++) {
        const pageNumber = pageNumbers[index];
        const page = index === 0 ? firstPage : await loaded.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 }), cell = cells[index];
        const displayScale = Math.min(cell.w / baseViewport.width, cell.h / baseViewport.height);
        const viewport = page.getViewport({ scale: displayScale * 2 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        if (!canvas.getContext('2d')) throw new Error('pdf_canvas_unavailable');
        await page.render({ canvas, viewport }).promise;
        const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('pdf_image_failed')), 'image/jpeg', 0.88));
        const safeName = selection.file.name.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'pdf';
        const uploaded = await firstValueFrom(this.api.upload(this.id, new File([image], `${safeName}-${pageNumber}.jpg`, { type: 'image/jpeg' })));
        const w = baseViewport.width * displayScale, h = baseViewport.height * displayScale;
        const element: BoardElement = { id: newId(), type: 'image', x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2,
          w, h, color: '#2b2b2b', width: 1, url: uploaded.url, authorId: userId, version: 0 };
        operations.push({ id: newId(), type: 'put', pageId, element, expectedVersion: 0 });
        page.cleanup(); canvas.width = 0; canvas.height = 0;
        this.pdfImportProgress.set({ current: index + 1, total: pageNumbers.length });
      }
    } catch {
      this.errorNotice.set(noticeKey('liveBoard.error.pdfImport'));
    } finally {
      try { await loadingTask?.destroy(); } catch { /* The document can already be closed after a render error. */ }
      this.busy.set(false); this.pdfImportProgress.set(null);
    }
    if (!this.alive || operations.length !== pageNumbers.length || !this.canEdit()) return;
    this.pdfSelection.set(null); this.queue(operations); this.tool.set('select');
  }
  addResource(): void {
    if (!this.canEdit() || !this.resourceTitle.trim()) return;
    let url: URL;
    try { url = new URL(this.resourceUrl); if (url.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(url.hostname) || url.username || url.password) throw new Error(); }
    catch { this.errorNotice.set(noticeKey('liveBoard.error.resourceLink')); return; }
    const e: BoardElement = { id: newId(), type: 'link', x: 200, y: 180, w: 320, h: 100, color: '#2f6f9f', width: 1, text: this.resourceTitle.trim(), url: url.href, authorId: this.user()!.id, version: 0 };
    this.queue({ id: newId(), type: 'put', pageId: this.currentPage()!.id, expectedVersion: 0, element: e });
    this.resourceTitle = ''; this.resourceUrl = ''; this.tool.set('select');
  }
  async loadCourses(more = false): Promise<void> {
    await this.action(async () => {
      const result = await firstValueFrom(this.api.classroomCourses(more ? this.nextCoursePage() || undefined : undefined));
      this.classroomCourses.set(more ? [...this.classroomCourses(), ...result.courses] : result.courses); this.nextCoursePage.set(result.nextPageToken);
      if (!result.courses.length && !more) this.infoNotice.set(noticeKey('liveBoard.info.noClassroomClasses'));
    });
  }
  async linkClassroom(): Promise<void> {
    if (this.classroomId) await this.action(async () => { this.updateRoom(await firstValueFrom(this.api.linkClassroom(this.id, this.classroomId))); this.infoNotice.set(noticeKey('liveBoard.info.classroomLinked')); });
  }
  async announce(): Promise<void> {
    await this.action(async () => { this.updateRoom(await firstValueFrom(this.api.announce(this.id))); this.infoNotice.set(noticeKey('liveBoard.info.announced')); });
  }
  async saveDrive(): Promise<void> {
    await this.action(async () => { this.updateRoom(await firstValueFrom(this.api.saveDrive(this.id))); this.infoNotice.set(noticeKey('liveBoard.info.driveSaved')); });
  }
  async loadDrive(more = false): Promise<void> {
    await this.action(async () => {
      const result = await firstValueFrom(this.api.driveFiles(more ? this.nextDrivePage() || undefined : undefined));
      this.driveFiles.set(more ? [...this.driveFiles(), ...result.files] : result.files); this.nextDrivePage.set(result.nextPageToken || null); this.driveLoaded.set(true);
    });
  }
  private async restore(): Promise<void> {
    const file = this.selectedDriveFile();
    if (!file || !this.canManage() || this.room()?.status === 'live') return;
    const revision = this.room()!.revision;
    await this.action(async () => { const result = await firstValueFrom(this.api.restore(this.id, file.id, revision)); this.updateRoom(result); if (result.board) this.base.set(result.board); this.infoNotice.set(noticeKey('liveBoard.info.restored')); });
  }
  download(): void {
    const board = this.board(); if (!board) return;
    downloadBlob(new Blob([JSON.stringify({ format: 'spanishnow-live-board', version: 1, title: this.room()?.title, board }, null, 2)], { type: 'application/json' }), this.i18n.t('liveBoard.export.jsonFile'));
  }
  async exportPng(): Promise<void> {
    const svg = this.element.nativeElement.querySelector<SVGSVGElement>('svg.live-canvas');
    if (!svg) return;
    await this.action(async () => { const blob = await exportPagePng(svg, this.currentPage() || undefined); downloadBlob(blob, this.i18n.t('liveBoard.export.pngFile')); }, 'liveBoard.error.exportFailed');
  }
  async exportPdf(): Promise<void> {
    const board = this.board();
    if (!board?.pages.length) return;
    await this.action(async () => {
      const blob = await exportBoardPdf(board.pages, this.i18n.t('liveBoard.board.driveLabel'));
      downloadBlob(blob, this.i18n.t('liveBoard.export.pdfFile'));
    }, 'liveBoard.error.exportFailed');
  }
}
