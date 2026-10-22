import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, Subscription } from 'rxjs';
import { ChatService } from '../../../core/services/chat.service';
import { ChatBadgeService } from '../../../core/services/chat-badge.service';
import { CHAT_MAX_LENGTH, ChatMessage, Conversation, PendingMessage } from '../../../core/models/chat.model';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { I18nService } from '../../../core/i18n/i18n.service';
import { ChatFormat } from '../chat-format';
import { CHAT_MESSAGES } from '../chat.i18n';

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
  imports: [FormsModule, RouterLink, IconComponent, ConfirmDialogComponent, TranslatePipe],
  templateUrl: './chat-conversation.component.html',
  styleUrl: './chat-conversation.component.scss'
})
export class ChatConversationComponent implements OnInit {
  private api = inject(ChatService);
  private badge = inject(ChatBadgeService);
  private route = inject(ActivatedRoute);
  private document = inject(DOCUMENT);
  private destroyRef = inject(DestroyRef);
  private i18n = inject(I18nService);
  readonly fmt = inject(ChatFormat);
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

  /**
   * Último seq recuperado de forma contigua del servidor (carga inicial y polling). Los envíos confirmados no lo
   * mueven: entre el último poll y un envío propio puede haber mensajes ajenos que todavía no se pidieron.
   */
  private pollCursor = 0;
  /** Generación de la conversación abierta: cambia con la ruta y descarta respuestas de la anterior (CHAT-02). */
  private generation = 0;
  private requests = new Subscription();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private idlePolls = 0;
  private readSent = 0;
  private polling = false;
  private onVisibility = () => {
    if (this.document.visibilityState === 'visible') { this.idlePolls = 0; this.schedule(0); } else this.clearTimer();
  };

  ngOnInit(): void {
    this.document.addEventListener('visibilitychange', this.onVisibility);
    this.destroyRef.onDestroy(() => {
      this.clearTimer();
      this.requests.unsubscribe();
      this.document.removeEventListener('visibilitychange', this.onVisibility);
    });
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => this.open(Number(params.get('id'))));
  }

  /**
   * Suscribe en nombre de la conversación abierta. Al cambiar de ruta se cancelan las pendientes y, si alguna responde
   * igual, su resultado se descarta: nunca pisa el encabezado, el historial ni el destino de un envío de otra.
   */
  private watch<T>(source: Observable<T>, next: (value: T) => void, error: (err: unknown) => void = () => { /* sin cambios */ }): void {
    const generation = this.generation;
    this.requests.add(source.subscribe({
      next: value => { if (generation === this.generation) next(value); },
      error: err => { if (generation === this.generation) error(err); }
    }));
  }

  private open(id: number): void {
    this.clearTimer();
    this.generation++;
    this.requests.unsubscribe();
    this.requests = new Subscription();
    this.polling = false;
    this.isLoadingOlder.set(false);
    this.isActing.set(false);
    this.showBlock.set(false);
    this.showReport.set(false);
    if (id !== this.conversationId) this.draft.set(''); // un borrador nunca viaja a otra conversación
    this.conversationId = id;
    this.conversation.set(null);
    this.messages.set([]);
    this.pending.set([]);
    this.readSent = 0;
    this.pollCursor = 0;
    this.notFound.set(false);
    this.errorMessage.set('');
    this.isLoading.set(true);
    this.watch(this.api.get(id), conversation => {
      this.conversation.set(conversation);
      this.readSent = conversation.lastReadSeq;
      this.watch(this.api.messages(id), page => {
        this.messages.set(page.items);
        this.advanceCursor(page.items);
        this.hasOlder.set(page.hasMore);
        this.isLoading.set(false);
        this.scrollToBottom();
        this.markRead();
        this.schedule(POLL_MS);
      }, err => this.fail(err));
    }, err => this.fail(err));
  }

  private fail(err: unknown): void {
    this.isLoading.set(false);
    if (err instanceof HttpErrorResponse && err.status === 404 && err.error?.code === 'not_found') this.notFound.set(true);
    else this.errorMessage.set(this.fmt.error(err));
  }

  reload(): void { this.open(this.conversationId); }

  loadOlder(): void {
    const first = this.messages()[0];
    if (!first || this.isLoadingOlder()) return;
    this.isLoadingOlder.set(true);
    const el = this.scroller()?.nativeElement;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    this.watch(this.api.messages(this.conversationId, { beforeSeq: first.seq }), page => {
      this.merge(page.items);
      this.hasOlder.set(page.hasMore);
      this.isLoadingOlder.set(false);
      // Mantener a la vista lo que se estaba leyendo.
      setTimeout(() => { if (el) el.scrollTop = el.scrollHeight - fromBottom; });
    }, err => { this.isLoadingOlder.set(false); this.errorMessage.set(this.fmt.error(err)); });
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
    this.watch(this.api.messages(id, { afterSeq: this.pollCursor }, 100), page => {
        this.polling = false;
        const nearBottom = this.isNearBottom();
        this.merge(page.items);
        this.advanceCursor(page.items);
        this.idlePolls = page.items.length ? 0 : this.idlePolls + 1;
        if (page.items.length) {
          if (nearBottom) this.scrollToBottom();
          this.markRead();
          // Bloqueos o respuestas del otro lado cambian el estado de la conversación.
          this.watch(this.api.get(id), c => this.conversation.set(c));
        }
        this.schedule(page.hasMore ? 0 : this.idlePolls >= IDLE_AFTER ? IDLE_POLL_MS : POLL_MS);
    }, () => { this.polling = false; this.schedule(IDLE_POLL_MS); });
  }

  private advanceCursor(items: ChatMessage[]): void {
    for (const m of items) if (m.seq > this.pollCursor) this.pollCursor = m.seq;
  }

  /**
   * Avanza el cursor de lectura hasta lo recuperado sin huecos, solo con la pestaña visible (CHAT-10): un envío propio
   * confirmado con un seq mayor no marca como leídos mensajes ajenos que todavía no se mostraron.
   */
  private markRead(): void {
    const seq = this.pollCursor;
    if (seq <= this.readSent || this.document.visibilityState !== 'visible') return;
    this.readSent = seq;
    this.watch(this.api.markRead(this.conversationId, seq), () => this.badge.refresh(), () => { this.readSent = 0; });
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
    const id = this.conversationId;
    this.watch(this.api.send(id, message.clientMessageId, message.body), stored => {
      this.discard(message);
      this.merge([stored]);
      this.scrollToBottom();
    }, error => {
        const err = error as HttpErrorResponse;
        const code = err.error?.code as string | undefined;
        const final = err.status === 400 || code === 'conversation_blocked' || code === 'operation_key_conflict' || err.status === 404;
        this.updatePending(message.clientMessageId, { status: 'failed', errorKey: this.fmt.error(err), final });
        if (code === 'conversation_blocked') this.watch(this.api.get(id), c => this.conversation.set(c));
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
    this.watch(this.api.report(this.conversationId, reason),
      c => { this.conversation.set(c); this.isActing.set(false); this.showReport.set(false); this.reportReason.set(''); },
      err => { this.isActing.set(false); this.reportError.set(this.fmt.error(err)); });
  }

  private act(request: ReturnType<ChatService['block']>): void {
    this.isActing.set(true);
    this.watch(request, c => { this.conversation.set(c); this.isActing.set(false); },
      err => { this.isActing.set(false); this.errorMessage.set(this.fmt.error(err)); });
  }

  eventText(m: ChatMessage): string {
    const key = `chat.event.${m.eventCode}`;
    return Object.hasOwn(CHAT_MESSAGES.en, key) ? this.i18n.t(key) : this.i18n.t('chat.event.generic');
  }

  contextLabel(): string | null {
    const ctx = this.conversation()?.context;
    if (!ctx) return null;
    if (ctx.type === 'session') return this.i18n.t('chat.conv.context.session');
    return ctx.title ? this.i18n.t(`chat.conv.context.${ctx.type}`, { title: ctx.title[this.i18n.locale()] || ctx.title.es }) : null;
  }

  private isNearBottom(): boolean {
    const el = this.scroller()?.nativeElement;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  private scrollToBottom(): void {
    setTimeout(() => { const el = this.scroller()?.nativeElement; if (el) el.scrollTop = el.scrollHeight; });
  }
}
