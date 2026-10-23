// Curated seeds (seeds/curated, src/db/seed.js): content files, plan builder and a full run on a scratch database.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const bcrypt = require('bcryptjs');
const { loadContent, loadAccounts, assertCleanText, MOJIBAKE } = require('../seeds/curated/lib/content');
const { buildBlocks, signature, sameSignature, isUncurated } = require('../seeds/curated/lib/plan');
const { resolvePassword } = require('../seeds/curated/01-accounts');
const { createScratchDb, dropScratchDb } = require('./helpers/scratchDb');

const BACKEND = path.resolve(__dirname, '..');
const SEED_DB = 'spanishnow_jest_test_seed';

describe('seed content files', () => {
  const content = loadContent();

  test('has the canonical course: 3 units, 9 stories, at least the original 16 questions and 24 vocabulary entries', () => {
    expect(content.units).toHaveLength(3);
    expect(content.stories).toHaveLength(9);
    expect(content.stories.flatMap(s => s.questions).length).toBeGreaterThanOrEqual(16);
    expect(content.units.flatMap(u => u.vocabulary).length).toBeGreaterThanOrEqual(24);
  });

  test('every text is clean UTF-8 (no mojibake, NFC)', () => {
    expect(() => assertCleanText(content, 'content')).not.toThrow();
    expect(content.stories[0].title).toBe('María en la Fiesta');
    expect(content.units[0].vocabulary.find(v => v.id === 4).word).toBe('Buenos días');
  });

  test('the mojibake detector flags CP437 and Latin-1 artefacts but not correct Spanish', () => {
    for (const bad of ['Buenos d├¡as', '┬┐Cu├íntos', 'Mar├¡a', 'dÃ­as', 'seÃ±or', 'â€œHolaâ€', 'Â¿Qué', 'caf�']) expect(MOJIBAKE.test(bad)).toBe(true);
    for (const good of ['Buenos días', '¿Cuántos años tiene?', 'señor Muñoz', 'pingüino', 'Ánimo, ¡vamos!']) expect(MOJIBAKE.test(good)).toBe(false);
  });

  test('the curated plan of María en la Fiesta matches seeds/tprs_pilot_plan.json', () => {
    const pilot = JSON.parse(fs.readFileSync(path.join(BACKEND, 'seeds', 'tprs_pilot_plan.json'), 'utf8'));
    const plan = content.stories.find(s => s.title === pilot.story).plan;
    expect(plan.before.map(e => [e.expression, e.role])).toEqual(pilot.before.map(e => [e.word, e.role]));
    expect(plan.keyframes.map(k => [k.text, (k.questionsAfter || [])[0]])).toEqual(pilot.during.map(d => [d.text, d.afterQuestion]));
    expect(plan.after).toEqual(pilot.after);
    expect(plan.later).toEqual([{ expression: pilot.later.word, role: pilot.later.role, story: pilot.later.story }]);
  });

  test('test accounts: at least a teacher and a student', () => {
    const roles = new Set(loadAccounts().accounts.map(a => a.role));
    expect([...roles].sort()).toEqual(['student', 'teacher']);
  });
});

describe('test account password', () => {
  const saved = process.env.SEED_TEST_PASSWORD;
  afterEach(() => { if (saved === undefined) delete process.env.SEED_TEST_PASSWORD; else process.env.SEED_TEST_PASSWORD = saved; });

  test('SEED_TEST_PASSWORD wins; the file password is only used on localhost; remote hosts require the variable', () => {
    delete process.env.SEED_TEST_PASSWORD;
    expect(resolvePassword({ host: 'localhost', filePassword: 'from-file' })).toBe('from-file');
    expect(resolvePassword({ host: '127.0.0.1', filePassword: 'from-file' })).toBe('from-file');
    expect(() => resolvePassword({ host: 'viaduct.proxy.rlwy.net', filePassword: 'from-file' })).toThrow(/SEED_TEST_PASSWORD/);
    process.env.SEED_TEST_PASSWORD = 'from-env';
    expect(resolvePassword({ host: 'viaduct.proxy.rlwy.net', filePassword: 'from-file' })).toBe('from-env');
    expect(resolvePassword({ host: 'localhost', filePassword: 'from-file' })).toBe('from-env');
  });
});

describe('plan builder', () => {
  const story = { id: 1, title: 'S', text: 'Texto completo.' };
  const refs = {
    questions: new Map([['¿a?', { id: 11, key: '¿a?', questionText: '¿A?' }], ['¿b?', { id: 12, key: '¿b?', questionText: '¿B?' }]]),
    vocabulary: new Map([['me llamo', { id: 5, word: 'Me llamo' }]]),
    stories: new Map([['otra', { id: 2 }], ['s', { id: 1 }]])
  };
  const maps = { questionsById: new Map([[11, { questionText: '¿A?' }], [12, { questionText: '¿B?' }]]), vocabularyById: new Map([[5, { word: 'Me llamo' }]]), storiesById: new Map([[2, { title: 'Otra' }]]) };

  test('default plan: one keyframe, full story, every question, flashcards and matching', () => {
    const { blocks } = buildBlocks(story, undefined, refs);
    expect(blocks.map(b => `${b.phase}:${b.type}`)).toEqual(['during:keyframe', 'after:full_story', 'after:question', 'after:question', 'after:flashcards', 'after:matching']);
    expect(blocks[0]).toMatchObject({ text: 'Texto completo.', required: true });
    expect(blocks.filter(b => b.type === 'question').every(b => b.contextBlockKey === blocks[0].blockKey)).toBe(true);
    expect(isUncurated(blocks)).toBe(true);
  });

  test('explicit plan: expressions, keyframes with questions, ordered after list and a later reappearance', () => {
    const plan = {
      before: [{ expression: 'Me llamo' }],
      keyframes: [{ text: 'Uno.', questionsAfter: ['¿A?'] }, { text: 'Dos.' }],
      after: ['full_story', { question: '¿B?' }, 'listen_repeat'],
      later: [{ expression: 'Me llamo', role: 'revisit', story: 'Otra' }]
    };
    const { blocks } = buildBlocks(story, plan, refs);
    expect(blocks.map(b => `${b.phase}:${b.type}`)).toEqual(['before:expression', 'during:keyframe', 'during:question', 'during:keyframe',
      'after:full_story', 'after:question', 'after:listen_repeat', 'later:expression']);
    expect(blocks[0]).toMatchObject({ vocabularyId: 5, vocabularyRole: 'target' });
    expect(blocks[2].contextBlockKey).toBe(blocks[1].blockKey);
    expect(blocks[5].contextBlockKey).toBe(blocks[3].blockKey); // after-questions point at the last keyframe
    expect(blocks[7]).toMatchObject({ vocabularyRole: 'revisit', revisitStoryId: 2 });
    expect(isUncurated(blocks)).toBe(false);
  });

  test('signatures ignore ids and keys but notice content changes', () => {
    const a = signature(buildBlocks(story, undefined, refs).blocks, maps);
    const b = signature(buildBlocks(story, undefined, refs).blocks, maps);
    const c = signature(buildBlocks({ ...story, text: 'Otro texto.' }, undefined, refs).blocks, maps);
    expect(sameSignature(a, b)).toBe(true);
    expect(sameSignature(a, c)).toBe(false);
  });

  test('typos fail loudly', () => {
    expect(() => buildBlocks(story, { before: [{ expression: 'Nope' }] }, refs)).toThrow(/unknown expression "Nope"/);
    expect(() => buildBlocks(story, { keyframes: [{ text: 'x', questionsAfter: ['¿Z?'] }] }, refs)).toThrow(/unknown question/);
    expect(() => buildBlocks(story, { after: ['flashcards'] }, refs)).toThrow(/exactly one "full_story"/);
    expect(() => buildBlocks(story, { later: [{ expression: 'Me llamo', story: 'S' }] }, refs)).toThrow(/cannot schedule a reappearance in itself/);
  });
});

describe('full run on an empty database (migrate + seed + verify)', () => {
  let scratch;
  const env = { ...process.env, DB_NAME: SEED_DB, MEDIA_FAKE_UPLOADS: '1' }; // the sample PDF is stored locally, never in Cloudinary
  const node = (script, ...args) => spawnSync('node', [path.join(BACKEND, 'src', 'db', script), ...args], { env, encoding: 'utf8' });
  const query = async (sql, replacements) => (await scratch.query(sql, { replacements }))[0];

  beforeAll(async () => {
    scratch = await createScratchDb(SEED_DB);
    expect(node('migrate.js', 'up').status).toBe(0);
  }, 60000);
  afterAll(async () => {
    const rows = await query('SELECT fileUrl FROM materials').catch(() => []);
    for (const row of rows) await require('../src/config/fakeUploads').removeFake(row.fileUrl);
    await dropScratchDb(SEED_DB, scratch);
  });

  test('seeds the course, one published revision per story and the curated plans', async () => {
    const result = node('seed.js');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const content = loadContent();
    const withPlan = [...content.stories].sort((a, b) => a.id - b.id).map(s => Boolean(s.plan));
    expect(result.stdout).toContain(`plans: 9 initial, ${withPlan.filter(Boolean).length} curated, 0 already current, 0 skipped`);

    expect((await query('SELECT COUNT(*) AS n FROM stories'))[0].n).toBe(9);
    expect((await query('SELECT COUNT(*) AS n FROM questions'))[0].n).toBe(content.stories.flatMap(s => s.questions).length);
    const published = await query("SELECT storyId, MAX(revision) AS latest FROM lesson_plans WHERE status = 'published' GROUP BY storyId ORDER BY storyId");
    expect(published.map(r => r.latest)).toEqual(withPlan.map(curated => (curated ? 2 : 1)));
    expect(await query("SELECT 1 FROM lesson_plans WHERE status = 'draft'")).toHaveLength(0);

    const maria = await query(`SELECT b.type, b.phase, b.vocabularyRole, b.revisitStoryId FROM lesson_blocks b JOIN lesson_plans p ON p.id = b.planId
      WHERE p.storyId = 1 AND p.revision = 2 ORDER BY b.position`);
    expect(maria.map(b => `${b.phase}:${b.type}`)).toEqual(['before:expression', 'before:expression', 'during:keyframe', 'during:question', 'during:keyframe',
      'during:question', 'during:keyframe', 'after:full_story', 'after:flashcards', 'later:expression']);
    expect(maria[9]).toMatchObject({ vocabularyRole: 'revisit', revisitStoryId: 2 });
    const first = await query(`SELECT v.word, b.vocabularyRole FROM lesson_blocks b JOIN lesson_plans p ON p.id = b.planId
      JOIN vocabulary v ON v.id = b.vocabularyId WHERE p.storyId = 2 AND p.revision = 2 AND b.type = 'expression' AND b.phase = 'before'`);
    expect(first).toContainEqual({ word: 'Me llamo', vocabularyRole: 'revisit' }); // "Me llamo" reappears in El Primer Día de Clase

    const { filePassword, accounts } = loadAccounts();
    const student = (await query('SELECT * FROM users WHERE email = ?', [accounts.find(a => a.role === 'student').email]))[0];
    expect(await bcrypt.compare(filePassword, student.password)).toBe(true);
    expect((await query('SELECT COUNT(*) AS n FROM enrollments WHERE studentId = ?', [student.id]))[0].n).toBe(1);
  }, 60000);

  test('accounts with "permissions" in the file get them on create and again on existing users', async () => {
    const { accounts } = loadAccounts();
    const withPermissions = accounts.find(a => a.permissions);
    expect(withPermissions).toMatchObject({ email: 'admin@gmail.com', permissions: ['users.manage', 'test_users.manage'] });
    const stored = async () => (await query('SELECT permissions FROM users WHERE email = ?', [withPermissions.email]))[0].permissions;
    expect(await stored()).toEqual(withPermissions.permissions);

    await scratch.query('UPDATE users SET permissions = NULL WHERE email = ?', { replacements: [withPermissions.email] });
    const rerun = node('seed.js', '--only', 'accounts');
    expect(rerun.status).toBe(0);
    expect(await stored()).toEqual(withPermissions.permissions);
    // accounts without the field are left alone
    const other = accounts.find(a => !a.permissions);
    expect((await query('SELECT permissions FROM users WHERE email = ?', [other.email]))[0].permissions).toBeNull();
  }, 60000);

  test('adds the phase 2 sample content to the demo course once: welcome video, 2 story videos, a PDF and a published quiz in unit 1', async () => {
    const [course] = await query('SELECT introVideoUrl FROM courses WHERE id = 1');
    expect(course.introVideoUrl).toBe('https://www.youtube-nocookie.com/embed/jNQXAC9IVRw');
    expect((await query('SELECT COUNT(*) AS n FROM stories WHERE videoUrl IS NOT NULL'))[0].n).toBe(2);
    expect((await query('SELECT COUNT(*) AS n FROM stories WHERE videoUrl IS NOT NULL AND unitId = 1'))[0].n).toBe(2);
    const quizzes = await query('SELECT id, unitId, isPublished, passingScore FROM unit_quizzes');
    expect(quizzes).toEqual([{ id: expect.any(Number), unitId: 1, isPublished: 1, passingScore: 70 }]);
    expect((await query('SELECT COUNT(*) AS n FROM unit_quiz_questions WHERE quizId = ?', [quizzes[0].id]))[0].n).toBe(3);
    const materials = await query('SELECT * FROM materials');
    expect(materials).toHaveLength(1);
    expect(materials[0]).toMatchObject({ courseId: 1, unitId: 1, storyId: null, providerPublicId: null });
    const file = path.join(require('../src/config/fakeUploads').DIR, path.basename(materials[0].fileUrl));
    expect(fs.readFileSync(file).subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(materials[0].sizeBytes).toBe(fs.statSync(file).size);
  }, 60000);

  test('the sample content is never added again or over what a teacher already has', async () => {
    const counts = () => query('SELECT (SELECT COUNT(*) FROM materials) AS m, (SELECT COUNT(*) FROM unit_quizzes) AS q, (SELECT COUNT(*) FROM unit_quiz_questions) AS qq');
    const before = await counts();
    await query("UPDATE courses SET introVideoUrl = 'https://player.vimeo.com/video/76979871' WHERE id = 1");
    const result = node('seed.js');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('nothing to add');
    expect(await counts()).toEqual(before);
    expect((await query('SELECT introVideoUrl FROM courses WHERE id = 1'))[0].introVideoUrl).toBe('https://player.vimeo.com/video/76979871');
    await query("UPDATE courses SET introVideoUrl = 'https://www.youtube-nocookie.com/embed/jNQXAC9IVRw' WHERE id = 1");
  }, 60000);

  test('running it again changes nothing', async () => {
    const before = await query('SELECT (SELECT COUNT(*) FROM lesson_plans) AS plans, (SELECT COUNT(*) FROM lesson_blocks) AS blocks, (SELECT COUNT(*) FROM users) AS users');
    const result = node('seed.js');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('plans: 0 initial, 0 curated, 9 already current, 0 skipped');
    expect(await query('SELECT (SELECT COUNT(*) FROM lesson_plans) AS plans, (SELECT COUNT(*) FROM lesson_blocks) AS blocks, (SELECT COUNT(*) FROM users) AS users')).toEqual(before);
  }, 60000);

  test('does not overwrite a lesson a teacher already curated, unless forced', async () => {
    await query("UPDATE lesson_blocks b JOIN lesson_plans p ON p.id = b.planId SET b.text = CONCAT(b.text, ' (edit)') WHERE p.storyId = 1 AND p.revision = 2 AND b.type = 'keyframe'");
    const kept = node('seed.js');
    expect(kept.stdout).toContain('NOT published');
    expect((await query("SELECT MAX(revision) AS r FROM lesson_plans WHERE storyId = 1 AND status = 'published'"))[0].r).toBe(2);
    const forced = node('seed.js', '--force-plans');
    expect(forced.stdout).toContain('revision 3 (curated plan) published');
  }, 60000);

  test('verify passes', () => {
    const result = node('verify.js');
    expect(result.stdout).toContain('All checks passed.');
    expect(result.status).toBe(0);
  });
});
