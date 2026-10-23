/** Validación y utilidades para las ilustraciones (keyframes y expresiones). */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Devuelve un mensaje de error en español o '' si el archivo es válido. */
export function validateImageFile(file: File): string {
  if (!TYPES.includes(file.type)) return 'El archivo debe ser una imagen PNG, JPG, WebP o GIF.';
  if (file.size > IMAGE_MAX_BYTES) return 'La imagen supera los 5 MB. Elige una más ligera.';
  return '';
}

/** Igual que validateImageFile pero devuelve la clave I18N del error ('' si es válido). */
export function imageFileErrorKey(file: File): string {
  if (!TYPES.includes(file.type)) return 'teacherDashboard.imageTypeInvalid';
  if (file.size > IMAGE_MAX_BYTES) return 'teacherDashboard.imageTooLarge';
  return '';
}

/** Primera frase del fragmento recortada a ~120 caracteres: sugerencia de texto alternativo. */
export function suggestAlt(text: string | null | undefined, max = 120): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentence = clean.match(/^.*?[.!?¡¿…](?=\s|$)/)?.[0] ?? clean;
  const base = sentence.length > 3 ? sentence : clean;
  if (base.length <= max) return base;
  const cut = base.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max / 2))).trimEnd() + '…';
}
