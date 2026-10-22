import { computed, DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { AuthService } from './auth.service';
import { I18nService } from '../i18n/i18n.service';
import { PreferencesPatch, UserPreferences } from '../models/user-preferences.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/me/preferences`;
  private readonly value = signal<UserPreferences | null>(null);
  readonly preferences = this.value.asReadonly();
  readonly loading = signal(false);
  readonly saving = signal(false);
  private readonly failure = signal<{ error: unknown; key: string } | null>(null);
  readonly errorMessage = computed(() => {
    const failure = this.failure();
    return failure ? this.i18n.errorMessage(failure.error, failure.key) : '';
  });

  private accountId: number | null | undefined;
  private generation = 0;
  private loadRequest?: Subscription;
  private saveRequest?: Subscription;
  private pending: PreferencesPatch | null = null;

  constructor() {
    effect(() => {
      const id = this.auth.currentUser()?.id ?? null;
      untracked(() => this.changeAccount(id));
    });
    this.i18n.localeChanges.pipe(takeUntilDestroyed()).subscribe(locale => {
      // Un login seguido de selección en el mismo tick también pertenece a la nueva cuenta.
      this.changeAccount(this.auth.currentUser()?.id ?? null, true);
      if (this.accountId != null) this.enqueue({ locale });
    });
    inject(DestroyRef).onDestroy(() => { this.loadRequest?.unsubscribe(); this.saveRequest?.unsubscribe(); });
  }

  saveTimeZone(timeZone: string): void {
    this.changeAccount(this.auth.currentUser()?.id ?? null);
    if (this.accountId != null) this.enqueue({ timeZone, confirmTimeZone: true });
  }

  retry(): void {
    this.changeAccount(this.auth.currentUser()?.id ?? null);
    if (this.accountId == null || this.loading() || this.saving()) return;
    if (this.pending) this.drain();
    else this.load();
  }

  private changeAccount(id: number | null, preserveExplicit = false): void {
    if (id === this.accountId) return;
    const previous = this.accountId;
    this.accountId = id;
    this.generation++;
    this.loadRequest?.unsubscribe(); this.saveRequest?.unsubscribe();
    this.pending = null;
    this.value.set(null);
    this.loading.set(false); this.saving.set(false); this.failure.set(null);
    // Conservar la selección del visitante al iniciar sesión; aislar cambios entre cuentas.
    this.i18n.resetAccountLocale(!preserveExplicit && previous != null);
    if (id !== null) this.load();
  }

  private load(): void {
    const generation = this.generation;
    this.loading.set(true); this.failure.set(null);
    this.loadRequest?.unsubscribe();
    this.loadRequest = this.http.get<UserPreferences>(this.api).subscribe({
      next: preferences => {
        if (generation !== this.generation) return;
        this.value.set(preferences);
        this.i18n.setAccountLocale(preferences.locale);
        this.loading.set(false);
        const explicit = this.i18n.explicitChoice();
        if (explicit && explicit !== preferences.locale) this.pending = { ...this.pending, locale: explicit };
        this.drain();
      },
      error: error => {
        if (generation !== this.generation) return;
        this.loading.set(false);
        this.failure.set({ error, key: 'preferences.loadError' });
        // Una elección explícita sigue siendo guardable aunque haya fallado la lectura.
        if (this.pending) this.drain();
      }
    });
  }

  private enqueue(patch: PreferencesPatch): void {
    this.pending = { ...this.pending, ...patch };
    this.drain();
  }

  /** Una escritura a la vez: alternar rápido no deja el servidor con una respuesta antigua. */
  private drain(): void {
    if (!this.pending || this.accountId == null || this.loading() || this.saving()) return;
    const patch = this.pending;
    const generation = this.generation;
    this.pending = null;
    this.saving.set(true); this.failure.set(null);
    this.saveRequest = this.http.patch<UserPreferences>(this.api, patch).subscribe({
      next: preferences => {
        if (generation !== this.generation) return;
        this.value.set(preferences);
        this.i18n.setAccountLocale(preferences.locale);
        this.saving.set(false);
        this.drain();
      },
      error: error => {
        if (generation !== this.generation) return;
        this.saving.set(false);
        // Un campo inválido necesita edición, no reenvío: no debe bloquear cambios independientes.
        if (error.status !== 400) this.pending = { ...patch, ...this.pending };
        this.failure.set({ error, key: 'preferences.saveError' });
        if (error.status === 400 && this.pending) this.drain();
      }
    });
  }
}
