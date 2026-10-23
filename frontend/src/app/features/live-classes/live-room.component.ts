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
import { IMAGE_ACCEPT, imageFileErrorKey } from '../teacher/lesson-composer/image-file';
import { LiveBoardComponent } from './board/live-board.component';
import { BoardPreviewComponent } from './board/board-preview.component';
import { newId, previewBoard } from './board/board.logic';
import { downloadBlob, exportPagePng } from './board/board.export';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { LiveNotice, noticeError, noticeKey, noticeText, liveStatusText } from './live-notice';

type Confirmation = 'clear' | 'delete-page' | 'restore' | 'end' | 'discard';
@Component({
  selector: 'app-live-room', standalone: true,
  imports: [FormsModule, RouterLink, NgbDropdownModule, IconComponent, ImageSearchComponent, ConfirmDialogComponent, LiveBoardComponent, BoardPreviewComponent, TranslatePipe],
  templateUrl: './live-room.component.html', styleUrls: ['./live-room.component.scss', './live-room-controls.scss']
})
export class LiveRoomComponent implements OnInit, OnDestroy {
  private api = inject(LiveClassService);
  readonly i18n = inject(I18nService);
  private route = inject(ActivatedRoute);
  private element: ElementRef<HTMLElement> = inject(ElementRef);
  readonly user = inject(AuthService).currentUser;
  readonly id = Number(this.route.snapshot.paramMap.get('id'));
  room = signal<LiveSnapshot | null>(null);
  private base = signal<LiveBoard | null>(null);
  pending = signal<BoardOperation[]>([]);
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
  hand = signal(false);
  zoom = signal(50);
  viewportWidth = signal(1000);
  viewportHeight = signal(700);
  framesOpen = signal(true);
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
  readonly imageAccept = IMAGE_ACCEPT;
  readonly statusLabel = (status: string) => liveStatusText(this.i18n, status);
  readonly palette = [{ color: '#2b2b2b', nameKey: 'black' }, { color: '#c94a14', nameKey: 'orange' }, { color: '#b3372f', nameKey: 'red' }, { color: '#2f7d4f', nameKey: 'green' }, { color: '#2f6f9f', nameKey: 'blue' }, { color: '#8b5e9e', nameKey: 'violet' }].map(c => ({ ...c, nameKey: `liveBoard.room.color.${c.nameKey}` }));
  readonly strokeSizes = [{ value: 2, labelKey: 'liveBoard.room.stroke.thin' }, { value: 4, labelKey: 'liveBoard.room.stroke.medium' }, { value: 8, labelKey: 'liveBoard.room.stroke.thick' }, { value: 16, labelKey: 'liveBoard.room.stroke.extra' }];
  readonly tools: { id: BoardTool; labelKey: string; icon: string }[] = ([
    ['select', 'move'], ['pen', 'pencil'], ['line', 'line'], ['rect', 'rectangle'], ['ellipse', 'ellipse'], ['note', 'sticky-note'], ['text', 'type'], ['eraser', 'eraser']
  ] as [BoardTool, string][]).map(([id, icon]) => ({ id, icon, labelKey: `liveBoard.room.tool.${id}` }));
  readonly backgrounds: { id: BoardPage['background']; nameKey: string }[] = (['plain', 'dots', 'grid', 'lines'] as const).map(id => ({ id, nameKey: `liveBoard.room.bg.${id}` }));
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
      if (!this.room()) this.errorNotice.set(noticeError(e, 'liveBoard.error.openClass'));
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
    if (this.sending() || !this.alive || this.syncFailure()) return;
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
      if (this.alive) this.syncFailure.set(noticeError(e, 'liveBoard.error.syncInterrupted'));
    } finally { this.sending.set(false); }
  }
  dismissInfo(): void { this.infoNotice.set(null); }
  retry(): void { this.syncFailure.set(null); void this.flush(); }
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
    if (action === 'discard') { this.pending.set([]); this.syncFailure.set(null); await this.refresh(true); return; }
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
    this.queue({ id: newId(), type: 'page-add', pageId: newId(), title: this.i18n.t('liveBoard.room.defaultPageTitle', { number: (this.board()?.pages.length || 0) + 1 }) });
  }
  background(value: string): void {
    if (this.canManage() && this.currentPage()) this.queue({ id: newId(), type: 'page-background', pageId: this.currentPage()!.id, background: value as BoardPage['background'] });
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
  fileSelected(event: Event): void { const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = ''; if (file) void this.insertImage(file); }
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
    await this.action(async () => { const blob = await exportPagePng(svg); downloadBlob(blob, this.i18n.t('liveBoard.export.pngFile')); }, 'liveBoard.error.exportFailed');
  }
}
