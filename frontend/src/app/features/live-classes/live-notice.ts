import { I18nService } from '../../core/i18n/i18n.service';
import { TranslationParams } from '../../core/i18n/i18n.types';

/**
 * Aviso o error de la feature guardado como dato (clave o error HTTP) y no como texto:
 * así se vuelve a traducir al cambiar el idioma sin repetir la petición que lo originó.
 */
export type LiveNotice = { key: string; params?: TranslationParams } | { error: unknown; fallback: string };

export const noticeKey = (key: string, params?: TranslationParams): LiveNotice => ({ key, params });
export const noticeError = (error: unknown, fallback = 'liveBoard.error.generic'): LiveNotice => ({ error, fallback });

export function noticeText(i18n: I18nService, notice: LiveNotice | null): string {
  if (!notice) return '';
  return 'key' in notice ? i18n.t(notice.key, notice.params) : i18n.errorMessage(notice.error, notice.fallback);
}

/** Estado de clase conocido → texto; un estado desconocido se muestra tal cual. */
export function liveStatusText(i18n: I18nService, status: string): string {
  return ['draft', 'live', 'ended'].includes(status) ? i18n.t(`liveBoard.status.${status}`) : status;
}

/** Zona de presentación de las preferencias de cuenta; nunca se deduce del idioma. */
export function presentationZone(zone: string | null | undefined): string {
  return zone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
