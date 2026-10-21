// TPRS coherence audit.   node src/db/auditTprs.js [--source content|db] [--json] [--course <id>] [--allow-remote]
//
//   --source content  (default) seeds/content/course.json + stories/*.json, read with the seed loader. No database.
//   --source db       the current published revision of every story in DB_NAME (read-only). Refuses a non-local
//                     DB_HOST unless --allow-remote is given.
//   --json            machine-readable output (one JSON document on stdout)
//
// Exit code 1 when there is at least one error (✗), 0 when there are only warnings (⚠) or nothing.
// The rules live in src/services/tprsAudit.js.
const { auditCourse, fromContent, planFromBlocks, RULES, SYMBOLS } = require('../services/tprsAudit');

function parseArgs(argv) {
  const options = { source: 'content', json: false, allowRemote: false, course: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') options.source = argv[++i];
    else if (arg.startsWith('--source=')) options.source = arg.slice('--source='.length);
    else if (arg === '--json') options.json = true;
    else if (arg === '--allow-remote') options.allowRemote = true;
    else if (arg === '--course') options.course = Number(argv[++i]);
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  if (!['content', 'db'].includes(options.source)) throw new Error('--source debe ser content o db');
  if (options.course !== null && !Number.isInteger(options.course)) throw new Error('--course necesita un id numérico');
  return options;
}

const isLocalHost = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) || /\.localhost$/.test(host);

function auditContent() {
  const { loadContent } = require('../../seeds/curated/lib/content');
  const model = fromContent(loadContent());
  return [{ label: `contenido (${model.course.title})`, ...auditCourse(model) }];
}

async function auditDatabase(options, out) {
  require('dotenv').config({ quiet: true });
  const host = process.env.DB_HOST || 'localhost';
  if (!isLocalHost(host) && !options.allowRemote) {
    throw new Error(`DB_HOST=${host} no es local; la auditoría solo lee, pero hay que confirmarlo con --allow-remote`);
  }
  // src/config/database.js prints a banner on connect; keep stdout clean for --json.
  console.log = (...args) => console.error(...args);
  const sequelize = require('../config/database');
  const { Course, Unit, Story, Question, Vocabulary, LessonPlan, LessonBlock } = require('../models');
  try {
    await sequelize.authenticate();
    out.note(`Base de datos: ${sequelize.config.host}:${sequelize.config.port}/${sequelize.config.database}`);
    const courses = await Course.findAll({ where: options.course ? { id: options.course } : {}, order: [['id', 'ASC']] });
    if (!courses.length) throw new Error(options.course ? `No existe el curso ${options.course}` : 'La base no tiene cursos');
    const audits = [];
    for (const course of courses) {
      const units = await Unit.findAll({ where: { courseId: course.id } });
      const unitById = new Map(units.map(u => [u.id, u]));
      const vocabulary = await Vocabulary.findAll({ where: { unitId: units.map(u => u.id) } });
      const stories = await Story.findAll({ where: { unitId: units.map(u => u.id) } });
      const questions = await Question.findAll({ where: { storyId: stories.map(s => s.id) } });
      const vocabularyById = new Map(vocabulary.map(v => [v.id, v]));
      const questionsById = new Map(questions.map(q => [q.id, q]));
      const model = { vocabulary: vocabulary.map(v => ({ word: v.word })), stories: [] };
      for (const story of stories) {
        const plan = await LessonPlan.findOne({ where: { storyId: story.id, status: 'published' }, order: [['revision', 'DESC']],
          include: [{ model: LessonBlock, as: 'blocks' }] });
        const unit = unitById.get(story.unitId);
        model.stories.push({
          id: story.id, title: story.title, unit: { id: unit.id, order: unit.order, title: unit.title }, order: story.order, text: story.text,
          questions: questions.filter(q => q.storyId === story.id).map(q => ({ text: q.questionText, type: q.answerType, options: q.options, correct: q.correctAnswer })),
          // A story without a published revision has no lesson: audited as an empty plan, which reports every missing piece.
          plan: plan ? planFromBlocks(plan.blocks.map(b => b.toJSON()), { questionsById, vocabularyById })
            : { before: [], keyframes: [], after: [], later: [] }
        });
      }
      audits.push({ label: `curso ${course.id} «${course.title}» (revisiones publicadas)`, ...auditCourse(model) });
    }
    return audits;
  } finally {
    await sequelize.close();
  }
}

// ---------------------------------------------------------------- output

const pad = (text, width) => String(text) + ' '.repeat(Math.max(0, width - [...String(text)].length));

function render(audits, source) {
  const lines = [];
  for (const audit of audits) {
    lines.push(`Auditoría TPRS - fuente ${source}: ${audit.label}`, '');
    const titleWidth = Math.max(8, ...audit.stories.map(s => [...s.title].length));
    lines.push(`${pad('U', 3)}${pad('#', 4)}${pad('Historia', titleWidth + 2)}${RULES.map(r => `R${r.id}`).join('  ')}`);
    for (const story of audit.stories) {
      lines.push(`${pad(story.unit.id, 3)}${pad(story.id, 4)}${pad(story.title, titleWidth + 2)}${story.rules.map(r => ` ${SYMBOLS[r.status]}`).join(' ')}`);
    }
    lines.push('', RULES.map(r => `R${r.id} ${r.label}`).join(' | '), '', 'Detalle');
    for (const story of audit.stories) {
      lines.push('', `Unidad ${story.unit.id} / historia ${story.id}: ${story.title}`);
      for (const rule of story.rules) {
        lines.push(`  ${SYMBOLS[rule.status]} R${rule.id} ${rule.label}${rule.status === 'ok' ? ` - ${rule.info}` : ''}`);
        for (const f of rule.findings) lines.push(`      ${SYMBOLS[f.level === 'error' ? 'error' : 'warning']} ${f.message}`);
      }
    }
    const s = audit.summary;
    lines.push('', 'Resumen',
      `  ${s.stories} historias: ${s.storiesClean} sin observaciones, ${s.storiesWithWarnings} solo con advertencias, ${s.storiesWithErrors} con errores`,
      `  ${s.errors} error(es) ✗, ${s.warnings} advertencia(s) ⚠`,
      `  por regla (✗/⚠): ${RULES.map(r => `R${r.id} ${s.byRule[r.key].error}/${s.byRule[r.key].warning}`).join('  ')}`, '');
  }
  return lines.join('\n');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const notes = [];
  const out = { note: message => notes.push(message) };
  const audits = options.source === 'db' ? await auditDatabase(options, out) : auditContent();
  const errors = audits.reduce((n, a) => n + a.summary.errors, 0);
  const warnings = audits.reduce((n, a) => n + a.summary.warnings, 0);
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ source: options.source, errors, warnings, audits }, null, 2)}\n`);
  } else {
    if (notes.length) process.stdout.write(`${notes.join('\n')}\n\n`);
    process.stdout.write(`${render(audits, options.source)}\n`);
  }
  process.exitCode = errors > 0 ? 1 : 0;
}

if (require.main === module) {
  main().catch(error => {
    // Loader failures (mojibake, duplicates, a choice question without its answer) are content errors too.
    console.error(`Auditoría TPRS: no se pudo completar: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { parseArgs, isLocalHost, render };
