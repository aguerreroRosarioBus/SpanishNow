import { Locale } from '../i18n/i18n.types';

export interface UserPreferences {
  locale: Locale | null;
  timeZone: string | null;
  timeZoneConfirmedAt: string | null;
  /** W04 (CHAT-09): email agrupado de mensajes sin leer. */
  chatUnreadEmail?: boolean;
}

export interface PreferencesPatch {
  locale?: Locale;
  timeZone?: string;
  confirmTimeZone?: boolean;
  chatUnreadEmail?: boolean;
}
