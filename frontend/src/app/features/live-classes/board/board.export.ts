import { BoardElement, BoardPage } from '../../../core/models/live-class.model';
import { pageFrame, pathOf } from './board.logic';

/** Export only the paper frame, embedding images so the resulting PNG is self-contained. */
export async function exportPagePng(svg: SVGSVGElement, page?: BoardPage): Promise<Blob> {
  const frame = pageFrame(page || 'wide');
  const width = 1600, height = Math.round(width * frame.h / frame.w);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('viewBox', `${frame.x} ${frame.y} ${frame.w} ${frame.h}`);
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height));
  clone.querySelectorAll('.selection, .hit-area').forEach(node => node.remove());
  for (const img of Array.from(clone.querySelectorAll('image'))) {
    const response = await fetch(img.getAttribute('href')!, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Could not download an image of the page.');
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(blob); });
    img.setAttribute('href', data);
  }
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url; });
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d')!.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not export the page.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

/** Export every board page as a readable PDF while keeping the JSON backup editable. */
export async function exportBoardPdf(pages: BoardPage[], resourceLabel: string): Promise<Blob> {
  if (!pages.length) throw new Error('There are no pages to export.');
  const images: RasterPage[] = [];
  for (const page of pages) images.push(await renderPageJpeg(page, resourceLabel));
  return createPdf(images);
}

interface RasterPage { bytes: Uint8Array; width: number; height: number; aspect: number; }

async function renderPageJpeg(page: BoardPage, resourceLabel: string): Promise<RasterPage> {
  const frame = pageFrame(page), width = 1600, height = Math.round(width * frame.h / frame.w);
  const elements = await Promise.all(page.elements.map(embedElementImage));
  const pattern = page.background === 'dots'
    ? `<pattern id="paper" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.2" fill="#ccd4df"/></pattern>`
    : page.background === 'grid'
      ? `<pattern id="paper" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" fill="none" stroke="#dfe5ed" stroke-width="1"/></pattern>`
      : page.background === 'lines'
        ? `<pattern id="paper" width="${frame.w}" height="40" patternUnits="userSpaceOnUse"><path d="M 0 40 L ${frame.w} 40" fill="none" stroke="#dfe5ed" stroke-width="1"/></pattern>`
        : '';
  const background = pattern
    ? `<rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" fill="url(#paper)"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${frame.x} ${frame.y} ${frame.w} ${frame.h}"><defs>${pattern}</defs><rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" fill="#fff"/>${background}${elements.map(element => renderElement(element, resourceLabel)).join('')}</svg>`;
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = reject; image.src = url; });
    await document.fonts?.ready;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not render the board page.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height);
    const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode the board page.')), 'image/jpeg', 0.94));
    return { bytes: new Uint8Array(await jpeg.arrayBuffer()), width, height, aspect: frame.w / frame.h };
  } finally { URL.revokeObjectURL(url); }
}

async function embedElementImage(element: BoardElement): Promise<BoardElement> {
  if (element.type !== 'image' || !element.url || element.url.startsWith('data:image/')) return element;
  const response = await fetch(element.url, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Could not download an image of the page.');
  const blob = await response.blob();
  return { ...element, url: await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(blob);
  }) };
}

function renderElement(element: BoardElement, resourceLabel: string): string {
  const { x, y, w, h } = element;
  if (element.type === 'pen' || element.type === 'line') {
    return `<path d="${pathOf(element.points)}" stroke="${xml(element.color)}" stroke-width="${element.width}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (element.type === 'rect') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke="${xml(element.color)}" stroke-width="${element.width}" fill="none"/>`;
  if (element.type === 'ellipse') return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" stroke="${xml(element.color)}" stroke-width="${element.width}" fill="none"/>`;
  if (element.type === 'image') return `<image href="${xml(element.url || '')}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
  if (element.type === 'link') return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#e8efff" stroke="#a4b7e7"/><text x="${x + 16}" y="${y + 30}" fill="#263b70" font-size="18">${xml(resourceLabel)}</text><text x="${x + 16}" y="${y + 62}" fill="#263b70" font-size="22">${xml((element.text || '').slice(0, 22))}</text></g>`;
  const note = element.type === 'note', fontSize = element.fontSize || (note ? 23 : 30), lineHeight = Math.ceil(fontSize * 1.22);
  const fill = note ? xml(element.color) : 'none', color = note ? element.textColor || '#2b2b2b' : element.textColor || element.color;
  const width = Math.max(1, Math.floor((w - 30) / (fontSize * 0.53)));
  const lines = (element.text || '').split('\n').flatMap(line => {
    const wrapped: string[] = []; let current = '';
    for (let word of line.split(/\s+/)) {
      while (word.length > width) { if (current) { wrapped.push(current); current = ''; } wrapped.push(word.slice(0, width)); word = word.slice(width); }
      if (current && current.length + word.length + 1 > width) { wrapped.push(current); current = word; }
      else current += (current ? ' ' : '') + word;
    }
    wrapped.push(current); return wrapped;
  }).slice(0, Math.max(1, Math.floor((h - 20) / lineHeight)));
  const text = lines.map((line, index) => `<tspan x="${x + 15}" y="${y + fontSize + 8 + index * lineHeight}">${xml(line)}</tspan>`).join('');
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}"/><text fill="${xml(color)}" font-size="${fontSize}" font-family="${xml(element.fontFamily || 'Nunito Sans')}">${text}</text></g>`;
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}

function createPdf(pages: RasterPage[]): Blob {
  const encoder = new TextEncoder();
  const header = encoder.encode('%PDF-1.4\n');
  const objects: Uint8Array[] = [encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'), new Uint8Array()];
  const pageRefs = pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ');
  objects[1] = encoder.encode(`<< /Type /Pages /Count ${pages.length} /Kids [${pageRefs}] >>`);
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index], pageObject = 3 + index * 3, contentObject = pageObject + 1, imageObject = pageObject + 2;
    const pageWidth = Math.min(792, 612 * page.aspect), pageHeight = pageWidth / page.aspect;
    const content = encoder.encode(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`);
    objects[pageObject] = encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects[contentObject] = streamObject(encoder.encode(`<< /Length ${content.length} >>`), content);
    objects[imageObject] = streamObject(encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>`), page.bytes);
  }
  const parts: Uint8Array[] = [header], offsets = [0]; let offset = header.length;
  for (let index = 0; index < objects.length; index++) {
    offsets.push(offset);
    const wrapped = concat([encoder.encode(`${index + 1} 0 obj\n`), objects[index], encoder.encode('\nendobj\n')]);
    parts.push(wrapped); offset += wrapped.length;
  }
  const xrefOffset = offset;
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(position => `${String(position).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(encoder.encode(xref));
  const bytes = concat(parts), buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: 'application/pdf' });
}

function streamObject(dictionary: Uint8Array, stream: Uint8Array): Uint8Array {
  return concat([dictionary, new TextEncoder().encode('\nstream\n'), stream, new TextEncoder().encode('\nendstream')]);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
