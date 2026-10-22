/** Export exactly the visible page, embedding images to keep the resulting PNG self-contained. */
export async function exportPagePng(svg: SVGSVGElement): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', '1600'); clone.setAttribute('height', '900');
  clone.querySelectorAll('.selection, .hit-area').forEach(node => node.remove());
  for (const img of Array.from(clone.querySelectorAll('image'))) {
    const response = await fetch(img.getAttribute('href')!, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('No se pudo descargar una imagen de la página.');
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(blob); });
    img.setAttribute('href', data);
  }
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo exportar.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
