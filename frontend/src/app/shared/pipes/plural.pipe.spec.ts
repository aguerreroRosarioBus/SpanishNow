import { describe, expect, it } from 'vitest';
import { pluralize } from './plural.pipe';

describe('pluralize', () => {
  it('usa singular solo para 1', () => {
    expect(pluralize(1, 'pregunta', 'preguntas')).toBe('1 pregunta');
    expect(pluralize(2, 'pregunta', 'preguntas')).toBe('2 preguntas');
  });

  it('usa el texto de cero cuando se da', () => {
    expect(pluralize(0, 'pregunta', 'preguntas', 'Sin preguntas')).toBe('Sin preguntas');
    expect(pluralize(0, 'pregunta', 'preguntas')).toBe('0 preguntas');
  });
});
