import { suggestAlt, validateImageFile } from './image-file';

describe('image-file', () => {
  it('valida tipo y tamaño', () => {
    expect(validateImageFile(new File(['x'], 'a.png', { type: 'image/png' }))).toBe('');
    expect(validateImageFile(new File(['x'], 'a.gif', { type: 'image/gif' }))).toBe('');
    expect(validateImageFile(new File(['x'], 'a.svg', { type: 'image/svg+xml' }))).toContain('PNG');
    expect(validateImageFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' }))).toContain('5 MB');
  });
  it('sugiere la primera frase y recorta a ~120 caracteres', () => {
    expect(suggestAlt('  María llega.  Busca a Ana. ')).toBe('María llega.');
    expect(suggestAlt('')).toBe('');
    expect(suggestAlt(null)).toBe('');
    const long = suggestAlt('palabra '.repeat(40));
    expect(long.length).toBeLessThanOrEqual(121);
    expect(long.endsWith('…')).toBe(true);
  });
});
