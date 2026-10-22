import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';
import { ChatService } from './chat.service';

const POLL_MS = 60_000;

/**
 * Mensajes sin leer para el menú (aviso en la app, CHAT-09). Consulta cada minuto solo con la pestaña visible y al
 * volver a ella; un fallo no muestra error: el contador queda como estaba.
 */
@Injectable({ providedIn: 'root' })
export class ChatBadgeService {
  private chat = inject(ChatService);
  private document = inject(DOCUMENT);

  readonly unread = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  private onVisibility = () => { if (this.document.visibilityState === 'visible') this.refresh(); };

  start(): void {
    if (this.timer) return;
    this.refresh();
    this.timer = setInterval(() => { if (this.document.visibilityState === 'visible') this.refresh(); }, POLL_MS);
    this.document.addEventListener('visibilitychange', this.onVisibility);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.document.removeEventListener('visibilitychange', this.onVisibility);
    this.unread.set(0);
  }

  refresh(): void {
    this.chat.unread().subscribe({
      next: ({ messages }) => this.unread.set(messages ?? 0),
      error: () => { /* sin dato: el contador queda como estaba */ }
    });
  }
}
