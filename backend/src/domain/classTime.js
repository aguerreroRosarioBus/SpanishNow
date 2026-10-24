// GENERADO desde frontend/src/app/core/time/class-time.ts.
// Ejecutar node scripts/generate-class-time.cjs; no editar a mano.
// Fuente SHA256: 4661e31540b9e1468199ea5c91c53c2c38b54f123443d288f4aa8e1f1da9825a
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeError = void 0;
exports.isTimeZone = isTimeZone;
exports.normalizeInstant = normalizeInstant;
exports.resolveLocalIntent = resolveLocalIntent;
exports.inTimeZone = inTimeZone;
exports.addElapsed = addElapsed;
exports.isAtLeastHoursBefore = isAtLeastHoursBefore;
exports.intervalsConflict = intervalsConflict;
exports.presentSessionTime = presentSessionTime;
const polyfill_1 = require("@js-temporal/polyfill");
class TimeError extends Error {
    code;
    params;
    statusCode = 400;
    constructor(code, message, params = {}) {
        super(message);
        this.code = code;
        this.params = params;
        this.name = 'TimeError';
    }
}
exports.TimeError = TimeError;
const LOCAL = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/;
const WITHOUT_ZONE = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/;
const OFFSET = /^[+-](?:[01]\d|2[0-3]):[0-5]\d$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const ZONE = /^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/;
const NAMED_ZONES = new Set(Intl.supportedValuesOf('timeZone'));
function invalid(fields) {
    throw new TimeError('validation_failed', 'Revisa los campos temporales indicados.', { fields });
}
/** Solo IANA o UTC; Temporal comprueba aliases que no enumera Intl. */
function isTimeZone(value) {
    if (typeof value !== 'string' || value.length > 64 || !ZONE.test(value))
        return false;
    if (NAMED_ZONES.has(value))
        return true;
    try {
        polyfill_1.Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(value);
        return true;
    }
    catch {
        return false;
    }
}
function requireTimeZone(value) {
    if (!isTimeZone(value)) {
        throw new TimeError('time_zone_invalid', 'Elige una zona horaria IANA válida.', { fields: ['timeZone'] });
    }
}
function parseInstant(value) {
    if (typeof value !== 'string')
        invalid(['instant']);
    if (WITHOUT_ZONE.test(value)) {
        throw new TimeError('time_without_zone', 'El instante requiere Z o un desplazamiento explícito.');
    }
    // Rechaza anotaciones de zona/calendario, fechas normalizadas y precisión que
    // se perdería al persistir en milisegundos. Nunca usa la zona del proceso.
    if (!INSTANT.test(value))
        invalid(['instant']);
    try {
        return polyfill_1.Temporal.Instant.from(value);
    }
    catch {
        return invalid(['instant']);
    }
}
function iso(value) {
    return value.toString({ fractionalSecondDigits: 3 });
}
function normalizeInstant(value) { return iso(parseInstant(value)); }
function integer(value, field, positive = false) {
    if (!Number.isSafeInteger(value) || (positive && value <= 0))
        invalid([field]);
}
function localString(value) {
    return value.toString({ smallestUnit: 'millisecond' });
}
function option(value) {
    return { offset: value.offset, startsAt: iso(value.toInstant()) };
}
/** El servidor debe invocarla de nuevo aunque el cliente ya haya validado. */
function resolveLocalIntent(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        invalid(['intent']);
    const allowed = ['localStart', 'timeZone', 'offset', 'disambiguation', 'minutes'];
    const extra = Object.keys(input).filter(key => !allowed.includes(key));
    if (extra.length)
        invalid(extra); // startsAt/endsAt no son autoridad del cliente.
    const { localStart, timeZone, offset, minutes } = input;
    const disambiguation = input.disambiguation === undefined ? 'none' : input.disambiguation;
    requireTimeZone(timeZone);
    if (typeof localStart !== 'string' || !LOCAL.test(localStart))
        invalid(['localStart']);
    if (!['none', 'earlier', 'later'].includes(disambiguation))
        invalid(['disambiguation']);
    integer(minutes, 'minutes', true);
    if (minutes > 65535)
        invalid(['minutes']); // SMALLINT UNSIGNED del esquema W00.
    let local;
    try {
        local = polyfill_1.Temporal.PlainDateTime.from(localStart, { overflow: 'reject' });
    }
    catch {
        return invalid(['localStart']);
    }
    let selected;
    let resolution = 'none';
    try {
        selected = local.toZonedDateTime(timeZone, { disambiguation: 'reject' });
    }
    catch {
        const earlier = local.toZonedDateTime(timeZone, { disambiguation: 'earlier' });
        const later = local.toZonedDateTime(timeZone, { disambiguation: 'later' });
        if (!earlier.toPlainDateTime().equals(local) || !later.toPlainDateTime().equals(local)) {
            throw new TimeError('local_time_nonexistent', 'La hora local no existe por un cambio de reloj.', {
                alternatives: [earlier, later].map(value => ({
                    ...option(value), localStart: value.toPlainDateTime().toString({ smallestUnit: 'minute' }), timeZone
                }))
            });
        }
        if (disambiguation === 'none') {
            throw new TimeError('local_time_ambiguous', 'Elige cuál de las dos horas locales corresponde.', {
                options: [option(earlier), option(later)]
            });
        }
        selected = disambiguation === 'earlier' ? earlier : later;
        resolution = disambiguation;
    }
    if (typeof offset !== 'string' || !OFFSET.test(offset))
        invalid(['offset']);
    // Temporal ya resolvió las reglas IANA. Solo se compara el offset declarado;
    // no se calculan cambios de reloj a mano. utcOffset ocupa CHAR(6) en W00.
    if (offset !== selected.offset) {
        throw new TimeError('offset_mismatch', 'El desplazamiento no corresponde a esa zona, fecha y resolución.', {
            expectedOffset: selected.offset, receivedOffset: offset
        });
    }
    const startsAt = iso(selected.toInstant());
    return {
        localStart: local.toString({ smallestUnit: 'minute' }), timeZone, utcOffset: selected.offset,
        disambiguation: resolution, startsAt, endsAt: addElapsed(startsAt, { minutes })
    };
}
/** Proyección pura: no modifica instantes, preferencias ni intención guardada. */
function inTimeZone(instant, timeZone) {
    requireTimeZone(timeZone);
    const value = parseInstant(instant);
    const zoned = value.toZonedDateTimeISO(timeZone);
    return {
        localStart: localString(zoned.toPlainDateTime()), date: zoned.toPlainDate().toString(),
        timeZone, offset: zoned.offset, startsAt: iso(value)
    };
}
/** Solo unidades transcurridas explícitas; jamás días/meses de calendario. */
function addElapsed(instant, duration) {
    if (!duration || typeof duration !== 'object' || Array.isArray(duration))
        invalid(['duration']);
    const keys = Object.keys(duration);
    if (!keys.length || keys.some(key => !['hours', 'minutes', 'seconds'].includes(key)))
        invalid(['duration']);
    for (const [key, value] of Object.entries(duration))
        integer(value, key);
    try {
        return iso(parseInstant(instant).add(duration));
    }
    catch (error) {
        if (error instanceof TimeError)
            throw error;
        return invalid(['duration']);
    }
}
/** Incluye igualdad: startsAt - now >= hours reales. La política la pasa el llamador. */
function isAtLeastHoursBefore(startsAt, now, hours) {
    integer(hours, 'hours');
    if (hours < 0)
        invalid(['hours']);
    return polyfill_1.Temporal.Instant.compare(parseInstant(startsAt), parseInstant(addElapsed(now, { hours }))) >= 0;
}
function interval(value) {
    if (!value || typeof value !== 'object')
        invalid(['interval']);
    const start = parseInstant(value.startsAt), end = parseInstant(value.endsAt);
    if (polyfill_1.Temporal.Instant.compare(start, end) >= 0)
        invalid(['endsAt']);
    return [start, end];
}
/** Intervalos semiabiertos; el buffer es simétrico y se aplica una sola vez. */
function intervalsConflict(a, b, bufferMinutes = 0) {
    integer(bufferMinutes, 'bufferMinutes');
    if (bufferMinutes < 0)
        invalid(['bufferMinutes']);
    const [aStart, aEnd] = interval(a), [bStart, bEnd] = interval(b);
    return polyfill_1.Temporal.Instant.compare(aStart, bEnd.add({ minutes: bufferMinutes })) < 0
        && polyfill_1.Temporal.Instant.compare(bStart, aEnd.add({ minutes: bufferMinutes })) < 0;
}
/** Datos para TZ-07/08: cada extremo conserva su offset, incluso cruzando DST. */
function presentSessionTime(session, recipientZone, teacherZone, locale) {
    interval(session);
    const tag = locale === 'es' ? 'es-AR' : 'en-US';
    const project = (zone) => {
        const start = inTimeZone(session.startsAt, zone), end = inTimeZone(session.endsAt, zone);
        const format = new Intl.DateTimeFormat(tag, {
            timeZone: zone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        });
        // Formato compacto (TZ-07 conserva día, fecha con año, inicio, fin, zona y desplazamiento).
        const part = (instant, options) => new Intl.DateTimeFormat(tag, { timeZone: zone, ...options }).format(new Date(instant));
        const dayOf = (instant) => part(instant, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(/[,.]/g, '');
        const timeOf = (instant) => part(instant, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
        const range = start.date === end.date ? `${timeOf(start.startsAt)}–${timeOf(end.startsAt)}`
            : `${timeOf(start.startsAt)} – ${dayOf(end.startsAt)} ${timeOf(end.startsAt)}`;
        const offsetLabel = `UTC${start.offset}${start.offset !== end.offset ? ` → UTC${end.offset}` : ''}`;
        return { start, end, startLabel: format.format(new Date(start.startsAt)), endLabel: format.format(new Date(end.startsAt)),
            day: dayOf(start.startsAt), range, offsetLabel };
    };
    const recipient = project(recipientZone), teacher = project(teacherZone);
    return {
        recipient, teacher,
        differentDates: recipient.start.date !== teacher.start.date || recipient.end.date !== teacher.end.date,
        // El horario del docente solo se oculta cuando es la misma zona IANA con los mismos desplazamientos.
        teacherDiffers: recipientZone !== teacherZone || recipient.start.offset !== teacher.start.offset || recipient.end.offset !== teacher.end.offset
    };
}
