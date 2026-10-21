/** Quita el prefijo redundante de los títulos viejos («Unidad 1: Saludos» → «Saludos»): el número ya se muestra aparte. */
export function unitDisplayTitle(title: string | null | undefined): string {
  const clean = (title ?? '').replace(/^\s*unidad\s*#?\s*\d+\s*[:\-–—.]\s*/i, '').trim();
  return clean || (title ?? '').trim();
}
