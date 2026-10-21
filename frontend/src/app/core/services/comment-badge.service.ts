import { Injectable, inject, signal } from '@angular/core';
import { CommentService } from './comment.service';

const MIN_INTERVAL_MS = 60_000;

/** Cantidad de comentarios sin responder (badge del menú del docente). Un fallo nunca muestra error: el badge solo no aparece. */
@Injectable({ providedIn: 'root' })
export class CommentBadgeService {
  private comments = inject(CommentService);

  readonly unanswered = signal(0);
  private lastRefresh = 0;

  /** `force` ignora el intervalo mínimo (p. ej. al responder desde la bandeja). */
  refresh(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastRefresh < MIN_INTERVAL_MS) return;
    this.lastRefresh = now;
    this.comments.inbox('unanswered', null, 1).subscribe({
      next: ({ total }) => this.unanswered.set(total ?? 0),
      error: () => { /* sin dato: el badge queda como estaba */ }
    });
  }

  set(total: number): void { this.unanswered.set(Math.max(0, total)); }
  reset(): void { this.unanswered.set(0); this.lastRefresh = 0; }
}
