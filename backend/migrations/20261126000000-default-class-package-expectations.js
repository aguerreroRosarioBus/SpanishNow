'use strict';

// Condiciones por defecto para los paquetes del catálogo inicial que quedaron con la versión vigente sin expectativas.
// Sin ellas el docente tendría que escribir 8 campos × 2 idiomas por paquete para poder activarlo. Por cada plantilla
// del catálogo inicial (no archivada) cuya versión vigente tenga `expectations` nulo se publica una versión nueva
// que copia todos los campos de la vigente (precio, Hotmart, política, creador) y solo agrega las expectativas.
// Las versiones con expectativas propias (aunque sean parciales) y las plantillas archivadas no se tocan.
// Es idempotente: tras correr una vez ya no queda ninguna vigente sin expectativas.

const KEYS = ['individual-1x30', 'individual-1x50', 'individual-4x30', 'individual-4x50', 'group2-1x50-total', 'group3-1x50-seat'];

// Copia (snapshot) de `defaultExpectations` en src/domain/classInitialCatalog.js al 26/11/2026: la migración no depende de
// código que cambie después.
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

module.exports = {
  async up(q, S) {
    const { sequelize } = q;
    const tables = await q.showAllTables();
    const names = tables.map(t => (typeof t === 'string' ? t : t.tableName || t.TABLE_NAME));
    if (!names.includes('class_package_templates') || !names.includes('class_package_template_versions')) return;
    const columns = Object.keys(await q.describeTable('class_package_template_versions'));
    // Columnas que se copian tal cual de la versión vigente; las demás las fija la migración.
    const copied = columns.filter(c => !['id', 'version', 'expectations', 'createdAt'].includes(c)).map(c => `\`${c}\``).join(', ');
    await sequelize.transaction(async transaction => {
      const rows = await sequelize.query(
        `SELECT t.id AS templateId, v.id AS versionId, v.sessionsCount, v.minutesPerSession, v.groupSize, v.validityHours
           FROM class_package_templates t
           JOIN class_package_template_versions v ON v.id = t.currentVersionId
          WHERE t.templateKey IN (:keys) AND t.status <> 'archived'
            AND (v.expectations IS NULL OR JSON_TYPE(v.expectations) = 'NULL')
          ORDER BY t.id FOR UPDATE`,
        { replacements: { keys: KEYS }, type: S.QueryTypes.SELECT, transaction }
      );
      for (const row of rows) {
        const [{ last }] = await sequelize.query(
          'SELECT MAX(version) AS last FROM class_package_template_versions WHERE templateId = :templateId',
          { replacements: { templateId: row.templateId }, type: S.QueryTypes.SELECT, transaction }
        );
        // MySQL guarda el JSON a partir del texto serializado.
        const [newId] = await sequelize.query(
          `INSERT INTO class_package_template_versions (${copied}, version, expectations, createdAt)
           SELECT ${copied}, :version, CAST(:expectations AS JSON), :now FROM class_package_template_versions WHERE id = :versionId`,
          { replacements: { version: last + 1, expectations: JSON.stringify(defaultExpectations(row)), now: new Date(), versionId: row.versionId }, type: S.QueryTypes.INSERT, transaction }
        );
        await sequelize.query(
          'UPDATE class_package_templates SET currentVersionId = :newId, updatedAt = :now WHERE id = :templateId',
          { replacements: { newId, now: new Date(), templateId: row.templateId }, type: S.QueryTypes.UPDATE, transaction }
        );
      }
    });
  },

  // No-op deliberado: las versiones creadas son parte del historial de cada paquete y pueden tener ventas asociadas;
  // revertir borraría datos. Para volver atrás se publica una versión nueva a mano.
  async down() {}
};
