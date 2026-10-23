import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { UserPreferencesService } from '../../core/services/user-preferences.service';
import { FeaturesService } from '../../core/services/features.service';
import { ZoomApi, ZoomSession, ZoomStatus } from './zoom-api.service';
@Component({ selector: 'app-zoom-card', standalone: true, imports: [TranslatePipe, RouterLink],
  templateUrl: './zoom-card.component.html', styleUrl: './zoom.component.scss' })
export class ZoomCardComponent {
  readonly api = inject(ZoomApi); readonly i18n = inject(I18nService); readonly features = inject(FeaturesService); readonly preferences = inject(UserPreferencesService);
  private document = inject(DOCUMENT); private destroy = inject(DestroyRef);
  readonly status = signal<ZoomStatus | null>(null); readonly sessions = signal<ZoomSession[]>([]);
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
  refresh(): void {
    if (this.busy()) return;
    this.busy.set(true); this.failure.set(null);
    forkJoin({ status: this.api.status(), sessions: this.api.sessions() }).pipe(takeUntilDestroyed(this.destroy), finalize(() => this.busy.set(false))).subscribe({
      next: r => { this.status.set(r.status); this.sessions.set(r.sessions.items); }, error: e => this.failure.set(e)
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
