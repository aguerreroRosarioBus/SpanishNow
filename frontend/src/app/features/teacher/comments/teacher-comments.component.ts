import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CommentService } from '../../../core/services/comment.service';
import { CommentBadgeService } from '../../../core/services/comment-badge.service';
import { CourseService } from '../../../core/services/course.service';
import { ToastService } from '../../../core/services/toast.service';
import { Course } from '../../../core/models/course.model';
import { InboxComment } from '../../../core/models/community.model';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { COMMENT_MAX_LENGTH } from '../../../shared/components/lesson-comments/lesson-comments.component';
import { unitDisplayTitle } from '../../../shared/utils/unit-title';

const PAGE_SIZE = 20;

/** Bandeja de comentarios de las lecciones: «Sin responder» o todos, por curso; responder en línea, ocultar y borrar. */
@Component({
  selector: 'app-teacher-comments',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './teacher-comments.component.html',
  styleUrl: './teacher-comments.component.scss'
})
export class TeacherCommentsComponent implements OnInit {
  private api = inject(CommentService);
  private badge = inject(CommentBadgeService);
  private courseService = inject(CourseService);
  private toast = inject(ToastService);

  readonly maxLength = COMMENT_MAX_LENGTH;
  readonly unitTitle = unitDisplayTitle;

  courses = signal<Course[]>([]);
  rows = signal<InboxComment[]>([]);
  total = signal(0);
  page = signal(1);
  status = signal<'unanswered' | 'all'>('unanswered');
  courseId = signal<number | null>(null);
  isLoading = signal(true);
  errorMessage = signal('');
  pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  replyingTo = signal<number | null>(null);
  replyDraft = signal('');
  isSending = signal(false);
  replyError = signal('');
  toDelete = signal<InboxComment | null>(null);

  ngOnInit(): void {
    this.courseService.getCourses().subscribe({ next: list => this.courses.set(list), error: () => { /* el filtro por curso queda vacío */ } });
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.api.inbox(this.status(), this.courseId(), this.page()).subscribe({
      next: ({ rows, total }) => {
        this.rows.set(rows);
        this.total.set(total);
        this.isLoading.set(false);
        // Sin filtro de curso, el total «sin responder» es el del badge del menú
        if (this.status() === 'unanswered' && !this.courseId()) this.badge.set(total);
      },
      error: () => { this.errorMessage.set('No se pudieron cargar los comentarios.'); this.isLoading.set(false); }
    });
  }

  setStatus(status: 'unanswered' | 'all'): void { this.status.set(status); this.page.set(1); this.load(); }
  setCourse(value: string): void { this.courseId.set(value ? +value : null); this.page.set(1); this.load(); }
  goTo(page: number): void {
    if (page < 1 || page > this.pageCount() || page === this.page()) return;
    this.page.set(page);
    this.load();
  }

  // ===== Responder =====

  startReply(c: InboxComment): void { this.replyingTo.set(c.id); this.replyDraft.set(''); this.replyError.set(''); }
  cancelReply(): void { this.replyingTo.set(null); }

  validReply(): boolean { const t = this.replyDraft().trim(); return t.length > 0 && t.length <= this.maxLength; }

  sendReply(c: InboxComment): void {
    if (!this.validReply() || this.isSending()) return;
    this.isSending.set(true);
    this.replyError.set('');
    this.api.create(c.story.id, this.replyDraft().trim(), c.id).subscribe({
      next: () => {
        this.isSending.set(false);
        this.replyingTo.set(null);
        this.toast.success('Respuesta publicada');
        this.badge.refresh(true);
        this.load();
      },
      error: err => {
        this.isSending.set(false);
        this.replyError.set(err?.status === 429 ? 'Llegaste al límite de comentarios por hora. Prueba más tarde.' : (err?.error?.error || 'No se pudo publicar la respuesta.'));
      }
    });
  }

  // ===== Ocultar y borrar =====

  toggleHidden(c: InboxComment): void {
    const hidden = !c.hidden;
    this.api.setHidden(c.id, hidden).subscribe({
      next: () => { this.rows.update(list => list.map(r => r.id === c.id ? { ...r, hidden } : r)); this.toast.success(hidden ? 'Comentario oculto' : 'Comentario visible'); },
      error: err => this.toast.error(err?.error?.error || 'No se pudo cambiar la visibilidad del comentario')
    });
  }

  askDelete(c: InboxComment): void { this.toDelete.set(c); }
  cancelDelete(): void { this.toDelete.set(null); }
  confirmDelete(): void {
    const c = this.toDelete();
    this.toDelete.set(null);
    if (!c) return;
    this.api.remove(c.id).subscribe({
      next: () => { this.toast.success('Comentario eliminado'); this.badge.refresh(true); this.load(); },
      error: err => this.toast.error(err?.error?.error || 'No se pudo eliminar el comentario')
    });
  }
}
