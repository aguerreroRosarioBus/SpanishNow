import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslationParams } from '../../../core/i18n/i18n.types';

/**
 * Mensaje pendiente de traducir: se guarda la clave (y el error HTTP, si lo hay) y se traduce al leer,
 * así un cambio de idioma con el mensaje visible lo muestra en el idioma nuevo sin rehacer la petición.
 */
export interface Failure { key: string; error?: unknown; params?: TranslationParams; }

export function failureText(i18n: I18nService, failure: Failure | null): string {
  if (!failure) return '';
  return failure.error !== undefined ? i18n.errorMessage(failure.error, failure.key) : i18n.t(failure.key, failure.params);
}
