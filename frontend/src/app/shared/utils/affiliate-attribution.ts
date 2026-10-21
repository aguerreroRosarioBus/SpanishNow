/**
 * Atribución de afiliados: último click gana, ventana de 30 días, guardada en localStorage.
 * Funciones puras (el almacenamiento y la hora se inyectan) y tolerantes a un storage que falla:
 * nunca lanzan, porque la atribución jamás debe romper la página de venta.
 */

export const AFFILIATE_STORAGE_KEY = 'sn_affiliate_ref';
export const AFFILIATE_WINDOW_DAYS = 30;
export const AFFILIATE_WINDOW_MS = AFFILIATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export type AffiliateStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

interface StoredRef { code: string; savedAt: number; }

/** Mayúsculas, sin espacios; solo A-Z, 0-9 y guion (1–40). Devuelve '' si no es un código válido. */
export function normalizeAffiliateCode(raw: string | null | undefined): string {
  const code = (raw ?? '').trim().toUpperCase();
  return /^[A-Z0-9-]{1,40}$/.test(code) ? code : '';
}

/** localStorage del navegador, o null si no existe o el acceso falla (modo privado, bloqueado, SSR). */
export function browserStorage(): AffiliateStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Guarda el código (pisa al anterior: último click gana). Devuelve false si no se pudo guardar. */
export function saveAffiliateRef(storage: AffiliateStorage | null, code: string, now = Date.now()): boolean {
  const normalized = normalizeAffiliateCode(code);
  if (!storage || !normalized) return false;
  try {
    const value: StoredRef = { code: normalized, savedAt: now };
    storage.setItem(AFFILIATE_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Código vigente o null. Si venció o está corrupto lo borra. */
export function readAffiliateRef(storage: AffiliateStorage | null, now = Date.now()): string | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(AFFILIATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRef> | null;
    const code = normalizeAffiliateCode(typeof parsed?.code === 'string' ? parsed.code : '');
    const savedAt = typeof parsed?.savedAt === 'number' ? parsed.savedAt : NaN;
    const age = now - savedAt;
    if (!code || !Number.isFinite(age) || age < 0 || age >= AFFILIATE_WINDOW_MS) {
      clearAffiliateRef(storage);
      return null;
    }
    return code;
  } catch {
    clearAffiliateRef(storage);
    return null;
  }
}

export function clearAffiliateRef(storage: AffiliateStorage | null): void {
  try { storage?.removeItem(AFFILIATE_STORAGE_KEY); } catch { /* sin storage: nada que borrar */ }
}
