// Cuestionario final, video de bienvenida provisorio, PDF «How TPRS works» y curso siguiente del curso de prueba.
// Todo es aditivo: cada pieza se crea solo si falta y nunca se pisa algo que un docente ya puso.
//   cuestionario: publicado, solo si la unidad no tiene uno     video: course.introVideoUrl, solo si está vacío
//   PDF: una página hecha con pdfkit, solo si el curso no tiene materiales (se guarda con materialService.storePdf)
//   curso siguiente: TRIAL_COURSE_NEXT_SLUG, solo si ese curso es del mismo docente y el campo está vacío; sin cupón
const PDFDocument = require('pdfkit');
const cloudinary = require('../../src/config/cloudinary');
const materials = require('../../src/services/materialService');
const { normalizeVideoUrl } = require('../../src/utils/videoUrl');
const { SAMPLE_VIDEO } = require('../curated/05-rich-content');
const { requireRows } = require('./lib/rows');

/** Una página A4: título, subtítulo y las viñetas de seeds/content-trial/material.json. */
function trialPdf(material) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: material.title, Author: 'SpanishNow' } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#3d1420').text(material.heading);
    doc.moveDown(0.2).font('Helvetica').fontSize(14).fillColor('#e8573a').text(material.subtitle || '');
    doc.moveDown(1.2);
    for (const bullet of material.bullets) {
      doc.font('Helvetica').fontSize(11.5).fillColor('#333333').text(`•  ${bullet}`, { indent: 0, lineGap: 3, paragraphGap: 8 });
    }
    if (material.closing) doc.moveDown(0.6).font('Helvetica-Bold').fontSize(13).fillColor('#3d1420').text(material.closing);
    doc.end();
  });
}

module.exports = {
  name: 'extras',
  trialPdf,
  async run({ models, log, content }) {
    const { Course, Material, UnitQuiz, UnitQuizQuestion } = models;
    const { course, unit } = await requireRows({ models, content });
    const done = [];

    if (!(await UnitQuiz.count({ where: { unitId: unit.id } }))) {
      const { quiz } = content;
      const row = await UnitQuiz.create({ unitId: unit.id, title: quiz.title, passingScore: quiz.passingScore, isPublished: true });
      for (const [order, q] of quiz.questions.entries()) {
        await UnitQuizQuestion.create({ quizId: row.id, order, prompt: q.prompt, options: q.options, correctIndex: q.options.indexOf(q.correct), explanation: q.explanation });
      }
      done.push(`cuestionario «${quiz.title}» (${quiz.questions.length} preguntas, aprueba con ${quiz.passingScore})`);
    }

    if (!course.introVideoUrl) {
      await course.update({ introVideoUrl: normalizeVideoUrl(SAMPLE_VIDEO) });
      done.push('video de bienvenida provisorio');
    }

    if (!(await Material.count({ where: { courseId: course.id } }))) {
      if (cloudinary.canUpload()) {
        const stored = await materials.storePdf(await trialPdf(content.material));
        await Material.create({ courseId: course.id, unitId: null, title: content.material.title, order: 0, ...stored });
        done.push('PDF «How TPRS works»');
      } else {
        log('aviso: no hay dónde subir archivos (MEDIA_FAKE_UPLOADS=1 en local o Cloudinary); se sigue sin PDF');
      }
    }

    const nextSlug = (process.env.TRIAL_COURSE_NEXT_SLUG || '').trim();
    if (nextSlug && !course.nextCourseId) {
      const next = await Course.findOne({ where: { slug: nextSlug } });
      if (!next) log(`aviso: TRIAL_COURSE_NEXT_SLUG «${nextSlug}» no existe; el curso no tiene curso siguiente`);
      else if (next.id === course.id) log('aviso: TRIAL_COURSE_NEXT_SLUG apunta al propio curso de prueba; se ignora');
      else if (next.teacherId !== course.teacherId) log(`aviso: «${nextSlug}» es de otro docente; no se enlaza como curso siguiente`);
      else { await course.update({ nextCourseId: next.id }); done.push(`curso siguiente «${nextSlug}» (sin cupón)`); }
    }

    log(done.length ? `creado: ${done.join('; ')}` : 'nada que agregar: el cuestionario, el video, el material y el curso siguiente ya están');
  }
};
