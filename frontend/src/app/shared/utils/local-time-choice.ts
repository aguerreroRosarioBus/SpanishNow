import { Disambiguation, LocalIntent, resolveLocalIntent, TimeError } from '../../core/time/class-time';

/** Misma resolución que la agenda: no normaliza huecos DST ni elige una hora ambigua. */
export function localTimeChoice(localStart: string, timeZone: string, minutes: number, offset = '', disambiguation: Disambiguation = 'none') {
  const empty = { value: null, failure: null, options: [] as { offset: string; startsAt: string }[] };
  if (!localStart || !timeZone) return empty;
  const intent: LocalIntent = { localStart, timeZone, minutes, offset: offset || '+00:00', disambiguation };
  try { return { ...empty, value: resolveLocalIntent(intent) }; }
  catch (error) {
    const failure = error as TimeError;
    if (!offset && failure.code === 'offset_mismatch' && typeof failure.params['expectedOffset'] === 'string') {
      try { return { ...empty, value: resolveLocalIntent({ ...intent, offset: failure.params['expectedOffset'] }) }; } catch { /* Conservar el error. */ }
    }
    return { ...empty, failure, options: (failure.params?.['options'] ?? []) as { offset: string; startsAt: string }[] };
  }
}
