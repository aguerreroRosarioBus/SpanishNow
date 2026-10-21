/** Utilidades de sincronía de posición entre el compositor y el panel lateral. */
export const USER_SCROLL_QUIET_MS = 2000;
/** Ventana en la que los eventos `scroll` se atribuyen a nuestro propio desplazamiento programático. */
export const PROGRAMMATIC_SCROLL_MS = 900;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function scrollBehavior(): ScrollBehavior { return prefersReducedMotion() ? 'auto' : 'smooth'; }

/** Decide si el panel puede moverse solo: no si el puntero está encima ni si se desplazó a mano hace poco. */
export function canAutoScroll(pointerOver: boolean, lastUserScrollAt: number, now: number): boolean {
  return !pointerOver && now - lastUserScrollAt >= USER_SCROLL_QUIET_MS;
}

/** Equivalente a `scrollIntoView({ block: 'nearest' })` pero solo sobre `container`; null si ya es totalmente visible. */
export function nearestScrollTop(container: HTMLElement, item: HTMLElement): number | null {
  const c = container.getBoundingClientRect(), r = item.getBoundingClientRect();
  if (r.top >= c.top && r.bottom <= c.bottom) return null;
  if (r.top < c.top || r.height > c.height) return container.scrollTop + (r.top - c.top);
  return container.scrollTop + (r.bottom - c.bottom);
}
