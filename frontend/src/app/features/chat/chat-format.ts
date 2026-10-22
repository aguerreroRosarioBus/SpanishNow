import { Injectable, computed, inject } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { UserPreferencesService } from '../../core/services/user-preferences.service';

const DEVICE_ZONE = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } })();

/**
 * Fechas y errores del chat sobre W01: instantes en la zona confirmada del usuario (si no eligió una, la del navegador
 * como respaldo explícito) y errores por `code` con las claves errors.*.
 */
@Injectable({ providedIn: 'root' })
export class ChatFormat {
  private i18n = inject(I18nService);
  private preferences = inject(UserPreferencesService);

  readonly timeZone = computed(() => this.preferences.preferences()?.timeZone || DEVICE_ZONE);

  /** «22 oct, 10:00» en la zona del usuario. */
  instant(value: string): string {
    try {
      return this.i18n.formatInstant(value, this.timeZone(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  error(error: unknown): string {
    const res = error as { error?: { code?: string; params?: Record<string, unknown> } } | null;
    const retryAt = res?.error?.params?.['retryAt'];
    if (res?.error?.code === 'rate_limited' && typeof retryAt === 'string') {
      try {
        const time = this.i18n.formatInstant(retryAt, this.timeZone(), { hour: '2-digit', minute: '2-digit' });
        return this.i18n.t('chat.rateLimitedUntil', { time });
      } catch { /* sin hora: el texto genérico de errors.rate_limited */ }
    }
    return this.i18n.errorMessage(error);
  }
}
