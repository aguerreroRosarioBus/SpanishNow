import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EN } from './catalogs/en';
import { ES } from './catalogs/es';
import { I18N_CATALOGS, I18nService, LOCALE_STORAGE_KEY } from './i18n.service';
import { resolveLocale, TranslationCatalog } from './i18n.types';

describe('I18N: idioma, catálogos y formatos', () => {
  beforeEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));
  afterEach(() => { vi.restoreAllMocks(); localStorage.removeItem(LOCALE_STORAGE_KEY); });

  it('prioriza preferencia local válida, luego EN/ES del navegador y finalmente inglés', () => {
    expect(resolveLocale('es', ['en-US'])).toBe('es');
    expect(resolveLocale('en', ['es-AR'])).toBe('en');
    expect(resolveLocale('fr', ['de', 'es-AR', 'en-GB'])).toBe('es');
    expect(resolveLocale(null, ['pt-BR', 'en-GB', 'es'])).toBe('en');
    expect(resolveLocale(null, ['fr-FR'])).toBe('en');
    expect(resolveLocale(null, ['english'])).toBe('en');
  });

  it('restaura la elección local y actualiza lang sin recargar', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'es');
    const service = TestBed.inject(I18nService);
    expect(service.locale()).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    service.setLocale('en');
    TestBed.tick();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(service.intlLocale()).toBe('en-US');
  });

  it('tolera almacenamiento inaccesible tanto al leer como al elegir idioma', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
    const service = TestBed.inject(I18nService);
    expect(() => service.setLocale('es')).not.toThrow();
    expect(service.locale()).toBe('es');
  });

  it('no escribe nada salvo la preferencia de idioma', () => {
    const service = TestBed.inject(I18nService);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    service.setLocale('es');
    expect(write.mock.calls).toEqual([[LOCALE_STORAGE_KEY, 'es']]);
  });

  it('interpola parámetros y resuelve plurales EN/ES con una sola clave', () => {
    const service = TestBed.inject(I18nService);
    service.setLocale('en');
    expect(service.t('nav.unanswered', { count: 0 })).toBe('0 unanswered comments');
    expect(service.t('nav.unanswered', { count: 1 })).toBe('1 unanswered comment');
    service.setLocale('es');
    expect(service.t('nav.unanswered', { count: 2 })).toBe('2 comentarios sin responder');
    expect(service.t('nav.impersonating', { name: '<b>Ana</b>' })).toContain('<b>Ana</b>');
    expect(service.t('nav.unanswered')).toBe('[nav.unanswered:count]');
    expect(service.t('missing.key')).toBe('[missing.key]');
    expect(service.t('toString')).toBe('[toString]');
  });

  it('acepta bundles por paquete, plural exacto y fallback EN identificable', () => {
    TestBed.configureTestingModule({ providers: [{ provide: I18N_CATALOGS, multi: true, useValue: {
      en: { 'chat.empty': 'No messages', 'chat.count': { '=0': 'Empty', one: '{count} message', other: '{count} messages' } },
      es: { 'chat.count': { '=0': 'Vacío', other: '{count} mensajes' } }
    } }] });
    const service = TestBed.inject(I18nService);
    service.setLocale('es');
    expect(service.t('chat.empty')).toBe('No messages [EN]');
    expect(service.t('chat.count', { count: 0 })).toBe('Vacío');
    expect(service.t('chat.count', { count: 3 })).toBe('3 mensajes');
  });

  it('rechaza bundles que pisan claves de otro paquete', () => {
    TestBed.configureTestingModule({ providers: [{ provide: I18N_CATALOGS, multi: true,
      useValue: { en: { 'nav.settings': 'Override' }, es: {} } }] });
    expect(() => TestBed.inject(I18nService)).toThrow(/duplicada/);
  });

  it('traduce códigos estables, ignora excepciones y conserva fallback seguro', () => {
    const service = TestBed.inject(I18nService);
    service.setLocale('es');
    expect(service.errorMessage({ error: { code: 'insufficient_credit', error: 'secret' } })).toBe(ES['errors.insufficient_credit']);
    expect(service.errorMessage({ error: { code: 'new_code', error: 'secret' } })).toBe(ES['errors.unexpected']);
    expect(service.errorMessage({ error: { error: 'SQL secret' } }, 'auth.loginError')).toBe(ES['auth.loginError']);
    expect(service.errorMessage({ status: 0 })).toBe(ES['errors.network']);
    service.setLocale('en');
    expect(service.errorMessage({ error: { code: 'time_zone_invalid' } })).toBe(EN['errors.time_zone_invalid']);
  });

  it('formatea números e importes sin cambiar moneda, valor o unidades menores', () => {
    const service = TestBed.inject(I18nService);
    const money = Object.freeze({ amount: 9015, currency: 'USD' });
    service.setLocale('en');
    expect(service.formatNumber(1234.5)).toBe('1,234.5');
    expect(service.formatMoney(money.amount, money.currency)).toContain('90.15');
    service.setLocale('es');
    expect(service.formatNumber(1234.5)).toBe('1.234,5');
    expect(service.formatMoney(money.amount, money.currency)).toContain('90,15');
    expect(service.formatMoney(money.amount, money.currency)).toContain('USD');
    expect(money).toEqual({ amount: 9015, currency: 'USD' });
    expect(() => service.formatMoney(90.15, 'USD')).toThrow(RangeError);
  });

  it('presenta el mismo instante en la zona explícita al cambiar idioma', () => {
    const service = TestBed.inject(I18nService);
    const instant = '2026-10-23T02:30:00.000Z';
    const zone = 'America/Argentina/Cordoba';
    const options = { hourCycle: 'h23' as const };
    service.setLocale('en');
    const english = service.formatInstant(instant, zone, options);
    service.setLocale('es');
    const spanish = service.formatInstant(instant, zone, options);
    expect(english).toContain('22');
    expect(spanish).toContain('22');
    expect(english).toContain('23:30');
    expect(spanish).toContain('23:30');
    expect(service.formatInstant(instant, 'UTC', options)).toContain('02:30');
    expect(service.formatInstant(instant, 'UTC', { dateStyle: 'long' })).toContain('2026');
    expect(() => service.formatInstant('2026-10-23T02:30', zone)).toThrow(RangeError);
    expect(() => service.formatInstant('not-a-dateZ', zone)).toThrow(RangeError);
    expect(() => service.formatInstant(instant, '')).toThrow(RangeError);
  });

  it('ambos catálogos tienen las mismas claves y parámetros en cada variante', () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(ES).sort());
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    const es: TranslationCatalog = ES;
    for (const [key, enMessage] of Object.entries(EN)) {
      const esMessage = es[key];
      if (typeof enMessage === 'string') {
        expect(typeof esMessage, key).toBe('string');
        expect(placeholders(enMessage), key).toEqual(placeholders(esMessage as string));
      } else {
        expect(typeof esMessage, key).toBe('object');
        for (const [category, variant] of Object.entries(esMessage)) {
          const counterpart = (enMessage as Readonly<Record<string, string | undefined>>)[category] ?? enMessage.other;
          if (variant !== undefined) expect(placeholders(variant), key).toEqual(placeholders(counterpart));
        }
      }
    }
  });
});
