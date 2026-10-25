import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { UserPreferencesService } from '../../../core/services/user-preferences.service';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
  imports: [NgbDropdownModule, TranslatePipe, FormsModule, RouterLink, ConfirmDialogComponent],
  templateUrl: './teacher-comments.component.html',
  styleUrl: './teacher-comments.component.scss'
})
export class TeacherCommentsComponent implements OnInit {
  i18n = inject(I18nService);
  private preferences = inject(UserPreferencesService);
  date(value: string): string { return this.i18n.formatInstant(value, this.preferences.preferences()?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', {dateStyle: 'medium', timeStyle: 'short'}); }
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
  private errorMessageFailure = signal<{key: string; error?: unknown} | null>(null);
  errorMessage = computed(() => { const f = this.errorMessageFailure(); return f ? this.i18n.errorMessage(f.error, f.key) : ''; });
  pageCount = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  replyingTo = signal<number | null>(null);
  replyDraft = signal('');
  isSending = signal(false);
  private replyErrorFailure = signal<{key: string; error?: unknown} | null>(null);
  replyError = computed(() => { const f = this.replyErrorFailure(); return f ? this.i18n.errorMessage(f.error, f.key) : ''; });
  toDelete = signal<InboxComment | null>(null);

  ngOnInit(): void {
    this.courseService.getCourses().subscribe({ next: list => this.courses.set(list), error: () => { /* el filtro por curso queda vacío */ } });
    this.load();
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessageFailure.set(null);
    this.api.inbox(this.status(), this.courseId(), this.page()).subscribe({
      next: ({ rows, total }) => {
        this.rows.set(rows);
        this.total.set(total);
        this.isLoading.set(false);
        // Sin filtro de curso, el total «sin responder» es el del badge del menú
        if (this.status() === 'unanswered' && !this.courseId()) this.badge.set(total);
      },
      error: error => { this.errorMessageFailure.set({key: 'lessonComments.loadError', error}); this.isLoading.set(false); }
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

  startReply(c: InboxComment): void { this.replyingTo.set(c.id); this.replyDraft.set(''); this.replyErrorFailure.set(null); }
  cancelReply(): void { this.replyingTo.set(null); }

  validReply(): boolean { const t = this.replyDraft().trim(); return t.length > 0 && t.length <= this.maxLength; }

  sendReply(c: InboxComment): void {
    if (!this.validReply() || this.isSending()) return;
    this.isSending.set(true);
    this.replyErrorFailure.set(null);
    this.api.create(c.story.id, this.replyDraft().trim(), c.id).subscribe({
      next: () => {
        this.isSending.set(false);
        this.replyingTo.set(null);
        this.toast.success(this.i18n.t('lessonComments.replyPosted'));
        this.badge.refresh(true);
        this.load();
      },
      error: err => {
        this.isSending.set(false);
        this.replyErrorFailure.set({key: err?.status === 429 ? 'lessonComments.rateLimit' : 'lessonComments.replyError', error: err});
      }
    });
  }

  // ===== Ocultar y borrar =====

  toggleHidden(c: InboxComment): void {
    const hidden = !c.hidden;
    this.api.setHidden(c.id, hidden).subscribe({
      next: () => { this.rows.update(list => list.map(r => r.id === c.id ? { ...r, hidden } : r)); this.toast.success(this.i18n.t(hidden ? 'lessonComments.hiddenToast' : 'lessonComments.visibleToast')); },
      error: err => this.toast.error(this.i18n.errorMessage(err, 'lessonComments.visibilityError'))
    });
  }

  askDelete(c: InboxComment): void { this.toDelete.set(c); }
  cancelDelete(): void { this.toDelete.set(null); }
  confirmDelete(): void {
    const c = this.toDelete();
    this.toDelete.set(null);
    if (!c) return;
    this.api.remove(c.id).subscribe({
      next: () => { this.toast.success(this.i18n.t('lessonComments.deleted')); this.badge.refresh(true); this.load(); },
      error: err => this.toast.error(this.i18n.errorMessage(err, 'lessonComments.deleteError'))
    });
  }
}
