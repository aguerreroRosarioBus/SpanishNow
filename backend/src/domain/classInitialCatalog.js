// Datos iniciales de SPEC §3. Importación explícita; nunca se asigna a docentes nuevos ni habilita ventas.

// Condiciones por defecto (expectativas de venta) armadas con los datos de la variante: sesiones, minutos,
// tamaño de grupo y días de vigencia (validityHours / 24). El dueño las puede editar al publicar una versión nueva.
// La migración 20261126000000 guarda una copia de estos textos; si se cambian acá, no se reescriben versiones ya creadas.
function defaultExpectations({ sessionsCount, minutesPerSession, groupSize, validityHours }) {
  const n = sessionsCount, m = minutesPerSession, d = Math.round(validityHours / 24);
  const daysEn = `${d} ${d === 1 ? 'day' : 'days'}`, daysEs = `${d} ${d === 1 ? 'día' : 'días'}`;
  const level = { en: groupSize === 1 ? 'your level' : "the group's level", es: groupSize === 1 ? 'a tu nivel' : 'al nivel del grupo' };
  const audience = {
    1: { en: 'Teens and adults who want to practise Spanish one-on-one with a live teacher, from beginner to advanced.', es: 'Adolescentes y adultos que quieren practicar español en clases individuales en vivo, desde nivel inicial hasta avanzado.' },
    2: { en: 'Two people who want to learn Spanish together in the same live class (friends, couples, family or colleagues).', es: 'Dos personas que quieren aprender español juntas en la misma clase en vivo (amigos, pareja, familia o compañeros).' },
    3: { en: 'Students who want to practise Spanish in a small live group of up to 3 people.', es: 'Estudiantes que quieren practicar español en un grupo reducido en vivo, de hasta 3 personas.' }
  }[groupSize];
  const contents = {
    1: {
      en: `${n} live private ${n === 1 ? 'class' : 'classes'} of ${m} minutes on Zoom, booked through SpanishNow. Use ${n === 1 ? 'it' : 'them'} within ${daysEn} of purchase.`,
      es: `${n} ${n === 1 ? 'clase individual en vivo' : 'clases individuales en vivo'} de ${m} minutos por Zoom, que reservas en SpanishNow. ${n === 1 ? 'Úsala' : 'Úsalas'} dentro de los ${daysEs} posteriores a la compra.`
    },
    2: {
      en: `1 live class of ${m} minutes on Zoom for 2 students, booked through SpanishNow. The price covers both students. Use it within ${daysEn} of purchase.`,
      es: `1 clase en vivo de ${m} minutos por Zoom para 2 estudiantes, que se reserva en SpanishNow. El precio cubre a los dos. Úsala dentro de los ${daysEs} posteriores a la compra.`
    },
    3: {
      en: `1 seat in a live group class of ${m} minutes on Zoom with up to 3 students, booked through SpanishNow. Use it within ${daysEn} of purchase.`,
      es: `1 lugar en una clase grupal en vivo de ${m} minutos por Zoom, de hasta 3 estudiantes, que se reserva en SpanishNow. Úsalo dentro de los ${daysEs} posteriores a la compra.`
    }
  }[groupSize];
  return {
    en: {
      audience: audience.en,
      prerequisites: `No previous knowledge required: the teacher adapts each class to ${level.en}. You need a stable internet connection, a device with camera and microphone, and Zoom.`,
      objective: 'Improve your understanding and speaking of Spanish through live conversation and guided practice based on your goals.',
      contents: contents.en,
      selfStudy: 'Optional: 15 to 30 minutes of review between classes with the notes or materials your teacher shares.',
      outcomes: 'More confidence understanding and speaking Spanish on the topics practised. Progress depends on your starting level and practice; fluency and official certification are not guaranteed.',
      supportIncluded: 'Chat with your teacher in SpanishNow to coordinate schedules and ask short questions about your classes.',
      supportExcluded: 'Classes beyond those included, correction of long written texts, preparation for official exams and unlimited availability.'
    },
    es: {
      audience: audience.es,
      prerequisites: `No se necesitan conocimientos previos: la docente adapta cada clase ${level.es}. Necesitas una conexión a internet estable, un dispositivo con cámara y micrófono, y Zoom.`,
      objective: 'Mejorar tu comprensión y tu expresión oral en español con conversación en vivo y práctica guiada según tus objetivos.',
      contents: contents.es,
      selfStudy: 'Opcional: entre 15 y 30 minutos de repaso entre clases con las notas o materiales que comparta la docente.',
      outcomes: 'Más seguridad para comprender y hablar español en los temas practicados. El avance depende de tu nivel inicial y de tu práctica; no se garantiza fluidez ni certificación oficial.',
      supportIncluded: 'Chat con la docente en SpanishNow para coordinar horarios y hacer consultas breves sobre las clases.',
      supportExcluded: 'Clases adicionales a las incluidas, corrección de textos escritos extensos, preparación de exámenes oficiales y disponibilidad ilimitada.'
    }
  };
}

const variants = [
  ['individual-1x30', 1, 30, 1500, 1],
  ['individual-1x50', 1, 50, 2500, 1],
  ['individual-4x30', 4, 30, 5000, 1],
  ['individual-4x50', 4, 50, 9000, 1],
  ['group2-1x50-total', 1, 50, 3000, 2],
  ['group3-1x50-seat', 1, 50, 1500, 3]
];
const catalog = variants.map(([templateKey, sessionsCount, minutesPerSession, priceAmount, groupSize]) => {
  const item = {
    templateKey, sessionsCount, minutesPerSession, priceAmount, groupSize,
    nameEn: groupSize === 1 ? `${sessionsCount} × ${minutesPerSession} min — individual` : `Group of ${groupSize} — ${minutesPerSession} min`,
    nameEs: groupSize === 1 ? `${sessionsCount} × ${minutesPerSession} min — individual` : `Grupo de ${groupSize} — ${minutesPerSession} min`,
    descriptionEn: '', descriptionEs: '', currency: 'USD', validityHours: sessionsCount === 4 ? 2160 : 720,
    modality: groupSize === 1 ? 'individual' : 'group',
    billing: groupSize === 1 ? 'per_buyer' : groupSize === 2 ? 'per_group' : 'per_seat',
    seatsCovered: groupSize === 2 ? 2 : 1,
    hotmartProductId: null, hotmartOfferCode: null, hotmartCheckoutUrl: null
  };
  return { ...item, expectations: defaultExpectations(item) };
});

// El módulo sigue siendo el arreglo de variantes (lo recorre `importInitial`); la función se cuelga de él.
module.exports = catalog;
module.exports.defaultExpectations = defaultExpectations;
