// Archivo ICS de una clase para quien no conecta Google (CAL-05). UID estable por sesión y SEQUENCE = versión de la
// sesión, con fechas en UTC («Z»): inequívocas sin depender de la zona del servidor. Sin asistentes ni mensajes
// privados. Importar el archivo a mano no garantiza futuras actualizaciones automáticas.
const NOTE = {
  es: 'Este archivo es una copia de esta versión de la clase. Importarlo a mano no garantiza que se actualice si el horario cambia: la fuente fiable es SpanishNow.',
  en: 'This file is a copy of this version of the class. Importing it by hand does not guarantee it will update if the time changes: SpanishNow is the reliable source.'
};
const TITLE = { es: 'Clase de español · SpanishNow', en: 'Spanish class · SpanishNow' };
const stamp = date => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = text => String(text).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\;').replace(/,/g, '\\,');
// RFC 5545 §3.1: líneas de hasta 75 octetos; la continuación empieza con un espacio.
function fold(line) {
  const out = []; let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char) > (out.length ? 74 : 75)) { out.push(current); current = ''; }
    current += char;
  }
  out.push(current);
  return out.join('\r\n ');
}

function buildIcs({ session, locale = 'es', host = 'spanishnow.invalid', url, zoomJoinUrl }) {
  const lang = locale === 'en' ? 'en' : 'es';
  const cancelled = session.status === 'cancelled';
  const description = [NOTE[lang], url, zoomJoinUrl && `Zoom: ${zoomJoinUrl}`].filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SpanishNow//Clases//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:class-session-${session.id}@${host}`, `DTSTAMP:${stamp(session.updatedAt || session.startsAt)}`,
    `LAST-MODIFIED:${stamp(session.updatedAt || session.startsAt)}`, `SEQUENCE:${session.version}`,
    `DTSTART:${stamp(session.startsAt)}`, `DTEND:${stamp(session.endsAt)}`, `SUMMARY:${escape(TITLE[lang])}`,
    `DESCRIPTION:${escape(description)}`, ...(url ? [`URL:${url}`] : []), `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:OPAQUE',
    'END:VEVENT', 'END:VCALENDAR'
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

module.exports = { buildIcs };
