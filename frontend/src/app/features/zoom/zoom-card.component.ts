import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, switchMap } from 'rxjs';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { FeaturesService } from '../../core/services/features.service';
import { PermissionNoticeComponent } from '../../shared/components/permission-notice/permission-notice.component';
import { ZoomApi, ZoomSession, ZoomStatus } from './zoom-api.service';
@Component({ selector: 'app-zoom-card', standalone: true, imports: [TranslatePipe, RouterLink, PermissionNoticeComponent],
  templateUrl: './zoom-card.component.html', styleUrl: './zoom.component.scss' })
export class ZoomCardComponent {
  readonly api = inject(ZoomApi); readonly i18n = inject(I18nService); readonly features = inject(FeaturesService); readonly preferences = inject(UserPreferencesService);
  private readonly deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  readonly zone = computed(() => {
    const preferences = this.preferences.preferences();
    return preferences?.timeZoneConfirmedAt && preferences.timeZone ? preferences.timeZone : this.deviceZone;
  });
  private document = inject(DOCUMENT); private destroy = inject(DestroyRef);
  readonly status = signal<ZoomStatus | null>(null); readonly sessions = signal<ZoomSession[]>([]);
  /** La cuenta no puede usar Zoom (403 al leer el estado): se explica en lugar de mostrar un estado vacío (D-01). */
  readonly denied = signal(false);
  readonly busy = signal(false); readonly failure = signal<unknown>(null); readonly disconnecting = signal(false);
  constructor() {
    const route = inject(ActivatedRoute), router = inject(Router);
    this.features.load();
    const token = route.snapshot.queryParamMap.get('token');
    if (route.snapshot.queryParamMap.get('zoom') === 'confirm' && token) {
      // Sacar el token de la barra e historial antes de usarlo; la API exige la sesión que inició OAuth.
      void router.navigate([], { relativeTo: route, queryParams: {}, replaceUrl: true });
      this.busy.set(true);
      this.api.complete(token).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false))).subscribe({
        next: status => { this.status.set(status); this.refreshSessions(); }, error: error => this.failure.set(error)
      });
    } else {
      this.refresh();
      const callbackError = route.snapshot.queryParamMap.get('zoom');
      if (callbackError === 'zoom_oauth_denied' || callbackError === 'zoom_oauth_invalid' || callbackError === 'zoom_oauth_scopes_missing'
        || callbackError === 'zoom_provider_unavailable' || callbackError === 'forbidden') {
        void router.navigate([], { relativeTo: route, queryParams: {}, replaceUrl: true });
        this.failure.set({ error: { code: callbackError } });
      }
    }
  }
  /** Cuenta ya vinculada (aunque con problemas): ofrecer «Reconectar» y no «Conectar». */
  hasAccount(s: ZoomStatus): boolean { return !['disconnected', 'pending'].includes(s.status); }
  /** Tono de la etiqueta de estado. */
  tone(s: ZoomStatus): string { return s.status === 'connected' ? 'success' : s.status === 'revoked' ? 'danger' : s.status === 'needs_attention' || s.status === 'pending' ? 'warning' : 'neutral'; }
  isConnected(s: ZoomStatus): boolean { return s.status === 'connected'; }
  refresh(): void {
    if (this.busy()) return;
    this.busy.set(true); this.failure.set(null); this.denied.set(false);
    // Primero el estado: si la cuenta no tiene acceso (403) no se pide la lista de clases, que fallaría igual.
    let status: ZoomStatus | null = null;
    this.api.status().pipe(
      switchMap(current => { status = current; return this.api.sessions(); }),
      takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false))
    ).subscribe({
      next: r => { this.status.set(status); this.sessions.set(r.items); },
      error: e => { if ((e as { status?: number })?.status === 403) this.denied.set(true); else this.failure.set(e); }
    });
  }
  connect(): void {
    if (this.busy()) return;
    this.busy.set(true); this.failure.set(null);
    this.api.connect().pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false))).subscribe({ next: r => this.navigate(r.url), error: e => this.failure.set(e) });
  }
  navigate(url: string): void { this.document.defaultView?.location.assign(url); }
  disconnect(): void {
    if (!this.disconnecting() || this.busy()) return;
    this.busy.set(true); this.failure.set(null);
    this.api.disconnect().pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false))).subscribe({
      next: s => { this.status.set(s); this.disconnecting.set(false); this.refreshSessions(); }, error: e => this.failure.set(e)
    });
  }
  private refreshSessions(): void {
    this.api.sessions().pipe(takeUntilDestroyed(this.destroy)).subscribe({ next: s => this.sessions.set(s.items), error: e => this.failure.set(e) });
  }
}
