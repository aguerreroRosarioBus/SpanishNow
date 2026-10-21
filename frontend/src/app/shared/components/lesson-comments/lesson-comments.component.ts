import { Component, ElementRef, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { CommentService } from '../../../core/services/comment.service';
import { LessonComment } from '../../../core/models/community.model';
import { ToastService } from '../../../core/services/toast.service';
import { IconComponent } from '../icon/icon.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { availableOnLabel, contentLockedFrom } from '../../utils/release-date';

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
  imports: [DatePipe, NgTemplateOutlet, IconComponent, ConfirmDialogComponent],
  templateUrl: './lesson-comments.component.html',
  styleUrl: './lesson-comments.component.scss'
})
export class LessonCommentsComponent {
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
  error = signal('');
  /** 403 content_locked: mensaje «Disponible el …» en lugar de error genérico. */
  lockedMessage = signal('');

  draft = signal('');
  posting = signal(false);
  postError = signal('');

  replyingTo = signal<number | null>(null);
  replyDraft = signal('');
  editingId = signal<number | null>(null);
  editDraft = signal('');
  busy = signal(false);
  actionError = signal('');
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
    this.error.set('');
    this.lockedMessage.set('');
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
        this.handleError(error, 'No se pudieron cargar los comentarios.', message => this.error.set(message));
      }
    });
  }

  private scrollIfRequested(): void {
    if (!this.autoScroll() || this.scrolledFor === this.storyId()) return;
    this.scrolledFor = this.storyId();
    setTimeout(() => this.host.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  }

  /** Aplica el mismo tratamiento a todos los errores: bloqueo por fecha, límite por hora o mensaje del servidor. */
  private handleError(error: any, fallback: string, show: (message: string) => void): void {
    const locked = contentLockedFrom(error);
    if (locked) { this.lockedMessage.set(availableOnLabel(locked.availableAt)); return; }
    if (error?.status === 429 || error?.error?.code === 'rate_limited') {
      show('Publicaste muchos comentarios en poco tiempo (el máximo es 10 por hora). Prueba de nuevo más tarde.');
      return;
    }
    show(error?.error?.error || fallback);
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
    this.actionError.set('');
    this.editingId.set(null);
  }
  cancelReply(): void { this.replyingTo.set(null); }
  sendReply(parent: LessonComment): void { this.send(this.replyDraft(), parent.id, () => { this.replyDraft.set(''); this.replyingTo.set(null); }); }

  private send(text: string, parentId: number | undefined, done: () => void): void {
    const body = text.trim();
    if (!this.valid(body) || this.posting()) return;
    this.posting.set(true);
    this.postError.set('');
    this.actionError.set('');
    this.api.create(this.storyId(), body, parentId).subscribe({
      next: () => { this.posting.set(false); done(); this.toast.success(parentId ? 'Respuesta publicada' : 'Comentario publicado'); this.reload(); },
      error: error => {
        this.posting.set(false);
        this.handleError(error, 'No se pudo publicar. Intentá de nuevo.', message => parentId ? this.actionError.set(message) : this.postError.set(message));
      }
    });
  }

  // ===== Editar y borrar =====

  startEdit(c: LessonComment): void {
    this.editingId.set(c.id);
    this.editDraft.set(c.body);
    this.actionError.set('');
    this.replyingTo.set(null);
  }
  cancelEdit(): void { this.editingId.set(null); }

  saveEdit(c: LessonComment): void {
    const body = this.editDraft().trim();
    if (!this.valid(body) || this.busy()) return;
    this.busy.set(true);
    this.actionError.set('');
    this.api.update(c.id, body).subscribe({
      next: () => { this.busy.set(false); this.editingId.set(null); this.toast.success('Comentario actualizado'); this.reload(); },
      error: error => { this.busy.set(false); this.handleError(error, 'No se pudo guardar el cambio.', m => this.actionError.set(m)); }
    });
  }

  askDelete(c: LessonComment): void { this.toDelete.set(c); }
  cancelDelete(): void { this.toDelete.set(null); }
  confirmDelete(): void {
    const c = this.toDelete();
    this.toDelete.set(null);
    if (!c) return;
    this.api.remove(c.id).subscribe({
      next: () => { this.toast.success('Comentario eliminado'); this.reload(); },
      error: error => this.handleError(error, 'No se pudo eliminar el comentario.', m => this.toast.error(m))
    });
  }

  onInput(event: Event, set: (value: string) => void): void { set((event.target as HTMLTextAreaElement).value); }
}
