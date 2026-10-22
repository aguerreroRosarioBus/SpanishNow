import { CHAT_MESSAGES } from './chat.i18n';
import { EN } from '../../core/i18n/catalogs/en';
import { ES } from '../../core/i18n/catalogs/es';

describe('Catálogo chat.* (W04)', () => {
  it('tiene las mismas claves en en y es, todas con prefijo chat.', () => {
    const en = Object.keys(CHAT_MESSAGES.en).sort();
    const es = Object.keys(CHAT_MESSAGES.es).sort();
    expect(es).toEqual(en);
    expect(en.every(key => key.startsWith('chat.'))).toBe(true);
  });

  it('los plurales coinciden en forma y ninguna clave choca con el catálogo base', () => {
    for (const key of Object.keys(CHAT_MESSAGES.en)) {
      expect(typeof CHAT_MESSAGES.es[key]).toBe(typeof CHAT_MESSAGES.en[key]);
      expect(Object.hasOwn(EN, key) || Object.hasOwn(ES, key)).toBe(false);
    }
  });

  it('los parámetros {x} son los mismos en ambos idiomas', () => {
    const params = (message: unknown) => [...new Set(JSON.stringify(message).match(/\{[a-zA-Z]\w*\}/g) ?? [])].sort();
    for (const key of Object.keys(CHAT_MESSAGES.en)) expect(params(CHAT_MESSAGES.es[key])).toEqual(params(CHAT_MESSAGES.en[key]));
  });
});
