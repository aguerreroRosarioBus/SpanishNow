import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, ElementRef, effect, inject, input, computed, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CommentService } from '../../../core/services/comment.service';
import { LessonComment } from '../../../core/models/community.model';
import { ToastService } from '../../../core/services/toast.service';
import { IconComponent } from '../icon/icon.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { contentLockedFrom } from '../../utils/release-date';

export const COMMENT_MAX_LENGTH = 2000;
const PAGE_SIZE = 20;

/**
 * «Preguntas y comentarios» de una lección: un nivel (comentario + respuestas).
 * El texto de los comentarios es de otros usuarios: se muestra SIEMPRE como texto plano
 * (interpolación, nunca innerHTML) y los saltos de línea se respetan con CSS (white-space: pre-wrap).
 */
@Component({
  selector: 'app-lesson-comments',
  standalone: true,
  imports: [TranslatePipe, NgTemplateOutlet, IconComponent, ConfirmDialogComponent],
  templateUrl: './lesson-comments.component.html',
  styleUrl: './lesson-comments.component.scss'
})
export class LessonCommentsComponent {
  i18n = inject(I18nService);
  private preferences = inject(UserPreferencesService);
  date(value: string, options: Intl.DateTimeFormatOptions = {dateStyle: 'medium', timeStyle: 'short'}): string { return this.i18n.formatInstant(value, this.preferences.preferences()?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', options); }
  private api = inject(CommentService);
  private toast = inject(ToastService);

  storyId = input.required<number>();
  /** Baja hasta esta sección cuando termina de cargar (link del email). */
  autoScroll = input(false);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private scrolledFor: number | null = null;

  readonly maxLength = COMMENT_MAX_LENGTH;
  comments = signal<LessonComment[]>([]);
  total = signal(0);
  page = signal(1);
  loading = signal(false);
  loadingMore = signal(false);
  private errorFailure = signal<{key: string; error?: unknown} | null>(null);
  error = computed(() => { const f = this.errorFailure(); return f ? (f.error ? this.i18n.errorMessage(f.error, f.key) : this.i18n.t(f.key)) : ''; });
  /** 403 content_locked: mensaje «Disponible el …» en lugar de error genérico. */
  private lockedAt = signal<string | null | undefined>(undefined);
  lockedMessage = computed(() => this.lockedAt() === undefined ? '' : this.lockedAt() ? this.i18n.t('lessonComments.availableOn', {date: this.date(this.lockedAt()!, {dateStyle: 'long'})}) : this.i18n.t('lessonComments.soon'));

  draft = signal('');
  posting = signal(false);
  private postErrorFailure = signal<{key: string; error?: unknown} | null>(null);
  postError = computed(() => { const f = this.postErrorFailure(); return f ? (f.error ? this.i18n.errorMessage(f.error, f.key) : this.i18n.t(f.key)) : ''; });

  replyingTo = signal<number | null>(null);
  replyDraft = signal('');
  editingId = signal<number | null>(null);
  editDraft = signal('');
  busy = signal(false);
  private actionErrorFailure = signal<{key: string; error?: unknown} | null>(null);
  actionError = computed(() => { const f = this.actionErrorFailure(); return f ? (f.error ? this.i18n.errorMessage(f.error, f.key) : this.i18n.t(f.key)) : ''; });
  toDelete = signal<LessonComment | null>(null);

  constructor() {
    effect(() => {
      const id = this.storyId();
      untracked(() => this.reset(id));
    });
  }

  private reset(storyId: number): void {
    this.comments.set([]);
    this.total.set(0);
    this.page.set(1);
    this.errorFailure.set(null);
    this.lockedAt.set(undefined);
    this.draft.set('');
    this.replyingTo.set(null);
    this.editingId.set(null);
    this.load(storyId, 1);
  }

  private load(storyId: number, page: number): void {
    if (page === 1) this.loading.set(true); else this.loadingMore.set(true);
    this.api.list(storyId, page).subscribe({
      next: ({ rows, total }) => {
        // Si el alumno cambió de lección mientras cargaba, se descarta la respuesta
        if (storyId !== this.storyId()) return;
        this.comments.update(list => page === 1 ? rows : [...list, ...rows]);
        this.total.set(total);
        this.page.set(page);
        this.loading.set(false);
        this.loadingMore.set(false);
        if (page === 1) this.scrollIfRequested();
      },
      error: error => {
        if (storyId !== this.storyId()) return;
        this.loading.set(false);
        this.loadingMore.set(false);
        this.handleError(error, 'lessonComments.loadError', message => this.errorFailure.set(message));
      }
    });
  }

  private scrollIfRequested(): void {
    if (!this.autoScroll() || this.scrolledFor === this.storyId()) return;
    this.scrolledFor = this.storyId();
    setTimeout(() => this.host.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  }

  /** Aplica el mismo tratamiento a todos los errores: bloqueo por fecha, límite por hora o mensaje del servidor. */
  private handleError(error: any, fallback: string, show: (message: {key: string; error?: unknown}) => void): void {
    const locked = contentLockedFrom(error);
    if (locked) { this.lockedAt.set(locked.availableAt); return; }
    if (error?.status === 429 || error?.error?.code === 'rate_limited') {
      show({key: 'lessonComments.rateLimit'});
      return;
    }
    show({key: fallback, error});
  }

  hasMore(): boolean { return this.comments().length < this.total(); }
  loadMore(): void { if (!this.loadingMore()) this.load(this.storyId(), this.page() + 1); }
  reload(): void { this.load(this.storyId(), 1); }

  remaining(text: string): number { return this.maxLength - text.length; }
  valid(text: string): boolean { const t = text.trim(); return t.length > 0 && t.length <= this.maxLength; }

  // ===== Publicar y responder =====

  post(): void { this.send(this.draft(), undefined, () => this.draft.set('')); }

  startReply(c: LessonComment): void {
    this.replyingTo.set(c.id);
    this.replyDraft.set('');
    this.actionErrorFailure.set(null);
    this.editingId.set(null);
  }
  cancelReply(): void { this.replyingTo.set(null); }
  sendReply(parent: LessonComment): void { this.send(this.replyDraft(), parent.id, () => { this.replyDraft.set(''); this.replyingTo.set(null); }); }

  private send(text: string, parentId: number | undefined, done: () => void): void {
    const body = text.trim();
    if (!this.valid(body) || this.posting()) return;
    this.posting.set(true);
    this.postErrorFailure.set(null);
    this.actionErrorFailure.set(null);
    this.api.create(this.storyId(), body, parentId).subscribe({
      next: () => { this.posting.set(false); done(); this.toast.success(this.i18n.t(parentId ? 'lessonComments.replyPosted' : 'lessonComments.posted')); this.reload(); },
      error: error => {
        this.posting.set(false);
        this.handleError(error, 'lessonComments.postError', message => parentId ? this.actionErrorFailure.set(message) : this.postErrorFailure.set(message));
      }
    });
  }

  // ===== Editar y borrar =====

  startEdit(c: LessonComment): void {
    this.editingId.set(c.id);
    this.editDraft.set(c.body);
    this.actionErrorFailure.set(null);
    this.replyingTo.set(null);
  }
  cancelEdit(): void { this.editingId.set(null); }

  saveEdit(c: LessonComment): void {
    const body = this.editDraft().trim();
    if (!this.valid(body) || this.busy()) return;
    this.busy.set(true);
    this.actionErrorFailure.set(null);
    this.api.update(c.id, body).subscribe({
      next: () => { this.busy.set(false); this.editingId.set(null); this.toast.success(this.i18n.t('lessonComments.updated')); this.reload(); },
      error: error => { this.busy.set(false); this.handleError(error, 'lessonComments.saveError', m => this.actionErrorFailure.set(m)); }
    });
  }

  askDelete(c: LessonComment): void { this.toDelete.set(c); }
  cancelDelete(): void { this.toDelete.set(null); }
  confirmDelete(): void {
    const c = this.toDelete();
    this.toDelete.set(null);
    if (!c) return;
    this.api.remove(c.id).subscribe({
      next: () => { this.toast.success(this.i18n.t('lessonComments.deleted')); this.reload(); },
      error: error => this.handleError(error, 'lessonComments.deleteError', m => this.toast.error(this.i18n.errorMessage(m.error, m.key)))
    });
  }

  onInput(event: Event, set: (value: string) => void): void { set((event.target as HTMLTextAreaElement).value); }
}
