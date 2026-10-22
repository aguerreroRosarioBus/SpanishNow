import { Locale } from '../i18n/i18n.types';

export interface UserPreferences {
  locale: Locale | null;
  timeZone: string | null;
  timeZoneConfirmedAt: string | null;
}

export interface PreferencesPatch {
  locale?: Locale;
  timeZone?: string;
  confirmTimeZone?: boolean;
}
