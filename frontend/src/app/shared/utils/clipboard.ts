/** Copia un texto al portapapeles. Devuelve false si el navegador lo impide (el caller muestra el texto para copiarlo a mano). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
