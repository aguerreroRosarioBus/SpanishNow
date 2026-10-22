import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DOCUMENT, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ChatService } from '../../../core/services/chat.service';
import { ChatBadgeService } from '../../../core/services/chat-badge.service';
import { CHAT_MAX_LENGTH, ChatMessage, Conversation, PendingMessage } from '../../../core/models/chat.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ChatText, ChatTextPipe } from '../chat-text';
import { CHAT_I18N } from '../chat.i18n';

const POLL_MS = 5_000;
const IDLE_POLL_MS = 20_000;
const IDLE_AFTER = 6; // consultas seguidas sin novedades antes de espaciar el polling
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;

export interface TextSegment { text: string; href: string | null }

/** Corta un texto plano en partes y enlaces http(s) (CHAT-05). Nunca interpreta HTML; el servidor no abre enlaces. */
export function linkSegments(body: string): TextSegment[] {
  const parts: TextSegment[] = [];
  let last = 0;
  for (const match of body.matchAll(URL_PATTERN)) {
    // Puntuación final («mirá https://x.com.») no es parte del enlace.
    const url = match[0].replace(/[.,;:!?)\]]+$/, '');
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: body.slice(last, start), href: null });
    parts.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < body.length) parts.push({ text: body.slice(last), href: null });
  return parts;
}

const newClientMessageId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`).replace(/[^A-Za-z0-9_-]/g, '');

/**
 * Conversación (CHAT-03/06): historial por seq, carga de anteriores, polling de nuevos solo con la pestaña visible,
 * envío con estados enviando/enviado/falló y reintento con el mismo clientMessageId (no duplica), bloqueo y reporte.
 */
@Component({
  selector: 'app-chat-conversation',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, IconComponent, ConfirmDialogComponent, ChatTextPipe],
  templateUrl: './chat-conversation.component.html',
  styleUrl: './chat-conversation.component.scss'
})
export class ChatConversationComponent implements OnInit {
  private api = inject(ChatService);
  private badge = inject(ChatBadgeService);
  private route = inject(ActivatedRoute);
  private document = inject(DOCUMENT);
  private destroyRef = inject(DestroyRef);
  readonly text = inject(ChatText);
  readonly maxLength = CHAT_MAX_LENGTH;
  readonly segments = linkSegments;

  private scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  conversationId = 0;
  conversation = signal<Conversation | null>(null);
  messages = signal<ChatMessage[]>([]);
  pending = signal<PendingMessage[]>([]);
  hasOlder = signal(false);
  isLoading = signal(true);
  isLoadingOlder = signal(false);
  notFound = signal(false);
  errorMessage = signal('');
  draft = signal('');
  showBlock = signal(false);
  showReport = signal(false);
  reportReason = signal('');
  reportError = signal('');
  isActing = signal(false);

  lastSeq = computed(() => { const list = this.messages(); return list.length ? list[list.length - 1].seq : 0; });
  remaining = computed(() => this.maxLength - [...this.draft()].length);
  canSend = computed(() => this.draft().trim().length > 0 && this.remaining() >= 0 && !this.isBlocked());
  isBlocked = computed(() => { const c = this.conversation(); return !!c && (c.blockedByMe || c.blockedByOther); });
  /** El último mensaje propio confirmado muestra «Enviado» (nunca «leído», CHAT-06). */
  lastMineSeq = computed(() => { const mine = this.messages().filter(m => m.mine); return mine.length ? mine[mine.length - 1].seq : null; });
  waitingReply = computed(() => { const c = this.conversation(); return !!c && c.role === 'student' && !c.teacherReplied; });

  private timer: ReturnType<typeof setTimeout> | null = null;
  private idlePolls = 0;
  private readSent = 0;
  private polling = false;
  private onVisibility = () => {
    if (this.document.visibilityState === 'visible') { this.idlePolls = 0; this.schedule(0); } else this.clearTimer();
  };

  ngOnInit(): void {
    this.document.addEventListener('visibilitychange', this.onVisibility);
    this.destroyRef.onDestroy(() => { this.clearTimer(); this.document.removeEventListener('visibilitychange', this.onVisibility); });
    this.route.paramMap.subscribe(params => this.open(Number(params.get('id'))));
  }

  private open(id: number): void {
    this.clearTimer();
    this.conversationId = id;
    this.conversation.set(null);
    this.messages.set([]);
    this.pending.set([]);
    this.readSent = 0;
    this.notFound.set(false);
    this.errorMessage.set('');
    this.isLoading.set(true);
    this.api.get(id).subscribe({
      next: conversation => {
        this.conversation.set(conversation);
        this.readSent = conversation.lastReadSeq;
        this.api.messages(id).subscribe({
          next: page => {
            this.messages.set(page.items);
            this.hasOlder.set(page.hasMore);
            this.isLoading.set(false);
            this.scrollToBottom();
            this.markRead();
            this.schedule(POLL_MS);
          },
          error: err => this.fail(err)
        });
      },
      error: err => this.fail(err)
    });
  }

  private fail(err: unknown): void {
    this.isLoading.set(false);
    if (err instanceof HttpErrorResponse && err.status === 404 && err.error?.code === 'not_found') this.notFound.set(true);
    else this.errorMessage.set(this.text.error(err));
  }

  reload(): void { this.open(this.conversationId); }

  loadOlder(): void {
    const first = this.messages()[0];
    if (!first || this.isLoadingOlder()) return;
    this.isLoadingOlder.set(true);
    const el = this.scroller()?.nativeElement;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    this.api.messages(this.conversationId, { beforeSeq: first.seq }).subscribe({
      next: page => {
        this.merge(page.items);
        this.hasOlder.set(page.hasMore);
        this.isLoadingOlder.set(false);
        // Mantener a la vista lo que se estaba leyendo.
        setTimeout(() => { if (el) el.scrollTop = el.scrollHeight - fromBottom; });
      },
      error: err => { this.isLoadingOlder.set(false); this.errorMessage.set(this.text.error(err)); }
    });
  }

  /** Une por seq (orden del servidor) sin duplicar; un mensaje repetido por polling y envío queda una sola vez. */
  private merge(items: ChatMessage[]): void {
    if (!items.length) return;
    const bySeq = new Map(this.messages().map(m => [m.seq, m]));
    for (const m of items) bySeq.set(m.seq, m);
    this.messages.set([...bySeq.values()].sort((a, b) => a.seq - b.seq));
  }

  private schedule(ms: number): void {
    this.clearTimer();
    if (this.notFound() || this.document.visibilityState !== 'visible') return;
    this.timer = setTimeout(() => this.poll(), ms);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private poll(): void {
    if (this.polling) return;
    this.polling = true;
    const id = this.conversationId;
    this.api.messages(id, { afterSeq: this.lastSeq() }, 100).subscribe({
      next: page => {
        this.polling = false;
        if (id !== this.conversationId) return;
        const nearBottom = this.isNearBottom();
        this.merge(page.items);
        this.idlePolls = page.items.length ? 0 : this.idlePolls + 1;
        if (page.items.length) {
          if (nearBottom) this.scrollToBottom();
          this.markRead();
          // Bloqueos o respuestas del otro lado cambian el estado de la conversación.
          this.api.get(id).subscribe({ next: c => this.conversation.set(c), error: () => { /* se reintenta en la próxima */ } });
        }
        this.schedule(page.hasMore ? 0 : this.idlePolls >= IDLE_AFTER ? IDLE_POLL_MS : POLL_MS);
      },
      error: () => { this.polling = false; this.schedule(IDLE_POLL_MS); }
    });
  }

  /** Avanza el cursor de lectura al último mensaje visto, solo con la pestaña visible (CHAT-10). */
  private markRead(): void {
    const seq = this.lastSeq();
    if (seq <= this.readSent || this.document.visibilityState !== 'visible') return;
    this.readSent = seq;
    this.api.markRead(this.conversationId, seq).subscribe({ next: () => this.badge.refresh(), error: () => { this.readSent = 0; } });
  }

  send(): void {
    if (!this.canSend()) return;
    const message: PendingMessage = { clientMessageId: newClientMessageId(), body: this.draft(), status: 'sending', errorKey: null, final: false };
    this.pending.update(list => [...list, message]);
    this.draft.set('');
    this.scrollToBottom();
    this.deliver(message);
  }

  retry(message: PendingMessage): void { this.deliver(message); }

  discard(message: PendingMessage): void {
    this.pending.update(list => list.filter(p => p.clientMessageId !== message.clientMessageId));
  }

  private deliver(message: PendingMessage): void {
    this.updatePending(message.clientMessageId, { status: 'sending', errorKey: null });
    this.api.send(this.conversationId, message.clientMessageId, message.body).subscribe({
      next: stored => {
        this.discard(message);
        this.merge([stored]);
        this.scrollToBottom();
      },
      error: (err: HttpErrorResponse) => {
        const code = err.error?.code as string | undefined;
        const final = err.status === 400 || code === 'conversation_blocked' || code === 'operation_key_conflict' || err.status === 404;
        this.updatePending(message.clientMessageId, { status: 'failed', errorKey: this.text.error(err), final });
        if (code === 'conversation_blocked') this.api.get(this.conversationId).subscribe({ next: c => this.conversation.set(c), error: () => { /* sin cambios */ } });
      }
    });
  }

  private updatePending(clientMessageId: string, changes: Partial<PendingMessage>): void {
    this.pending.update(list => list.map(p => (p.clientMessageId === clientMessageId ? { ...p, ...changes } : p)));
  }

  onKeydown(event: KeyboardEvent): void {
    // Enter envía; Shift+Enter agrega un salto de línea.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.send();
    }
  }

  confirmBlock(): void {
    this.showBlock.set(false);
    this.act(this.api.block(this.conversationId));
  }

  unblock(): void { this.act(this.api.unblock(this.conversationId)); }

  submitReport(): void {
    const reason = this.reportReason().trim();
    if (!reason) return;
    this.reportError.set('');
    this.isActing.set(true);
    this.api.report(this.conversationId, reason).subscribe({
      next: c => { this.conversation.set(c); this.isActing.set(false); this.showReport.set(false); this.reportReason.set(''); },
      error: err => { this.isActing.set(false); this.reportError.set(this.text.error(err)); }
    });
  }

  private act(request: ReturnType<ChatService['block']>): void {
    this.isActing.set(true);
    request.subscribe({
      next: c => { this.conversation.set(c); this.isActing.set(false); },
      error: err => { this.isActing.set(false); this.errorMessage.set(this.text.error(err)); }
    });
  }

  eventText(m: ChatMessage): string {
    const key = `chat.event.${m.eventCode}`;
    return Object.hasOwn(CHAT_I18N.es, key) ? this.text.t(key) : this.text.t('chat.event.generic');
  }

  contextLabel(): string | null {
    const ctx = this.conversation()?.context;
    if (!ctx) return null;
    if (ctx.type === 'session') return this.text.t('chat.conv.context.session');
    return ctx.title ? this.text.t(`chat.conv.context.${ctx.type}`, { title: ctx.title[this.text.locale] || ctx.title.es }) : null;
  }

  private isNearBottom(): boolean {
    const el = this.scroller()?.nativeElement;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  private scrollToBottom(): void {
    setTimeout(() => { const el = this.scroller()?.nativeElement; if (el) el.scrollTop = el.scrollHeight; });
  }
}
