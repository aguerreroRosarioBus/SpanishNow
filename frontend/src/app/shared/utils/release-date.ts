/** Contenido por fechas (drip): textos de «Disponible el …». Funciones puras. */

/** Fecha larga en el idioma pedido (p. ej. «21 de octubre de 2026»). '' si la fecha no es válida. */
export function formatAvailableDate(iso: string | null | undefined, locale = 'es', month: 'long' | 'short' = 'long'): string {
  if (!iso) return '';
  // Fecha pura «YYYY-MM-DD» (releaseAt): se formatea en UTC para no correrla un día en zonas con offset negativo
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month, year: 'numeric', ...(dateOnly ? { timeZone: 'UTC' } : {}) }).format(date);
}

/** true si la unidad sigue bloqueada para el momento `now`. */
export function isStillLocked(availableAt: string | null | undefined, now = Date.now()): boolean {
  if (!availableAt) return false;
  const time = new Date(availableAt).getTime();
  return Number.isFinite(time) && time > now;
}

/** Error 403 de contenido bloqueado (`code: 'content_locked'`). */
export function contentLockedFrom(error: unknown): { availableAt: string | null } | null {
  const e = error as { status?: number; error?: { code?: string; availableAt?: string | null } } | null;
  if (e?.status === 403 && e.error?.code === 'content_locked') return { availableAt: e.error.availableAt ?? null };
  return null;
}
