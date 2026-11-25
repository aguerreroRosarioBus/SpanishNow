import { describe, expect, it } from 'vitest';
import { TranslationBundle, TranslationCatalog, TranslationMessage } from './i18n.types';
import { ES } from './catalogs/es';
import { AUDIO_MESSAGES } from '../../features/student/story-player/audio-messages';
import { LEGAL_SALES_MESSAGES } from '../../features/legal/legal-messages';
import { CHAT_MESSAGES } from '../../features/chat/chat.i18n';
import { PACKAGE_MESSAGES } from '../../features/packages/packages.i18n';
import { SCHEDULE_MESSAGES } from '../../features/schedule/schedule.messages';
import { CALENDAR_MESSAGES } from '../../features/integrations/calendar.messages';
import { TUTORIAL_MESSAGES } from '../tutorials/tutorial.messages';

/** C-01: el español de la interfaz usa tuteo neutro (tú), sin voseo rioplatense («Elegí», «tenés», «vos»). */
const NOT_VOSEO = new Set(['está', 'aquí', 'allí', 'allá', 'ahí', 'así', 'acá', 'jamás', 'además', 'demás', 'detrás', 'atrás', 'después', 'través', 'inglés', 'francés', 'estás', 'estés', 'más', 'tú', 'sí', 'país', 'interés', 'mes', 'ves', 'vas']);
// Imperativos en -rá/-ná que se parecen al futuro («configurá» frente a «configurará»).
const L = String.raw`(?<![\p{L}])`, R = String.raw`(?![\p{L}])`; // \b no entiende las tildes
const VOSEO_AMBIGUOUS = new RegExp(`${L}(?:configur|import|registr|administr|acord|prepar|repar|gener|recarg|encontr|mir|pas|cobr|termin|borr|elimin)á${R}`, 'giu');
const VOSEO = new RegExp(`${L}(?:[\\p{L}]{3,}[áí]|[\\p{L}]+(?:ás|és)|vos|sos)${R}`, 'giu');

const flatten = (message: TranslationMessage): string[] => (typeof message === 'string' ? [message] : Object.values(message) as string[]);
const spanish = (catalog: TranslationCatalog): [string, string][] => Object.entries(catalog).flatMap(([key, value]) => flatten(value).map(text => [key, text] as [string, string]));

const bundles: [string, TranslationCatalog][] = [
  ['base', ES], ...([['audio', AUDIO_MESSAGES], ['legal', LEGAL_SALES_MESSAGES], ['chat', CHAT_MESSAGES], ['packages', PACKAGE_MESSAGES],
    ['schedule', SCHEDULE_MESSAGES], ['calendar', CALENDAR_MESSAGES], ['tutorial', TUTORIAL_MESSAGES]] as [string, TranslationBundle][]).map(([name, bundle]) => [name, bundle.es] as [string, TranslationCatalog])
];

describe('C-01: tuteo neutro en toda la interfaz en español', () => {
  for (const [name, catalog] of bundles) {
    it(`el catálogo «${name}» no usa voseo`, () => {
      const offenders = spanish(catalog).flatMap(([key, text]) =>
        [...(text.match(VOSEO) ?? []).filter(word => !NOT_VOSEO.has(word.toLowerCase()) && !/(?:rá|ná|rás)$/i.test(word)), ...(text.match(VOSEO_AMBIGUOUS) ?? [])]
          .map(word => `${key}: ${word}`));
      expect(offenders).toEqual([]);
    });
  }
});
