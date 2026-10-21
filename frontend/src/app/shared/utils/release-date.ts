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

/** «Disponible el 21 de octubre de 2026» (o un texto genérico si no hay fecha). */
export function availableOnLabel(iso: string | null | undefined, locale = 'es'): string {
  const date = formatAvailableDate(iso, locale);
  return date ? `Disponible el ${date}` : 'Disponible próximamente';
}

/** true si la unidad sigue bloqueada para el momento `now`. */
export function isStillLocked(availableAt: string | null | undefined, now = Date.now()): boolean {
  if (!availableAt) return false;
  const time = new Date(availableAt).getTime();
  return Number.isFinite(time) && time > now;
}

/** Texto de la regla del docente (con los dos campos se libera cuando se cumplen ambos). */
export function releaseRuleLabel(afterDays: number | null | undefined, releaseAt: string | null | undefined, locale = 'es'): string {
  const days = afterDays != null && afterDays > 0 ? (afterDays === 1 ? 'al día de la inscripción' : `a los ${afterDays} días de la inscripción`) : '';
  const date = formatAvailableDate(releaseAt, locale);
  if (days && date) return `Se libera ${days}, pero no antes del ${date}`;
  if (days) return `Se libera ${days}`;
  if (date) return `Se libera el ${date}`;
  return '';
}

/** Error 403 de contenido bloqueado (`code: 'content_locked'`). */
export function contentLockedFrom(error: unknown): { availableAt: string | null } | null {
  const e = error as { status?: number; error?: { code?: string; availableAt?: string | null } } | null;
  if (e?.status === 403 && e.error?.code === 'content_locked') return { availableAt: e.error.availableAt ?? null };
  return null;
}
