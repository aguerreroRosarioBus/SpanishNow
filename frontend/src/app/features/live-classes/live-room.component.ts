import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { LiveClassService } from '../../core/services/live-class.service';
import { BoardElement, BoardOperation, BoardPage, BoardTool, ClassroomCourse, DriveBoardFile, GoogleStatus, LiveBoard, LiveClass, LiveSnapshot, LiveStatus } from '../../core/models/live-class.model';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ImageSearchComponent } from '../../shared/components/image-search/image-search.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { copyText } from '../../shared/utils/clipboard';
import { IMAGE_ACCEPT, validateImageFile } from '../teacher/lesson-composer/image-file';
import { LiveBoardComponent } from './board/live-board.component';
import { BoardPreviewComponent } from './board/board-preview.component';
import { newId, previewBoard } from './board/board.logic';
import { downloadBlob, exportPagePng } from './board/board.export';
import { liveErrorMessage, liveStatusLabel } from './live-classes.component';

type Confirmation = 'clear' | 'delete-page' | 'restore' | 'end' | 'discard';
@Component({
  selector: 'app-live-room', standalone: true,
  imports: [FormsModule, RouterLink, NgbDropdownModule, IconComponent, ImageSearchComponent, ConfirmDialogComponent, LiveBoardComponent, BoardPreviewComponent],
  templateUrl: './live-room.component.html', styleUrls: ['./live-room.component.scss', './live-room-controls.scss']
})
export class LiveRoomComponent implements OnInit, OnDestroy {
  private api = inject(LiveClassService);
  private i18n = inject(I18nService);
  private route = inject(ActivatedRoute);
  private element: ElementRef<HTMLElement> = inject(ElementRef);
  readonly user = inject(AuthService).currentUser;
  readonly id = Number(this.route.snapshot.paramMap.get('id'));
  room = signal<LiveSnapshot | null>(null);
  private base = signal<LiveBoard | null>(null);
  pending = signal<BoardOperation[]>([]);
  sending = signal(false);
  syncError = signal('');
  connectionLost = signal(false);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  info = signal('');
  tool = signal<BoardTool>('select');
  hand = signal(false);
  zoom = signal(50);
  viewportWidth = signal(1000);
  viewportHeight = signal(700);
  framesOpen = signal(true);
  dragging = signal(false);
  toolOptions = computed(() => !this.hand() && this.canEdit() && ['pen', 'line', 'rect', 'ellipse', 'text'].includes(this.tool()));
  activeToolLabel = computed(() => this.hand() ? 'Desplazar lienzo' : this.tools.find(t => t.id === this.tool())?.label || 'Seleccionar');
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
  googleError = signal('');
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
  canEdit = computed(() => !!this.room() && !this.syncError() && !this.busy() && (this.room()!.isOwner || (this.room()!.status === 'live' && this.room()!.allowStudentEdit)));
  canManage = computed(() => !!this.room()?.isOwner && !this.busy() && !this.pending().length);
  readonly imageAccept = IMAGE_ACCEPT;
  readonly statusLabel = liveStatusLabel;
  readonly palette = [{ color: '#2b2b2b', name: 'Negro' }, { color: '#c94a14', name: 'Naranja' }, { color: '#b3372f', name: 'Rojo' }, { color: '#2f7d4f', name: 'Verde' }, { color: '#2f6f9f', name: 'Azul' }, { color: '#8b5e9e', name: 'Violeta' }];
  readonly tools: { id: BoardTool; label: string; icon: string }[] = [
    { id: 'select', label: 'Seleccionar y mover', icon: 'move' }, { id: 'pen', label: 'Lápiz', icon: 'pencil' },
    { id: 'line', label: 'Línea', icon: 'line' }, { id: 'rect', label: 'Rectángulo', icon: 'rectangle' },
    { id: 'ellipse', label: 'Elipse', icon: 'ellipse' }, { id: 'note', label: 'Nota adhesiva', icon: 'sticky-note' },
    { id: 'text', label: 'Texto', icon: 'type' }, { id: 'eraser', label: 'Borrar elemento', icon: 'eraser' }
  ];
  readonly backgrounds: { id: BoardPage['background']; name: string }[] = [{ id: 'plain', name: 'Liso' }, { id: 'dots', name: 'Puntos' }, { id: 'grid', name: 'Cuadrícula' }, { id: 'lines', name: 'Renglones' }];
  private alive = true;
  private polling = false;
  private pollTimer?: ReturnType<typeof setInterval>;
  private presenceTimer?: ReturnType<typeof setInterval>;
  private lastPoll = 0;
  private viewportElement?: HTMLDivElement;
  private resizeObserver?: ResizeObserver;
  private manualZoom = false;
  private pan: { pointer: number; x: number; y: number; left: number; top: number } | null = null;

  @ViewChild('canvasViewport') set viewport(ref: ElementRef<HTMLDivElement> | undefined) {
    this.resizeObserver?.disconnect();
    this.viewportElement = ref?.nativeElement;
    if (!this.viewportElement) return;
    this.resizeObserver = new ResizeObserver(() => {
      this.measureViewport();
      if (!this.manualZoom) this.fitBoard();
    });
    this.resizeObserver.observe(this.viewportElement);
    queueMicrotask(() => { if (this.alive && !this.manualZoom) this.fitBoard(); });
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
    const fit = Math.min((viewport.clientWidth - margin) / 1600, (viewport.clientHeight - 240) / 900);
    this.zoom.set(Math.max(10, Math.min(100, Math.floor(fit * 100))));
    // Leave space around the frame so the hand can pan even when the whole page fits.
    requestAnimationFrame(() => {
      if (this.alive) viewport.scrollTo?.({ left: Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2), top: Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2) });
    });
  }
  zoomBy(delta: number): void {
    const viewport = this.viewportElement;
    const previous = this.zoom(), next = Math.max(10, Math.min(200, previous + delta));
    this.manualZoom = true;
    const x = viewport ? (viewport.scrollLeft + viewport.clientWidth / 2) / Math.max(1, viewport.scrollWidth) : 0;
    const y = viewport ? (viewport.scrollTop + viewport.clientHeight / 2) / Math.max(1, viewport.scrollHeight) : 0;
    this.zoom.set(next);
    if (viewport) requestAnimationFrame(() => {
      if (!this.alive) return;
      viewport.scrollTo?.({ left: x * viewport.scrollWidth - viewport.clientWidth / 2, top: y * viewport.scrollHeight - viewport.clientHeight / 2 });
    });
  }
  startPan(event: PointerEvent): void {
    if ((!this.hand() && event.button !== 1) || (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1)) return;
    if ((event.target as Element | null)?.closest?.('button, input, textarea, select, a')) return;
    const viewport = event.currentTarget as HTMLDivElement;
    event.preventDefault(); viewport.setPointerCapture?.(event.pointerId);
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
      if (!this.room()) this.error.set(liveErrorMessage(e, 'No se pudo abrir la clase.'));
      this.connectionLost.set(true);
    } finally { this.polling = false; if (this.alive) this.loading.set(false); }
  }
  private presence(): void {
    if (!this.alive || !this.room()) return;
    this.api.presence(this.id).subscribe({ error: () => {} });
  }
  queue(op: BoardOperation): void {
    if (!this.canEdit()) return;
    this.pending.update(ops => [...ops, op]);
    void this.flush();
  }
  async flush(): Promise<void> {
    if (this.sending() || !this.alive || this.syncError()) return;
    this.sending.set(true);
    try {
      while (this.pending().length && this.alive) {
        const batch = this.pending().slice(0, 20);
        const result = await firstValueFrom(this.api.change(this.id, batch));
        if (!this.alive) return;
        // A slow read started before this mutation must never replace this newer version.
        if (result.revision >= (this.room()?.revision ?? -1)) {
          this.base.set(result.board);
          this.room.update(room => room ? { ...room, revision: result.revision } : room);
        }
        this.pending.update(ops => ops.slice(batch.length));
        this.connectionLost.set(false);
      }
    } catch (e) {
      if (this.alive) this.syncError.set(liveErrorMessage(e, 'La conexión se interrumpió. Tus cambios siguen en este navegador. Reintenta para guardarlos.'));
    } finally { this.sending.set(false); }
  }
  retry(): void { this.syncError.set(''); void this.flush(); }
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
    if (action === 'discard') { this.pending.set([]); this.syncError.set(''); await this.refresh(true); return; }
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
    this.queue({ id: newId(), type: 'page-add', pageId: newId(), title: `Página ${(this.board()?.pages.length || 0) + 1}` });
  }
  background(value: string): void {
    if (this.canManage() && this.currentPage()) this.queue({ id: newId(), type: 'page-background', pageId: this.currentPage()!.id, background: value as BoardPage['background'] });
  }
  private updateRoom(result: LiveClass): void { this.room.update(room => room ? { ...room, ...result } : room); }
  private async action(fn: () => Promise<void>): Promise<void> {
    if (this.busy() || this.pending().length) return;
    this.busy.set(true); this.error.set(''); this.info.set('');
    try { await fn(); } catch (e) { if (this.alive) this.error.set(liveErrorMessage(e)); } finally { if (this.alive) this.busy.set(false); }
  }
  async setStatus(status: LiveStatus): Promise<void> { if (this.canManage()) await this.action(async () => this.updateRoom(await firstValueFrom(this.api.settings(this.id, { status })))); }
  async toggleEditing(): Promise<void> { if (this.canManage()) await this.action(async () => this.updateRoom(await firstValueFrom(this.api.settings(this.id, { allowStudentEdit: !this.room()!.allowStudentEdit })))); }
  get joinUrl(): string { return `${window.location.origin}/live/join/${this.room()?.joinCode || ''}`; }
  async share(): Promise<void> {
    const copied = await copyText(this.joinUrl);
    this.info.set(copied ? 'Enlace de invitación copiado.' : 'No se pudo copiar automáticamente. Selecciona el enlace y cópialo.');
    this.panel.set('participants');
  }
  togglePanel(panel: 'images' | 'google' | 'participants'): void {
    this.panel.update(current => current === panel ? 'none' : panel);
    if (this.panel() === 'google') void this.loadGoogleStatus();
  }
  async loadGoogleStatus(): Promise<void> {
    if (!this.alive || !this.room()?.isOwner || this.googleLoading()) return;
    this.googleLoading.set(true); this.googleError.set('');
    try {
      const status = await firstValueFrom(this.api.googleStatus());
      if (this.alive) this.google.set(status);
    } catch (e) {
      if (this.alive) this.googleError.set(liveErrorMessage(e, 'No se pudo consultar la conexión con Google.'));
    } finally { if (this.alive) this.googleLoading.set(false); }
  }
  async insertImage(file: File): Promise<void> {
    if (!this.canEdit() || this.pending().length) return;
    const invalid = validateImageFile(file);
    if (invalid) { this.error.set(invalid); return; }
    const pageId = this.currentPage()!.id;
    let url = '';
    await this.action(async () => { const result = await firstValueFrom(this.api.upload(this.id, file)); url = result.url; });
    if (!url || !this.alive || !this.canEdit()) return;
    const e: BoardElement = { id: newId(), type: 'image', x: 160, y: 100, w: 500, h: 400, color: this.color(), width: 1, url, authorId: this.user()!.id, version: 0 };
    this.queue({ id: newId(), type: 'put', pageId, expectedVersion: 0, element: e }); this.tool.set('select');
  }
  fileSelected(event: Event): void { const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = ''; if (file) void this.insertImage(file); }
  addResource(): void {
    if (!this.canEdit() || !this.resourceTitle.trim()) return;
    let url: URL;
    try { url = new URL(this.resourceUrl); if (url.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(url.hostname) || url.username || url.password) throw new Error(); }
    catch { this.error.set('Pega un enlace HTTPS de Google Drive o Google Docs.'); return; }
    const e: BoardElement = { id: newId(), type: 'link', x: 200, y: 180, w: 320, h: 100, color: '#2f6f9f', width: 1, text: this.resourceTitle.trim(), url: url.href, authorId: this.user()!.id, version: 0 };
    this.queue({ id: newId(), type: 'put', pageId: this.currentPage()!.id, expectedVersion: 0, element: e });
    this.resourceTitle = ''; this.resourceUrl = ''; this.tool.set('select');
  }
  async loadCourses(more = false): Promise<void> {
    await this.action(async () => {
      const result = await firstValueFrom(this.api.classroomCourses(more ? this.nextCoursePage() || undefined : undefined));
      this.classroomCourses.set(more ? [...this.classroomCourses(), ...result.courses] : result.courses); this.nextCoursePage.set(result.nextPageToken);
      if (!result.courses.length && !more) this.info.set('No encontramos clases activas donde tu cuenta de Google sea docente.');
    });
  }
  async linkClassroom(): Promise<void> {
    if (this.classroomId) await this.action(async () => { this.updateRoom(await firstValueFrom(this.api.linkClassroom(this.id, this.classroomId))); this.info.set('Clase de Classroom vinculada.'); });
  }
  async announce(): Promise<void> {
    await this.action(async () => { this.updateRoom(await firstValueFrom(this.api.announce(this.id))); this.info.set('Invitación publicada en Classroom.'); });
  }
  async saveDrive(): Promise<void> {
    await this.action(async () => { this.updateRoom(await firstValueFrom(this.api.saveDrive(this.id))); this.info.set('Pizarra editable guardada en tu Google Drive.'); });
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
    await this.action(async () => { const result = await firstValueFrom(this.api.restore(this.id, file.id, revision)); this.updateRoom(result); if (result.board) this.base.set(result.board); this.info.set('Pizarra restaurada desde Drive.'); });
  }
  download(): void {
    const board = this.board(); if (!board) return;
    downloadBlob(new Blob([JSON.stringify({ format: 'spanishnow-live-board', version: 1, title: this.room()?.title, board }, null, 2)], { type: 'application/json' }), 'pizarra.spanishnow.json');
  }
  async exportPng(): Promise<void> {
    const svg = this.element.nativeElement.querySelector<SVGSVGElement>('svg.live-canvas');
    if (!svg) return;
    await this.action(async () => { const blob = await exportPagePng(svg); downloadBlob(blob, 'pizarra.png'); });
  }
}
