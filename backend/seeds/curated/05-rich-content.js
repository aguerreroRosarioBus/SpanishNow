// Phase 2 sample content for the demo course: welcome video, video in two stories, one PDF and a published quiz in unit 1.
// Created ONLY when the course has none of these yet (no intro video, no story video, no material, no quiz): as soon as a teacher
// has added or removed any of them the seed leaves the course alone, and it never overwrites anything.
// The PDF is stored with MEDIA_FAKE_UPLOADS=1 only (the seed never uploads to Cloudinary); without it that item is skipped.
const PDFDocument = require('pdfkit');
const { Op } = require('sequelize');
const fakeUploads = require('../../src/config/fakeUploads');
const materials = require('../../src/services/materialService');
const { normalizeVideoUrl } = require('../../src/utils/videoUrl');

// A public YouTube video as a stand-in: the teacher replaces it with their own link.
const SAMPLE_VIDEO = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

const QUIZ = {
  title: 'Quiz: Saludos y presentaciones',
  passingScore: 70,
  questions: [
    {
      prompt: '¿Cómo se dice “My name is María” en español?',
      options: ['Me llamo María', 'Mucho gusto, María', 'Buenos días, María', 'Gracias, María'],
      correctIndex: 0,
      explanation: '“Me llamo” sirve para decir tu nombre.'
    },
    {
      prompt: '¿Qué dices para saludar por la mañana?',
      options: ['Buenas tardes', 'Buenos días', 'Gracias', 'Mucho gusto'],
      correctIndex: 1,
      explanation: '“Buenos días” se usa hasta el mediodía; después, “buenas tardes”.'
    },
    {
      prompt: '¿Qué significa “Mucho gusto”?',
      options: ['Good night', 'Thank you', 'Nice to meet you', 'See you later'],
      correctIndex: 2,
      explanation: 'Lo dices cuando conoces a alguien por primera vez.'
    }
  ]
};

/** One-page vocabulary guide of the unit, made with pdfkit. */
function vocabularyPdf(unit) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#3d1420').text('Guía de vocabulario');
    doc.moveDown(0.3).font('Helvetica').fontSize(13).fillColor('#e8573a').text(unit.title);
    doc.moveDown(1);
    for (const v of unit.vocabulary) {
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#3d1420').text(`${v.word}  `, { continued: true })
        .font('Helvetica').fillColor('#555555').text(`— ${v.translation}`);
      if (v.example) doc.font('Helvetica-Oblique').fontSize(11).fillColor('#777777').text(v.example);
      doc.moveDown(0.6);
    }
    doc.end();
  });
}

module.exports = {
  name: 'rich-content',
  async run({ models: { Course, Unit, Story, Material, UnitQuiz, UnitQuizQuestion }, log, state }) {
    const { content } = state;
    const course = await Course.findByPk(content.course.id);
    if (!course) { log(`course ${content.course.id} not found; the course-content seed must run first`); return; }

    const unitIds = (await Unit.findAll({ where: { courseId: course.id }, attributes: ['id'] })).map(unit => unit.id);
    const taken = course.introVideoUrl
      || await Material.count({ where: { courseId: course.id } })
      || await UnitQuiz.count({ where: { unitId: { [Op.in]: unitIds } } })
      || await Story.count({ where: { unitId: { [Op.in]: unitIds }, videoUrl: { [Op.ne]: null } } });
    if (taken) { log('the demo course already has video, materials or a quiz: nothing to add'); return; }

    const video = normalizeVideoUrl(SAMPLE_VIDEO);
    await course.update({ introVideoUrl: video });
    const firstUnit = content.units[0];
    const storyIds = content.stories.filter(s => s.unitId === firstUnit.id).sort((a, b) => a.order - b.order).slice(0, 2).map(s => s.id);
    for (const id of storyIds) await Story.update({ videoUrl: video }, { where: { id } });

    const quiz = await UnitQuiz.create({ unitId: firstUnit.id, title: QUIZ.title, passingScore: QUIZ.passingScore, isPublished: true });
    for (const [order, q] of QUIZ.questions.entries()) await UnitQuizQuestion.create({ quizId: quiz.id, order, ...q });

    let pdf = 'skipped (set MEDIA_FAKE_UPLOADS=1 to create the sample PDF)';
    if (fakeUploads.enabled()) {
      const stored = await materials.storePdf(await vocabularyPdf(firstUnit));
      await Material.create({ courseId: course.id, unitId: firstUnit.id, title: 'Guía de vocabulario: Saludos', order: 0, ...stored });
      pdf = 'created';
    }
    log(`welcome video, video in ${storyIds.length} stories, quiz of ${QUIZ.questions.length} questions in unit ${firstUnit.id}, PDF ${pdf}`);
  }
};
