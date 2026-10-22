export type Locale = 'en' | 'es';
export type TranslationParams = Readonly<Record<string, string | number>>;
export type PluralMessage = Readonly<Partial<Record<Intl.LDMLPluralRule | `=${number}`, string>> & { other: string }>;
export type TranslationMessage = string | PluralMessage;
export type TranslationCatalog = Readonly<Record<string, TranslationMessage>>;
export interface TranslationBundle {
  en: TranslationCatalog;
  es: TranslationCatalog;
}

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'es';
}

/** Solo EN/ES; se recorre la lista del navegador en su orden de preferencia. */
export function resolveLocale(stored: unknown, languages: readonly string[]): Locale {
  if (isLocale(stored)) return stored;
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return 'en';
}
