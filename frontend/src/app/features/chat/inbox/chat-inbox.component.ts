import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ChatService } from '../../../core/services/chat.service';
import { ChatBadgeService } from '../../../core/services/chat-badge.service';
import { AvailableTeacher, Conversation } from '../../../core/models/chat.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ChatFormat } from '../chat-format';

/** Bandeja del chat (CHAT-03): contraparte, contexto, último mensaje, fecha local y no leídos. El alumno inicia consultas. */
@Component({
  selector: 'app-chat-inbox',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, TranslatePipe],
  templateUrl: './chat-inbox.component.html',
  styleUrl: './chat-inbox.component.scss'
})
export class ChatInboxComponent implements OnInit {
  private api = inject(ChatService);
  private badge = inject(ChatBadgeService);
  private router = inject(Router);
  private auth = inject(AuthService);
  private i18n = inject(I18nService);
  readonly fmt = inject(ChatFormat);

  isStudent = computed(() => this.auth.currentUser()?.role === 'student');
  items = signal<Conversation[]>([]);
  nextCursor = signal<string | null>(null);
  isLoading = signal(true);
  isLoadingMore = signal(false);
  errorMessage = signal('');

  teachers = signal<AvailableTeacher[]>([]);
  teachersLoaded = signal(false);
  selectedTeacher = signal<number | null>(null);
  isStarting = signal(false);
  startError = signal('');

  ngOnInit(): void {
    this.load();
    if (this.isStudent()) {
      this.api.availableTeachers().subscribe({
        next: list => { this.teachers.set(list); this.teachersLoaded.set(true); },
        error: () => this.teachersLoaded.set(true)
      });
    }
  }

  load(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.api.list().subscribe({
      next: page => {
        this.items.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.isLoading.set(false);
        this.badge.refresh();
      },
      error: err => { this.errorMessage.set(this.fmt.error(err)); this.isLoading.set(false); }
    });
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.isLoadingMore()) return;
    this.isLoadingMore.set(true);
    this.api.list(cursor).subscribe({
      next: page => {
        const known = new Set(this.items().map(c => c.id));
        this.items.update(list => [...list, ...page.items.filter(c => !known.has(c.id))]);
        this.nextCursor.set(page.nextCursor);
        this.isLoadingMore.set(false);
      },
      error: err => { this.errorMessage.set(this.fmt.error(err)); this.isLoadingMore.set(false); }
    });
  }

  start(): void {
    const teacherId = this.selectedTeacher();
    if (!teacherId || this.isStarting()) return;
    this.isStarting.set(true);
    this.startError.set('');
    this.api.start(teacherId).subscribe({
      next: conversation => { this.isStarting.set(false); this.router.navigate(['/messages', conversation.id]); },
      error: err => { this.startError.set(this.fmt.error(err)); this.isStarting.set(false); }
    });
  }

  contextLabel(c: Conversation): string | null {
    const ctx = c.context;
    if (!ctx) return null;
    if (ctx.type === 'session') return this.i18n.t('chat.conv.context.session');
    if (!ctx.title) return null;
    return this.i18n.t(`chat.conv.context.${ctx.type}`, { title: ctx.title[this.i18n.locale()] || ctx.title.es });
  }

  preview(c: Conversation): string {
    const last = c.lastMessage;
    if (!last) return this.i18n.t('chat.inbox.noMessages');
    if (last.hidden) return this.i18n.t('chat.preview.hidden');
    if (last.type !== 'text') return this.i18n.t(`chat.preview.${last.type}`);
    return (last.senderIsMe ? this.i18n.t('chat.inbox.you') : '') + (last.preview ?? '');
  }
}
