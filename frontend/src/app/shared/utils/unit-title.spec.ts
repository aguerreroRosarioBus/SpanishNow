import { describe, expect, it } from 'vitest';
import { unitDisplayTitle } from './unit-title';

describe('unitDisplayTitle', () => {
  it('quita el prefijo "Unidad N:" redundante', () => {
    expect(unitDisplayTitle('Unidad 1: Saludos y Presentaciones')).toBe('Saludos y Presentaciones');
    expect(unitDisplayTitle('Unidad #2 - La Familia')).toBe('La Familia');
  });

  it('deja intactos los títulos sin prefijo', () => {
    expect(unitDisplayTitle('Saludos')).toBe('Saludos');
    expect(unitDisplayTitle('Unidad')).toBe('Unidad');
  });
});
