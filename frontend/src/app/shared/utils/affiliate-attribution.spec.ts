import { describe, expect, it } from 'vitest';
import {
  AFFILIATE_STORAGE_KEY, AFFILIATE_WINDOW_MS, AffiliateStorage,
  clearAffiliateRef, normalizeAffiliateCode, readAffiliateRef, saveAffiliateRef
} from './affiliate-attribution';

function memoryStorage(initial: Record<string, string> = {}): AffiliateStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
    removeItem: (k: string) => { delete data[k]; }
  };
}

const throwing: AffiliateStorage = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('quota'); },
  removeItem: () => { throw new Error('blocked'); }
};

describe('affiliate-attribution', () => {
  const t0 = 1_700_000_000_000;

  it('normaliza el código y rechaza los inválidos', () => {
    expect(normalizeAffiliateCode(' ana-01 ')).toBe('ANA-01');
    expect(normalizeAffiliateCode('a b')).toBe('');
    expect(normalizeAffiliateCode('<script>')).toBe('');
    expect(normalizeAffiliateCode('')).toBe('');
    expect(normalizeAffiliateCode(null)).toBe('');
    expect(normalizeAffiliateCode('A'.repeat(41))).toBe('');
  });

  it('guarda y lee el código dentro de la ventana', () => {
    const s = memoryStorage();
    expect(saveAffiliateRef(s, 'ana', t0)).toBe(true);
    expect(readAffiliateRef(s, t0 + 1000)).toBe('ANA');
  });

  it('el último click gana', () => {
    const s = memoryStorage();
    saveAffiliateRef(s, 'ANA', t0);
    saveAffiliateRef(s, 'BETO', t0 + 5000);
    expect(readAffiliateRef(s, t0 + 6000)).toBe('BETO');
  });

  it('un nuevo click renueva la ventana de 30 días', () => {
    const s = memoryStorage();
    saveAffiliateRef(s, 'ANA', t0);
    saveAffiliateRef(s, 'ANA', t0 + AFFILIATE_WINDOW_MS - 1000);
    expect(readAffiliateRef(s, t0 + AFFILIATE_WINDOW_MS + 1000)).toBe('ANA');
  });

  it('vence a los 30 días y se limpia', () => {
    const s = memoryStorage();
    saveAffiliateRef(s, 'ANA', t0);
    expect(readAffiliateRef(s, t0 + AFFILIATE_WINDOW_MS - 1)).toBe('ANA');
    expect(readAffiliateRef(s, t0 + AFFILIATE_WINDOW_MS)).toBeNull();
    expect(s.data[AFFILIATE_STORAGE_KEY]).toBeUndefined();
  });

  it('descarta contenido corrupto o adulterado', () => {
    for (const bad of ['no es json', '{"code":"ANA"}', '{"code":"x y","savedAt":1}', 'null', '{"code":"ANA","savedAt":"ayer"}']) {
      const s = memoryStorage({ [AFFILIATE_STORAGE_KEY]: bad });
      expect(readAffiliateRef(s, t0)).toBeNull();
    }
  });

  it('una fecha futura (reloj movido) no es válida', () => {
    const s = memoryStorage();
    saveAffiliateRef(s, 'ANA', t0 + 10_000);
    expect(readAffiliateRef(s, t0)).toBeNull();
  });

  it('no guarda códigos inválidos', () => {
    const s = memoryStorage();
    expect(saveAffiliateRef(s, 'a b', t0)).toBe(false);
    expect(s.data[AFFILIATE_STORAGE_KEY]).toBeUndefined();
  });

  it('tolera un localStorage que falla o no existe', () => {
    expect(saveAffiliateRef(throwing, 'ANA', t0)).toBe(false);
    expect(readAffiliateRef(throwing, t0)).toBeNull();
    expect(() => clearAffiliateRef(throwing)).not.toThrow();
    expect(saveAffiliateRef(null, 'ANA', t0)).toBe(false);
    expect(readAffiliateRef(null, t0)).toBeNull();
  });
});
