// Semilla del curso de prueba (seeds/trial, src/db/seedTrial.js): contenido, auditoría TPRS y corridas completas en bases descartables.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadTrialContent, toAuditContent, glossOffsets, keyframeAudioName, vocabularyAudioName } = require('../seeds/trial/lib/content');
const { auditCourse, fromContent } = require('../src/services/tprsAudit');
const { DEFAULT_TRIAL_SLUG } = require('../src/services/trialEnrollment');
const { createScratchDb, dropScratchDb } = require('./helpers/scratchDb');

const BACKEND = path.resolve(__dirname, '..');
const SEED_DB = 'spanishnow_jest_test_trial';
const SEED_DB_LATE = 'spanishnow_jest_test_trial_late';
const FAKE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('contenido del curso de prueba (seeds/content-trial)', () => {
  const content = loadTrialContent();

  test('curso gratis de nivel A1 con el slug que usa el registro, una unidad, 3 historias y las 9 estructuras', () => {
    expect(content.course).toMatchObject({ slug: DEFAULT_TRIAL_SLUG, title: 'Free trial: Learn Spanish through stories', level: 'A1' });
    expect(content.stories.map(s => s.title)).toEqual(['Sofía quiere un perro', 'Pancho va a un café', '¿Dónde está Pancho?']);
    expect(content.vocabulary.map(v => v.word)).toEqual(['hay', 'quiere', 'tiene', 'va a', 'le gusta', 'no le gusta', 'busca', 'está en', 'encuentra']);
    for (const story of content.stories) expect(story.plan.keyframes).toHaveLength(5);
  });

  test('los archivos no llevan ids: el curso se siembra en bases con datos reales', () => {
    const ids = value => (Array.isArray(value) ? value.some(ids) : value && typeof value === 'object'
      ? Object.entries(value).some(([k, v]) => /^(id|unitId|storyId|courseId)$/.test(k) || ids(v)) : false);
    expect(ids([content.course, content.unit, content.vocabulary, content.stories.map(({ number, file, ...s }) => s), content.quiz])).toBe(false);
  });

  test('el texto de cada historia es la unión de sus keyframes y el cuestionario aprueba con 70', () => {
    for (const story of content.stories) expect(story.text).toBe(story.plan.keyframes.map(k => k.text).join(' '));
    expect(content.quiz).toMatchObject({ title: 'What just happened?', passingScore: 70 });
    expect(content.quiz.questions).toHaveLength(5);
    for (const q of content.quiz.questions) expect(q.explanation).toMatch(/[A-Za-z]/);
  });

  test('glosas: offsets de la primera aparición dentro del keyframe, palabra completa y sin importar mayúsculas', () => {
    const k = content.stories[2].plan.keyframes[2]; // «Tito, el gato, tiene una idea. Tito dice: «A Pancho le gusta la pizza». ¡Claro! Sofía va al café.»
    const offsets = glossOffsets(k.text, k.glosses);
    expect(offsets.map(o => [o.selectedText, o.tooltipContent])).toEqual([['idea', 'idea'], ['¡Claro!', 'of course!']]);
    for (const o of offsets) expect(k.text.substring(o.startOffset, o.endOffset)).toBe(o.selectedText);
    expect(glossOffsets('Hay perros grandes y un perro grande. Un grande.', [{ text: 'grande', gloss: 'big' }])[0]).toMatchObject({ startOffset: 30, selectedText: 'grande' });
    expect(() => glossOffsets('Hay perros grandes.', [{ text: 'grande', gloss: 'big' }])).toThrow(/no aparece/);
    expect(() => glossOffsets('Una tienda de animales.', [{ text: 'tienda de animales', gloss: 'a' }, { text: 'animales', gloss: 'b' }])).toThrow(/se solapan/);
  });

  test('cada glosa del PLAN aparece al menos una vez y hay audio generado para cada keyframe y cada estructura', () => {
    const glossed = content.stories.map(s => new Set(s.plan.keyframes.flatMap(k => (k.glosses || []).map(g => g.text))).size);
    expect(glossed).toEqual([10, 10, 10]);
    const audioDir = path.join(content.dir, 'audio');
    const expected = [...content.stories.flatMap(s => s.plan.keyframes.map((_, i) => keyframeAudioName(s.number, i + 1))), ...content.vocabulary.map(v => vocabularyAudioName(v.word))];
    expect(expected).toHaveLength(24);
    for (const name of expected) {
      const file = path.join(audioDir, name);
      expect(fs.existsSync(file)).toBe(true);
      expect(fs.statSync(file).size).toBeLessThan(200 * 1024); // bitrate bajo: son archivos chicos para commitear
    }
  });

  test('la auditoría TPRS no da errores ni advertencias', () => {
    const audit = auditCourse(fromContent(toAuditContent(content)));
    expect(audit.summary).toMatchObject({ stories: 3, errors: 0, warnings: 0, storiesClean: 3 });
  });

  test('db:audit:tprs acepta --content trial y rechaza otros valores', () => {
    const { parseArgs } = require('../src/db/auditTprs');
    expect(parseArgs(['--content', 'trial']).content).toBe('trial');
    expect(parseArgs(['--content=curated']).content).toBe('curated');
    expect(() => parseArgs(['--content', 'otro'])).toThrow(/curated o trial/);
  });

  test('un texto roto o un error de tipeo se rechaza antes de tocar la base', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-bad-'));
    try {
      fs.cpSync(content.dir, dir, { recursive: true });
      const file = path.join(dir, 'stories', '01-sofia-quiere-un-perro.json');
      const story = JSON.parse(fs.readFileSync(file, 'utf8'));
      story.plan.keyframes[0].glosses.push({ text: 'inexistente', gloss: 'x' });
      fs.writeFileSync(file, JSON.stringify(story));
      expect(() => loadTrialContent({ dir })).toThrow(/la glosa «inexistente» no aparece/);
      story.plan.keyframes[0].glosses.pop();
      story.plan.keyframes[0].text = story.plan.keyframes[0].text.replace('Sofía', 'SofÃ­a');
      fs.writeFileSync(file, JSON.stringify(story));
      expect(() => loadTrialContent({ dir })).toThrow(/mojibake/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('semilla del curso de prueba en una base vacía', () => {
  const content = loadTrialContent();
  let scratch;
  const env = { ...process.env, DB_NAME: SEED_DB, MEDIA_FAKE_UPLOADS: '1' };
  delete env.TRIAL_COURSE_TEACHER_EMAIL; delete env.TRIAL_COURSE_SLUG; delete env.TRIAL_COURSE_NEXT_SLUG;
  const node = (script, args = [], extraEnv = {}) => spawnSync('node', [path.join(BACKEND, 'src', 'db', script), ...args], { env: { ...env, ...extraEnv }, encoding: 'utf8' });
  const trial = (args, extraEnv) => node('seedTrial.js', args, extraEnv);
  const query = async (sql, replacements) => (await scratch.query(sql, { replacements }))[0];
  const counts = async () => (await query(`SELECT (SELECT COUNT(*) FROM courses) AS courses, (SELECT COUNT(*) FROM units) AS units, (SELECT COUNT(*) FROM vocabulary) AS vocabulary,
    (SELECT COUNT(*) FROM stories) AS stories, (SELECT COUNT(*) FROM questions) AS questions, (SELECT COUNT(*) FROM lesson_plans) AS plans, (SELECT COUNT(*) FROM lesson_blocks) AS blocks,
    (SELECT COUNT(*) FROM tooltips) AS tooltips, (SELECT COUNT(*) FROM unit_quizzes) AS quizzes, (SELECT COUNT(*) FROM unit_quiz_questions) AS quizQuestions,
    (SELECT COUNT(*) FROM materials) AS materials, (SELECT COUNT(*) FROM repetition_activities) AS activities, (SELECT COUNT(*) FROM users) AS users`))[0];

  beforeAll(async () => {
    scratch = await createScratchDb(SEED_DB);
    expect(node('migrate.js', ['up']).status).toBe(0);
  }, 90000);
  afterAll(async () => {
    const urls = [
      ...(await query('SELECT audioUrl AS url FROM lesson_blocks UNION SELECT audioUrl FROM vocabulary UNION SELECT audioUrl FROM repetition_activities UNION SELECT fileUrl FROM materials UNION SELECT imageUrl FROM courses').catch(() => [])).map(r => r.url)
    ].filter(Boolean);
    for (const url of urls) await require('../src/config/fakeUploads').removeFake(url);
    await dropScratchDb(SEED_DB, scratch);
  });

  test('sin el docente falla con un mensaje claro y no crea nada, ni cuentas', async () => {
    const withoutAccounts = trial([]);
    expect(withoutAccounts.status).toBe(1);
    expect(withoutAccounts.stderr).toMatch(/admin@gmail\.com no existe; la semilla no crea cuentas/);
    expect(await counts()).toMatchObject({ courses: 0, units: 0, stories: 0, users: 0 });

    expect(node('seed.js', ['--only', 'accounts']).status).toBe(0); // admin@gmail.com (docente), lucas@gmail.com y jane (alumnos)
    const student = trial([], { TRIAL_COURSE_TEACHER_EMAIL: 'lucas@gmail.com' });
    expect(student.status).toBe(1);
    expect(student.stderr).toMatch(/su rol es student/);
    const missing = trial([], { TRIAL_COURSE_TEACHER_EMAIL: 'nadie@jest.test' });
    expect(missing.stderr).toMatch(/nadie@jest\.test no existe/);
    expect(await counts()).toMatchObject({ courses: 0, units: 0, stories: 0, users: 3 });
  }, 60000);

  test('crea el curso gratis y publicado, con historias, planes, glosas, audio, cuestionario, PDF y video', async () => {
    const result = trial([]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('planes: 3 publicados, 0 ya vigentes, 0 saltados');

    const [course] = await query('SELECT c.*, u.email FROM courses c JOIN users u ON u.id = c.teacherId');
    expect(course).toMatchObject({ slug: DEFAULT_TRIAL_SLUG, price: 0, isPublished: 1, level: 'A1', email: 'admin@gmail.com', title: content.course.title });
    expect(course.introVideoUrl).toBe('https://www.youtube-nocookie.com/embed/jNQXAC9IVRw');
    expect(course.nextCourseId).toBeNull();
    expect(await counts()).toMatchObject({ courses: 1, units: 1, vocabulary: 9, stories: 3, questions: 18, plans: 3, tooltips: 35, quizzes: 1, quizQuestions: 5, materials: 1, activities: 9 });

    const stories = await query('SELECT id, title, text FROM stories ORDER BY `order`');
    expect(stories.map(s => s.title)).toEqual(content.stories.map(s => s.title));
    // una revisión publicada por historia, sin borradores pendientes, y el texto de la historia sale de los keyframes
    expect((await query("SELECT revision, status FROM lesson_plans ORDER BY storyId")).map(p => `${p.revision}:${p.status}`)).toEqual(['1:published', '1:published', '1:published']);
    stories.forEach((story, i) => expect(story.text).toBe(content.stories[i].plan.keyframes.map(k => k.text).join('\n\n')));

    const roles = async storyIndex => (await query(`SELECT v.word, b.vocabularyRole AS role, b.phase FROM lesson_blocks b JOIN vocabulary v ON v.id = b.vocabularyId
      WHERE b.planId = (SELECT id FROM lesson_plans WHERE storyId = ?) AND b.type = 'expression' ORDER BY b.position`, [stories[storyIndex].id])).map(r => `${r.phase}:${r.word}:${r.role}`);
    expect(await roles(0)).toEqual(['before:hay:target', 'before:quiere:target', 'before:tiene:target', 'later:quiere:revisit', 'later:tiene:revisit', 'later:hay:revisit']);
    expect(await roles(1)).toEqual(['before:va a:target', 'before:le gusta:target', 'before:no le gusta:target', 'before:quiere:revisit', 'later:le gusta:revisit', 'later:va a:revisit']);
    expect(await roles(2)).toEqual(['before:busca:target', 'before:está en:target', 'before:encuentra:target', 'before:tiene:revisit', 'before:hay:revisit', 'before:le gusta:revisit', 'before:va a:revisit']);

    // cuestionario publicado con las respuestas en la posición correcta
    const [quiz] = await query('SELECT * FROM unit_quizzes');
    expect(quiz).toMatchObject({ title: 'What just happened?', passingScore: 70, isPublished: 1 });
    const quizQuestions = await query('SELECT prompt, options, correctIndex, explanation FROM unit_quiz_questions ORDER BY `order`');
    quizQuestions.forEach((q, i) => {
      expect(q.options[q.correctIndex]).toBe(content.quiz.questions[i].correct);
      expect(q.explanation).toBe(content.quiz.questions[i].explanation);
    });

    // PDF de una página guardado con el servicio de materiales
    const [material] = await query('SELECT * FROM materials');
    expect(material).toMatchObject({ title: content.material.title, unitId: null, storyId: null, providerPublicId: null });
    const pdf = fs.readFileSync(path.join(require('../src/config/fakeUploads').DIR, path.basename(material.fileUrl)));
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length).toBe(1);
  }, 90000);

  test('las glosas apuntan al keyframe publicado con offsets correctos dentro de su propio texto', async () => {
    const tooltips = await query(`SELECT t.*, b.text, b.type, p.status, s.title FROM tooltips t JOIN lesson_blocks b ON b.blockKey = t.blockKey
      JOIN lesson_plans p ON p.id = b.planId JOIN stories s ON s.id = p.storyId AND s.id = t.targetId`);
    expect(tooltips).toHaveLength(35);
    const admin = (await query("SELECT id FROM users WHERE email = 'admin@gmail.com'"))[0].id;
    for (const t of tooltips) {
      expect(t).toMatchObject({ targetType: 'keyframe', type: 'keyframe', status: 'published', isActive: 1, createdBy: admin });
      expect(t.text.substring(t.startOffset, t.endOffset)).toBe(t.selectedText);
    }
    const byKeyframe = new Map();
    for (const t of tooltips) byKeyframe.set(t.blockKey, [...(byKeyframe.get(t.blockKey) || []), t]);
    const expected = content.stories.flatMap(s => s.plan.keyframes).filter(k => k.glosses.length);
    expect(byKeyframe.size).toBe(expected.length);
    const sample = tooltips.find(t => t.title === 'Pancho va a un café' && t.selectedText === 'señor');
    expect(sample).toMatchObject({ tooltipContent: 'man / sir', startOffset: 3 }); // «Un señor tiene una pizza grande…»
    // sin solapamientos dentro de un keyframe
    for (const list of byKeyframe.values()) {
      const sorted = [...list].sort((a, b) => a.startOffset - b.startOffset);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i].startOffset).toBeGreaterThanOrEqual(sorted[i - 1].endOffset);
    }
  });

  test('audio: cada keyframe y cada estructura quedan con su mp3, y «escuchar y repetir» y las tarjetas lo usan', async () => {
    expect((await query("SELECT COUNT(*) AS n FROM lesson_blocks WHERE type = 'keyframe' AND audioUrl IS NULL"))[0].n).toBe(0);
    expect((await query("SELECT COUNT(*) AS n FROM lesson_blocks WHERE type = 'keyframe' AND (imageUrl IS NULL OR imageAlt IS NULL)"))[0].n).toBe(0); // las 15 ilustraciones de W27, cada una con su texto alternativo
    expect((await query('SELECT COUNT(*) AS n FROM vocabulary WHERE audioUrl IS NULL'))[0].n).toBe(0);
    expect((await query("SELECT imageUrl FROM courses WHERE slug = 'free-trial-spanish-stories'"))[0].imageUrl).toMatch(/\.png$/); // portada: la primera ilustración
    // la lección muestra la instantánea del vocabulario: lleva el mismo audio que la tarjeta
    const snapshots = await query("SELECT b.vocabularySnapshot AS s, v.audioUrl FROM lesson_blocks b JOIN vocabulary v ON v.id = b.vocabularyId WHERE b.type = 'expression'");
    expect(snapshots.length).toBeGreaterThan(0);
    for (const row of snapshots) expect(row.s.audioUrl).toBe(row.audioUrl);
    const first = fs.readFileSync(path.join(require('../src/config/fakeUploads').DIR, path.basename((await query("SELECT audioUrl FROM lesson_blocks WHERE type = 'keyframe' ORDER BY id LIMIT 1"))[0].audioUrl)));
    expect(first.subarray(0, 3).toString('latin1') === 'ID3' || (first[0] === 0xff && (first[1] & 0xe0) === 0xe0)).toBe(true);

    const activities = await query('SELECT r.phrase, r.audioUrl, r.order, s.title FROM repetition_activities r JOIN stories s ON s.id = r.storyId ORDER BY s.`order`, r.order');
    expect(activities.map(a => a.phrase)).toEqual(content.stories.flatMap(s => s.plan.before.filter(b => b.role === 'target').map(b => content.vocabulary.find(v => v.word === b.expression).example)));
    for (const a of activities) {
      const word = content.vocabulary.find(v => v.example === a.phrase).word;
      expect(a.audioUrl).toBe((await query('SELECT audioUrl FROM vocabulary WHERE word = ?', [word]))[0].audioUrl);
    }
  });

  test('correrla de nuevo no cambia nada: mismos recuentos, ningún archivo ni revisión nuevos', async () => {
    const before = await counts();
    const urlsBefore = await query("SELECT audioUrl FROM lesson_blocks WHERE type = 'keyframe' ORDER BY id");
    const result = trial([]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('planes: 0 publicados, 3 ya vigentes, 0 saltados');
    expect(result.stdout).toContain('glosas: 0 creadas, 35 ya existían');
    expect(result.stdout).toContain('0 creadas, 0 actualizadas, 32 sin cambios');
    expect(result.stdout).toContain('nada que agregar');
    expect(await counts()).toEqual(before);
    expect(await query("SELECT audioUrl FROM lesson_blocks WHERE type = 'keyframe' ORDER BY id")).toEqual(urlsBefore);
  }, 90000);

  test('no pisa lo que un docente editó, salvo --sync-content / --force-plans', async () => {
    const [story] = await query("SELECT id FROM stories WHERE title = 'Sofía quiere un perro'");
    await query("UPDATE courses SET title = 'Mi título propio', introVideoUrl = 'https://player.vimeo.com/video/76979871'");
    await query("UPDATE vocabulary SET translation = 'tiene (editado)' WHERE word = 'tiene'");
    await query("UPDATE lesson_blocks SET text = CONCAT(text, ' (edit)') WHERE type = 'keyframe' AND text LIKE 'Hay una chica%'");
    await query("UPDATE tooltips SET tooltipContent = 'mi glosa' WHERE selectedText = 'chica'");
    await query("UPDATE lesson_blocks SET audioUrl = '/uploads-dev/propio.mp3' WHERE type = 'keyframe' AND text LIKE 'Hay una chica%'");
    const before = await counts();

    const kept = trial([]);
    expect(kept.status).toBe(0);
    expect(kept.stdout).toContain('NO se publicó');
    expect(kept.stdout).toContain('2 fila(s) difieren de seeds/content-trial');
    expect(kept.stdout).toMatch(/keyframe 1: el texto difiere del archivo/);
    expect(await counts()).toEqual(before);
    expect((await query('SELECT title FROM courses'))[0].title).toBe('Mi título propio');
    expect((await query("SELECT translation FROM vocabulary WHERE word = 'tiene'"))[0].translation).toBe('tiene (editado)');
    expect((await query("SELECT introVideoUrl FROM courses"))[0].introVideoUrl).toBe('https://player.vimeo.com/video/76979871');
    expect((await query("SELECT tooltipContent FROM tooltips WHERE selectedText = 'chica'"))[0].tooltipContent).toBe('mi glosa');
    expect((await query("SELECT audioUrl FROM lesson_blocks WHERE text LIKE 'Hay una chica%'"))[0].audioUrl).toBe('/uploads-dev/propio.mp3');
    expect((await query("SELECT MAX(revision) AS r FROM lesson_plans WHERE storyId = ?", [story.id]))[0].r).toBe(1);

    const synced = trial(['--sync-content']);
    expect(synced.status).toBe(0);
    expect((await query('SELECT title FROM courses'))[0].title).toBe(content.course.title);
    expect((await query("SELECT translation FROM vocabulary WHERE word = 'tiene'"))[0].translation).toBe('has');
    expect((await query("SELECT MAX(revision) AS r FROM lesson_plans WHERE storyId = ?", [story.id]))[0].r).toBe(1); // --sync-content no pisa planes curados

    const forced = trial(['--force-plans']);
    expect(forced.stdout).toContain('revisión 2 publicada');
    expect((await query("SELECT MAX(revision) AS r FROM lesson_plans WHERE storyId = ?", [story.id]))[0].r).toBe(2);
    // las claves de los bloques son nuevas: las glosas viejas se desactivaron al publicar y la semilla agrega las del keyframe vigente
    expect((await query("SELECT COUNT(*) AS n FROM tooltips WHERE isActive = 1"))[0].n).toBe(35);
    expect(forced.stdout).toMatch(/glosas: 13 creadas/);
    // el audio del keyframe nuevo se completó
    expect((await query("SELECT COUNT(*) AS n FROM lesson_blocks b JOIN lesson_plans p ON p.id = b.planId WHERE p.storyId = ? AND p.revision = 2 AND b.type = 'keyframe' AND b.audioUrl IS NULL", [story.id]))[0].n).toBe(0);
  }, 120000);
});

describe('audio e ilustraciones que llegan después', () => {
  let scratch, tmpContent;
  // dotenv no pisa variables ya definidas (ni vacías): así backend/.env no activa los archivos falsos ni Cloudinary salvo que la prueba lo pida.
  const env = { ...process.env, DB_NAME: SEED_DB_LATE, MEDIA_FAKE_UPLOADS: '', CLOUDINARY_CLOUD_NAME: '' };
  delete env.TRIAL_COURSE_TEACHER_EMAIL; delete env.TRIAL_COURSE_SLUG; delete env.TRIAL_COURSE_NEXT_SLUG;
  const run = (script, args = [], extraEnv = {}) => spawnSync('node', [path.join(BACKEND, 'src', 'db', script), ...args], { env: { ...env, ...extraEnv }, encoding: 'utf8' });
  const query = async (sql, replacements) => (await scratch.query(sql, { replacements }))[0];

  beforeAll(async () => {
    scratch = await createScratchDb(SEED_DB_LATE);
    expect(run('migrate.js', ['up']).status).toBe(0);
    expect(run('seed.js', ['--only', 'accounts']).status).toBe(0);
    tmpContent = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-content-'));
    fs.cpSync(loadTrialContent().dir, tmpContent, { recursive: true });
    fs.rmSync(path.join(tmpContent, 'images'), { recursive: true, force: true }); // simula que las ilustraciones todavía no llegaron
  }, 90000);
  afterAll(async () => {
    const urls = (await query('SELECT audioUrl AS url FROM lesson_blocks UNION SELECT imageUrl FROM lesson_blocks UNION SELECT audioUrl FROM vocabulary UNION SELECT audioUrl FROM repetition_activities UNION SELECT fileUrl FROM materials UNION SELECT imageUrl FROM courses').catch(() => [])).map(r => r.url).filter(Boolean);
    for (const url of urls) await require('../src/config/fakeUploads').removeFake(url);
    fs.rmSync(tmpContent, { recursive: true, force: true });
    await dropScratchDb(SEED_DB_LATE, scratch);
  });

  test('sin dónde subir archivos avisa y sigue sin audio, sin PDF y sin fallar', async () => {
    const result = run('seedTrial.js', [], { TRIAL_CONTENT_DIR: tmpContent });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no hay dónde subir archivos');
    expect((await query("SELECT COUNT(*) AS n FROM lesson_blocks WHERE audioUrl IS NOT NULL OR imageUrl IS NOT NULL"))[0].n).toBe(0);
    expect((await query('SELECT COUNT(*) AS n FROM materials'))[0].n).toBe(0);
    expect((await query('SELECT COUNT(*) AS n FROM unit_quizzes'))[0].n).toBe(1); // lo demás se siembra igual
    expect((await query('SELECT COUNT(*) AS n FROM repetition_activities WHERE audioUrl IS NOT NULL'))[0].n).toBe(0);
    expect((await query('SELECT COUNT(*) AS n FROM repetition_activities'))[0].n).toBe(9); // la frase se puede leer y repetir aunque aún no haya audio
  }, 90000);

  test('al correrla de nuevo con dónde subir y las ilustraciones presentes, agrega el audio y las imágenes sin revisiones nuevas', async () => {
    fs.mkdirSync(path.join(tmpContent, 'images'), { recursive: true });
    fs.writeFileSync(path.join(tmpContent, 'images', 'h1-k1.png'), FAKE_PNG);
    fs.writeFileSync(path.join(tmpContent, 'images', 'h2-k3.png'), FAKE_PNG);
    fs.writeFileSync(path.join(tmpContent, 'images', 'alt.json'), JSON.stringify({ 'h1-k1': 'Sofía with her cat Tito' }));
    const revisionsBefore = (await query('SELECT COUNT(*) AS n FROM lesson_plans'))[0].n;

    const result = run('seedTrial.js', [], { TRIAL_CONTENT_DIR: tmpContent, MEDIA_FAKE_UPLOADS: '1' });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('ilustraciones: 2');
    expect(result.stdout).toContain('portada: asignada');
    const cover = (await query("SELECT imageUrl FROM courses WHERE slug = 'free-trial-spanish-stories'"))[0].imageUrl;
    expect(cover).toMatch(/^\/uploads-dev\/.+\.png$/);
    expect(result.stdout).toContain('la ilustración h2-k3 no tiene texto alternativo');
    expect((await query('SELECT COUNT(*) AS n FROM lesson_plans'))[0].n).toBe(revisionsBefore);
    expect((await query("SELECT COUNT(*) AS n FROM lesson_blocks WHERE type = 'keyframe' AND audioUrl IS NULL"))[0].n).toBe(0);
    const images = await query("SELECT b.text, b.imageUrl, b.imageAlt FROM lesson_blocks b WHERE b.imageUrl IS NOT NULL ORDER BY b.id");
    expect(images).toHaveLength(2);
    expect(images.find(i => i.text.startsWith('Hay una chica'))).toMatchObject({ imageAlt: 'Sofía with her cat Tito', imageUrl: expect.stringMatching(/^\/uploads-dev\/.+\.png$/) });
    expect(images.find(i => i.text.startsWith('Sofía quiere un café'))?.imageAlt ?? null).toBeNull();
    expect((await query('SELECT COUNT(*) AS n FROM materials'))[0].n).toBe(1); // el PDF también se agrega cuando ya hay dónde guardarlo
    const activities = await query('SELECT audioUrl FROM repetition_activities');
    expect(activities).toHaveLength(9);
    expect(activities.every(a => a.audioUrl)).toBe(true); // las actividades creadas sin audio lo reciben después

    const again = run('seedTrial.js', [], { TRIAL_CONTENT_DIR: tmpContent, MEDIA_FAKE_UPLOADS: '1' });
    expect(again.stdout).toContain('portada: sin cambios; audio de keyframes: 0; ilustraciones: 0; audio de estructuras: 0');
    expect((await query("SELECT imageUrl FROM courses WHERE slug = 'free-trial-spanish-stories'"))[0].imageUrl).toBe(cover); // no pisa la portada
  }, 90000);

  test('TRIAL_COURSE_NEXT_SLUG enlaza el curso siguiente del mismo docente, sin cupón, y solo si el campo está vacío', async () => {
    const [{ id: teacherId }] = await query("SELECT id FROM users WHERE email = 'admin@gmail.com'");
    const otherTeacher = (await query('SELECT 1 + MAX(id) AS id FROM users'))[0].id;
    await query("INSERT INTO courses (title, level, teacherId, slug, price, isPublished, createdAt, updatedAt) VALUES ('Curso pago', 'A1', ?, 'curso-pago-jest', 9900, 1, NOW(), NOW())", [teacherId]);
    await query("INSERT INTO users (id, name, email, password, role, createdAt, updatedAt) VALUES (?, 'Otro', 'otro-docente@jest.test', 'x', 'teacher', NOW(), NOW())", [otherTeacher]);
    await query("INSERT INTO courses (title, level, teacherId, slug, price, isPublished, createdAt, updatedAt) VALUES ('Curso ajeno', 'A1', ?, 'curso-ajeno-jest', 9900, 1, NOW(), NOW())", [otherTeacher]);
    const nextOf = async () => (await query("SELECT nextCourseId, nextCourseCouponId FROM courses WHERE slug = 'free-trial-spanish-stories'"))[0];

    expect(run('seedTrial.js', ['--only', 'extras'], { TRIAL_CONTENT_DIR: tmpContent, TRIAL_COURSE_NEXT_SLUG: 'curso-ajeno-jest' }).stdout).toContain('es de otro docente');
    expect(await nextOf()).toEqual({ nextCourseId: null, nextCourseCouponId: null });
    expect(run('seedTrial.js', ['--only', 'extras'], { TRIAL_CONTENT_DIR: tmpContent, TRIAL_COURSE_NEXT_SLUG: 'no-existe' }).stdout).toContain('no existe');
    const linked = run('seedTrial.js', ['--only', 'extras'], { TRIAL_CONTENT_DIR: tmpContent, TRIAL_COURSE_NEXT_SLUG: 'curso-pago-jest' });
    expect(linked.stdout).toContain('curso siguiente «curso-pago-jest» (sin cupón)');
    const paid = (await query("SELECT id FROM courses WHERE slug = 'curso-pago-jest'"))[0].id;
    expect(await nextOf()).toEqual({ nextCourseId: paid, nextCourseCouponId: null });
    run('seedTrial.js', ['--only', 'extras'], { TRIAL_CONTENT_DIR: tmpContent, TRIAL_COURSE_NEXT_SLUG: 'curso-ajeno-jest' }); // ya hay uno: no se cambia
    expect((await nextOf()).nextCourseId).toBe(paid);
  }, 90000);
});
