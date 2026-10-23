import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { catchError, finalize, forkJoin, Observable, of } from 'rxjs';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { AuthService } from '../../core/services/auth.service';
import { ClassSession, ClassSessionsService } from '../../core/services/class-sessions.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { SessionTimeComponent } from '../schedule/session-time.component';
import { ZoomApi, ZoomSessionStatus } from './zoom-api.service';
@Component({ selector: 'app-zoom-session', standalone: true, imports: [FormsModule, RouterLink, TranslatePipe, SessionTimeComponent],
  templateUrl: './zoom-session.component.html', styleUrl: './zoom.component.scss' })
export class ZoomSessionComponent {
  readonly api = inject(ZoomApi); private schedule = inject(ClassSessionsService); private auth = inject(AuthService);
  readonly preferences = inject(UserPreferencesService); readonly i18n = inject(I18nService);
  private route = inject(ActivatedRoute); private destroy = inject(DestroyRef);
  readonly session = signal<ClassSession | null>(null); readonly sync = signal<ZoomSessionStatus | null>(null);
  readonly failure = signal<unknown>(null); readonly busy = signal(false); readonly meeting = signal<string | null>(null);
  readonly notice = signal(''); manualLink = '';
  /** El estado de la reunión no se pudo leer (la clase sí): la pantalla sigue mostrando la clase y ofrece reintentar. */
  readonly syncFailure = signal<unknown>(null);
  /**
   * Qué le pasa a la reunión, para no mostrar «Zoom no está disponible» ante todo:
   * `syncing` (aún no creada o creándose), `disconnected` (falta la conexión del docente), `error` (otro fallo con motivo),
   * `manual` (hay enlace manual), `ready`, `cancelled` o `unknown` (todavía sin leer).
   */
  readonly meetingState = computed<'unknown' | 'ready' | 'manual' | 'cancelled' | 'disconnected' | 'error' | 'syncing'>(() => {
    const r = this.sync(); if (!r) return 'unknown';
    if (r.manual) return 'manual';
    if (r.status === 'ready') return 'ready';
    if (r.status === 'cancelled') return 'cancelled';
    if (r.lastError && ['integration_not_connected', 'zoom_authorization_lost', 'zoom_revoked'].includes(r.lastError)) return 'disconnected';
    if (r.lastError) return 'error';
    return 'syncing';
  });
  readonly canJoin = computed(() => ['ready', 'manual'].includes(this.meetingState()));
  readonly teacher = computed(() => this.session()?.teacherId === this.auth.currentUser()?.id);
  readonly zone = computed(() => this.preferences.preferences()?.timeZone || 'UTC');
  private id = Number(this.route.snapshot.paramMap.get('id'));
  constructor() { this.refresh(); }
  refresh(): void {
    if (this.busy()) return;
    this.busy.set(true); this.failure.set(null); this.syncFailure.set(null); this.meeting.set(null);
    forkJoin({ session: this.schedule.get(this.id), sync: this.api.session(this.id).pipe(catchError(e => { this.syncFailure.set(e); return of(null); })) }).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false))).subscribe({
      next: r => { this.session.set(r.session); this.sync.set(r.sync); }, error: e => this.failure.set(e)
    });
  }
  private action<T>(request: Observable<T>, success: (value: T) => void): void {
    if (this.busy()) return;
    this.busy.set(true); this.failure.set(null); this.notice.set('');
    request.pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false))).subscribe({ next: success, error: e => this.failure.set(e) });
  }
  join(): void {
    this.meeting.set(null);
    this.action(this.api.join(this.id), r => this.meeting.set(r.hostUrl || r.joinUrl || null));
  }
  retry(): void { this.action(this.api.retry(this.id), () => this.notice.set('zoom.queued')); }
  saveManual(remove = false): void {
    const s = this.session(); if (!s) return;
    this.action(this.api.manual(this.id, s.version, remove ? null : this.manualLink.trim()), r => {
      this.sync.update(current => current ? { ...current, manual: r.manual } : current);
      this.manualLink = ''; this.meeting.set(null); this.notice.set('zoom.manualSaved');
    });
  }
}
