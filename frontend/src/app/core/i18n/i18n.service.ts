import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, InjectionToken } from '@angular/core';
import { signal } from '@angular/core';
import { EN } from './catalogs/en';
import { ES } from './catalogs/es';
import { isLocale, Locale, resolveLocale, TranslationBundle, TranslationCatalog, TranslationParams } from './i18n.types';

export const LOCALE_STORAGE_KEY = 'spanishnow.locale';
/** Registrar los bundles de cada paquete en el inyector raíz con multi: true. */
export const I18N_CATALOGS = new InjectionToken<readonly TranslationBundle[]>('I18N_CATALOGS');

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);
  private readonly bundles = inject(I18N_CATALOGS, { optional: true }) ?? [];
  private readonly catalogs = this.mergeCatalogs();
  private readonly selected = signal(this.initialLocale());
  readonly locale = this.selected.asReadonly();
  readonly intlLocale = computed(() => this.locale() === 'es' ? 'es-AR' : 'en-US');

  constructor() {
    this.updateDocument();
    effect(() => this.updateDocument());
  }

  /** No navega, recarga ni modifica ningún estado de contenido, dinero o zona. */
  setLocale(locale: Locale): void {
    if (!isLocale(locale)) return;
    this.selected.set(locale);
    try { this.document.defaultView?.localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch {
      // El selector sigue funcionando en memoria si el navegador bloquea storage.
    }
  }

  t(key: string, params: TranslationParams = {}): string {
    const catalog = this.catalogs[this.locale()];
    const fallback = !Object.hasOwn(catalog, key) && this.locale() !== 'en';
    const message = Object.hasOwn(catalog, key) ? catalog[key]
      : Object.hasOwn(this.catalogs.en, key) ? this.catalogs.en[key] : undefined;
    if (message === undefined) return `[${key}]`;
    let template: string;
    if (typeof message === 'string') {
      template = message;
    } else {
      const count = params['count'];
      if (typeof count !== 'number' || !Number.isFinite(count)) return `[${key}:count]`;
      const exact = `=${count}` as const;
      const category = new Intl.PluralRules(fallback ? 'en-US' : this.intlLocale()).select(count);
      template = message[exact] ?? message[category] ?? message.other;
    }
    // Texto plano: nunca HTML, expresiones ni traducción de contenido del usuario.
    const translated = template.replace(/\{([a-zA-Z][\w]*)\}/g, (token, name: string) =>
      Object.hasOwn(params, name) ? String(params[name]) : token);
    return fallback ? `${translated} [EN]` : translated;
  }

  /** Traduce únicamente códigos conocidos. No inspecciona ni traduce excepciones arbitrarias. */
  errorMessage(error: unknown, fallbackKey = 'errors.unexpected'): string {
    const response = error as { status?: number; error?: { code?: unknown; params?: unknown } } | null;
    const code = response?.error?.code;
    if (typeof code === 'string' && Object.hasOwn(this.catalogs.en, `errors.${code}`)) {
      const rawParams = response?.error?.params;
      const params: Record<string, string | number> = {};
      if (rawParams && typeof rawParams === 'object') {
        for (const [key, value] of Object.entries(rawParams)) {
          if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) params[key] = value;
        }
      }
      return this.t(`errors.${code}`, params);
    }
    if (response?.status === 0) return this.t('errors.network');
    return this.t(fallbackKey);
  }

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.intlLocale(), options).format(value);
  }

  /** Unidades menores ISO: USD 9000 → USD 90. No convierte moneda ni redondea el dato. */
  formatMoney(amount: number, currency: string): string {
    if (!Number.isSafeInteger(amount)) throw new RangeError('El importe debe ser un entero seguro');
    const formatter = new Intl.NumberFormat(this.intlLocale(), {
      style: 'currency', currency: currency.toUpperCase(), currencyDisplay: 'code'
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(amount / (10 ** digits));
  }

  /** La zona siempre es explícita e independiente del idioma. No convierte horas de pared. */
  formatInstant(instant: string | number | Date, timeZone: string, options?: Intl.DateTimeFormatOptions): string {
    if (!timeZone || (typeof instant === 'string' && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(instant))) {
      throw new RangeError('Se requiere un instante con offset y una zona explícita');
    }
    const date = instant instanceof Date ? instant : new Date(instant);
    if (!Number.isFinite(date.getTime())) throw new RangeError('Instante inválido');
    const defaults: Intl.DateTimeFormatOptions = options?.dateStyle || options?.timeStyle ? {} : {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      timeZoneName: 'short'
    };
    return new Intl.DateTimeFormat(this.intlLocale(), { ...defaults, ...options, timeZone }).format(date);
  }

  private initialLocale(): Locale {
    const view = this.document.defaultView;
    let stored: string | null = null;
    try { stored = view?.localStorage.getItem(LOCALE_STORAGE_KEY) ?? null; } catch { /* modo privado */ }
    return resolveLocale(stored, view?.navigator.languages?.length
      ? view.navigator.languages : [view?.navigator.language ?? 'en']);
  }

  private updateDocument(): void {
    this.document.documentElement.lang = this.locale();
  }

  private mergeCatalogs(): Record<Locale, TranslationCatalog> {
    const result: Record<Locale, Record<string, import('./i18n.types').TranslationMessage>> = {
      en: { ...EN }, es: { ...ES }
    };
    for (const bundle of this.bundles) {
      for (const locale of ['en', 'es'] as const) {
        for (const [key, value] of Object.entries(bundle[locale])) {
          if (Object.hasOwn(result[locale], key)) throw new Error(`Clave I18N duplicada: ${locale}:${key}`);
          result[locale][key] = value;
        }
      }
    }
    return result;
  }
}
