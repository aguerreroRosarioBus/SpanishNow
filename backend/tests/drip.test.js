// Drip content: the availability rule (days, fixed date, both), the 403 content_locked of every endpoint that serves unit
// content to a student, what the course payload shows, and that the teacher is never locked.
const { as, createWorld, createStory, standardBlocks, publishPlan, openLesson, visit } = require('./helpers/fixtures');
const { publish } = require('./helpers/sales');
const { unitAvailability, parseReleaseFields, assertUnitOpen, ContentLockedError, DAY_MS } = require('../src/services/unitAvailability');
const { Enrollment, Unit, Material, Tooltip, RepetitionActivity, LessonComment } = require('../src/models');

const T0 = new Date('2026-03-01T10:00:00.000Z');
const at = (_, extra = {}) => ({ releaseAfterDays: null, releaseAt: null, ...extra });
const enrolledAt = iso => ({ createdAt: new Date(iso) });

describe('unitAvailability (the rule)', () => {
  test('a unit without rules is always open and has no date', () => {
    expect(unitAvailability(at(), enrolledAt('2026-03-01T10:00:00Z'), T0)).toEqual({ locked: false, availableAt: null });
    expect(unitAvailability({}, null, T0)).toEqual({ locked: false, availableAt: null });
  });

  test('releaseAfterDays: opens exactly N x 24 h after the enrolment (UTC), 0 means at once', () => {
    const enrollment = enrolledAt('2026-03-01T10:00:00Z');
    const unit = at(null, { releaseAfterDays: 7 });
    const opens = new Date('2026-03-08T10:00:00.000Z');
    expect(unitAvailability(unit, enrollment, new Date(opens.getTime() - 1))).toEqual({ locked: true, availableAt: opens });
    expect(unitAvailability(unit, enrollment, opens)).toEqual({ locked: false, availableAt: null });
    expect(unitAvailability(unit, enrollment, new Date(opens.getTime() + 1))).toEqual({ locked: false, availableAt: null });
    expect(unitAvailability(at(null, { releaseAfterDays: 0 }), enrollment, T0).locked).toBe(false);
    expect(opens.getTime() - new Date(enrollment.createdAt).getTime()).toBe(7 * DAY_MS);
  });

  test('releaseAt: opens at that instant for everybody, whatever the enrolment date', () => {
    const unit = at(null, { releaseAt: '2026-04-01' }); // a calendar date: opens at 00:00 UTC
    expect(unitAvailability(unit, enrolledAt('2020-01-01T00:00:00Z'), T0)).toEqual({ locked: true, availableAt: new Date('2026-04-01T00:00:00.000Z') });
    expect(unitAvailability(unit, enrolledAt('2026-02-01T00:00:00Z'), new Date('2026-04-01T00:00:00.000Z')).locked).toBe(false);
  });

  test('both rules: it opens when BOTH are met (the later one)', () => {
    const enrollment = enrolledAt('2026-03-01T10:00:00Z'); // +10 days = 2026-03-11T10:00Z
    const dateFirst = at(null, { releaseAfterDays: 10, releaseAt: '2026-03-05' });
    const daysFirst = at(null, { releaseAfterDays: 2, releaseAt: '2026-03-20' });
    expect(unitAvailability(dateFirst, enrollment, new Date('2026-03-06T00:00:00Z'))).toEqual({ locked: true, availableAt: new Date('2026-03-11T10:00:00Z') });
    expect(unitAvailability(dateFirst, enrollment, new Date('2026-03-11T10:00:00Z')).locked).toBe(false);
    expect(unitAvailability(daysFirst, enrollment, new Date('2026-03-10T00:00:00Z'))).toEqual({ locked: true, availableAt: new Date('2026-03-20T00:00:00Z') });
    expect(unitAvailability(daysFirst, enrollment, new Date('2026-03-20T00:00:00Z')).locked).toBe(false);
  });

  test('a days rule without an enrolment fails closed', () => {
    expect(unitAvailability(at(null, { releaseAfterDays: 3 }), null, T0)).toEqual({ locked: true, availableAt: null });
  });

  test('the teacher is never locked; ContentLockedError carries the contract fields', async () => {
    const closed = { courseId: 1, releaseAt: new Date(Date.now() + 10 * DAY_MS).toISOString().slice(0, 10) };
    await expect(assertUnitOpen({ id: 1, role: 'teacher' }, closed)).resolves.toBeUndefined();
    await expect(assertUnitOpen({ id: 2, role: 'student' }, closed, { enrollment: enrolledAt('2026-01-01T00:00:00Z') })).rejects.toMatchObject({
      status: 403, code: 'content_locked', availableAt: new Date(`${closed.releaseAt}T00:00:00.000Z`).toISOString()
    });
    expect(new ContentLockedError(null).availableAt).toBeNull();
  });

  test('parseReleaseFields: integers 0-3650, dates as YYYY-MM-DD (00:00 UTC) or ISO, null/blank clears, absent is untouched', () => {
    expect(parseReleaseFields({})).toEqual({ values: {} });
    expect(parseReleaseFields({ releaseAfterDays: 0 })).toEqual({ values: { releaseAfterDays: 0 } });
    expect(parseReleaseFields({ releaseAfterDays: '3650' })).toEqual({ values: { releaseAfterDays: 3650 } });
    expect(parseReleaseFields({ releaseAfterDays: null, releaseAt: null })).toEqual({ values: { releaseAfterDays: null, releaseAt: null } });
    expect(parseReleaseFields({ releaseAt: '' }).values.releaseAt).toBeNull();
    expect(parseReleaseFields({ releaseAt: '2026-12-31' }).values.releaseAt).toBe('2026-12-31');
    expect(parseReleaseFields({ releaseAt: '2026-12-31T23:30:00-03:00' }).values.releaseAt).toBe('2027-01-01'); // reduced to its UTC date
    for (const bad of [-1, 3651, 1.5, 'x', '1e3', true]) expect(parseReleaseFields({ releaseAfterDays: bad }).error).toMatch(/releaseAfterDays/);
    for (const bad of ['nope', '1999-01-01', '2300-01-01', { a: 1 }, 12345]) expect(parseReleaseFields({ releaseAt: bad }).error).toMatch(/releaseAt/);
  });
});

describe('drip content over HTTP', () => {
  let world; let lesson; let story; let q1; let keys; let unitMaterial; let storyMaterial; let courseMaterial; let quizUrl; let tooltip; let comment;
  const ymd = date => date.toISOString().slice(0, 10);
  // releaseAt is a calendar date: the unit opens at 00:00 UTC of that day
  const future = () => ymd(new Date(Date.now() + 5 * DAY_MS));
  const startOf = day => new Date(`${day}T00:00:00.000Z`);
  const lockUnit = values => world.unit.update({ releaseAfterDays: null, releaseAt: null, ...values });
  const setEnrolledAt = (enrollment, date) => require('../src/config/database').query('UPDATE enrollments SET createdAt = ? WHERE id = ?', { replacements: [date, enrollment.id] });
  const lockedBody = res => ({ status: res.status, code: res.body.code, availableAt: res.body.availableAt });

  beforeAll(async () => {
    world = await createWorld();
    await publish(world.course);
    const content = await createStory(world);
    story = content.story;
    q1 = content.q1;
    const plan = standardBlocks({ vocab: world.vocab, ...content });
    keys = plan.keys;
    await publishPlan(world.teacher, story.id, plan.blocks);
    lesson = (await openLesson(world.student, story.id)).body; // progress exists from before the unit closes
    await RepetitionActivity.create({ storyId: story.id, phrase: 'Me llamo María', order: 0 });
    tooltip = await Tooltip.create({ targetType: 'story', targetId: story.id, startOffset: 0, endOffset: 5, selectedText: 'Texto', tooltipContent: 'Text', createdBy: world.teacher.id });
    const material = values => Material.create({ courseId: world.course.id, title: 'PDF', fileUrl: 'http://localhost/uploads-dev/x.pdf', sizeBytes: 10, ...values });
    unitMaterial = await material({ unitId: world.unit.id });
    storyMaterial = await material({ storyId: story.id });
    courseMaterial = await material({});
    quizUrl = `/api/units/${world.unit.id}/quiz`;
    const put = await as(world.teacher).put(quizUrl, { title: 'Quiz', passingScore: 50, isPublished: true, questions: [{ prompt: 'P', options: ['a', 'b'], correctIndex: 0 }] });
    expect(put.status).toBe(200);
    comment = await LessonComment.create({ storyId: story.id, userId: world.student.id, body: 'Mi pregunta' });
  });
  afterAll(async () => { await lockUnit({}); });

  // Every endpoint that gives a student content of a unit. [label, who, request]
  const sweep = () => {
    const p = lesson.progress.id;
    const question = lesson.blocks.find(b => b.blockKey === keys.q1);
    return [
      ['GET lesson plan', s => as(s).get(`/api/lesson-plans/story/${story.id}`)],
      ['PUT current block', s => as(s).put(`/api/lesson-plans/progress/${p}/current-block`, { blockKey: keys.exp })],
      ['POST answer', s => as(s).post(`/api/lesson-plans/progress/${p}/answers`, { blockKey: keys.q1, questionId: question.questionId, studentAnswer: 'En la fiesta' })],
      ['POST complete narrative', s => as(s).post(`/api/lesson-plans/progress/${p}/complete-narrative`, {})],
      ['PUT reinforcement', s => as(s).put(`/api/lesson-plans/progress/${p}/reinforcements/${keys.flash}`, { completed: true })],
      ['GET unit material download', s => as(s).get(`/api/materials/${unitMaterial.id}/download-url`)],
      ['GET story material download', s => as(s).get(`/api/materials/${storyMaterial.id}/download-url`)],
      ['GET unit quiz', s => as(s).get(`${quizUrl}/student`)],
      ['POST quiz attempt', s => as(s).post(`${quizUrl}/attempts`, { answers: [0] })],
      ['GET comments', s => as(s).get(`/api/stories/${story.id}/comments`)],
      ['POST comment', s => as(s).post(`/api/stories/${story.id}/comments`, { body: 'Hola' })],
      ['PUT comment', s => as(s).put(`/api/comments/${comment.id}`, { body: 'Editada' })],
      ['GET story', s => as(s).get(`/api/stories/${story.id}`)],
      ['GET unit', s => as(s).get(`/api/units/${world.unit.id}`)],
      ['GET questions of the story', s => as(s).get(`/api/questions/story/${story.id}`)],
      ['GET vocabulary of the unit', s => as(s).get(`/api/vocabulary/unit/${world.unit.id}`)],
      ['GET repetition activities', s => as(s).get(`/api/repetition-activities/story/${story.id}`)],
      ['GET story tooltips', s => as(s).get(`/api/tooltips/story/${story.id}`)],
      ['GET question tooltips', s => as(s).get(`/api/tooltips/question/${q1.id}`)]
    ];
  };
  const studentOnly = new Set(['GET lesson plan', 'PUT current block', 'POST answer', 'POST complete narrative', 'PUT reinforcement', 'POST quiz attempt', 'PUT comment']);

  test('while the unit is closed (fixed date) EVERY content endpoint answers 403 content_locked with availableAt; nothing is created', async () => {
    const day = future();
    const opens = startOf(day);
    await lockUnit({ releaseAt: day });
    const progressBefore = await require('../src/models').LessonProgress.count({ where: { enrollmentId: world.enrollments.student.id } });
    const commentsBefore = await LessonComment.count({ where: { storyId: story.id } });
    const results = {};
    for (const [label, call] of sweep()) results[label] = lockedBody(await call(world.student));
    for (const label of Object.keys(results)) expect([label, results[label]]).toEqual([label, { status: 403, code: 'content_locked', availableAt: opens.toISOString() }]);
    expect(Object.keys(results)).toHaveLength(sweep().length);
    expect(await LessonComment.count({ where: { storyId: story.id } })).toBe(commentsBefore);
    expect(await require('../src/models').LessonProgress.count({ where: { enrollmentId: world.enrollments.student.id } })).toBe(progressBefore);
  });

  test('a student with no progress yet cannot start a closed lesson (no progress row is created)', async () => {
    await lockUnit({ releaseAt: future() });
    const { LessonProgress } = require('../src/models');
    const res = await openLesson(world.student2, story.id);
    expect([res.status, res.body.code]).toEqual([403, 'content_locked']);
    expect(await LessonProgress.count({ where: { enrollmentId: world.enrollments.student2.id } })).toBe(0);
  });

  test('releaseAfterDays: closed until N days after THAT student enrolled, per enrolment; the date is the later of both rules', async () => {
    await lockUnit({ releaseAfterDays: 3 });
    const enrollment = await world.enrollments.student.reload(); // MySQL keeps seconds
    const opens = new Date(new Date(enrollment.createdAt).getTime() + 3 * DAY_MS);
    const res = await as(world.student).get(`/api/vocabulary/unit/${world.unit.id}`);
    expect(lockedBody(res)).toEqual({ status: 403, code: 'content_locked', availableAt: opens.toISOString() });

    await setEnrolledAt(enrollment, new Date(Date.now() - 4 * DAY_MS)); // enrolled 4 days ago
    expect((await as(world.student).get(`/api/vocabulary/unit/${world.unit.id}`)).status).toBe(200);
    expect((await as(world.student2).get(`/api/vocabulary/unit/${world.unit.id}`)).status).toBe(403); // enrolled just now

    const later = future();
    await lockUnit({ releaseAfterDays: 3, releaseAt: later }); // days met, date not yet
    expect(lockedBody(await as(world.student).get(`/api/vocabulary/unit/${world.unit.id}`)).availableAt).toBe(startOf(later).toISOString());
    await setEnrolledAt(enrollment, new Date());
  });

  test('the teacher of the course is never locked, anywhere', async () => {
    await lockUnit({ releaseAt: future(), releaseAfterDays: 30 });
    for (const [label, call] of sweep()) {
      if (studentOnly.has(label)) continue;
      const res = await call(world.teacher);
      expect([label, res.body.code]).toEqual([label, undefined]);
      expect([label, res.status === 403]).toEqual([label, false]);
    }
    const course = await as(world.teacher).get(`/api/courses/${world.course.id}`);
    expect(course.body.units[0]).toMatchObject({ locked: false, availableAt: null });
    expect(course.body.units[0].stories[0].text).toBeDefined();
  });

  test('course-level PDFs and the welcome video are never locked', async () => {
    await lockUnit({ releaseAt: future() });
    const res = await as(world.student).get(`/api/materials/${courseMaterial.id}/download-url`);
    expect(res.status).toBe(200);
    await world.course.update({ introVideoUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' });
    const course = await as(world.student).get(`/api/courses/${world.course.id}`);
    expect(course.status).toBe(200);
    expect(course.body.introVideoUrl).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(course.body.materials.map(m => m.id)).toContain(courseMaterial.id);
  });

  test('GET /courses/:id lists a closed unit: title and order of its stories, no content; locked + availableAt', async () => {
    const day = future();
    const opens = startOf(day);
    await lockUnit({ releaseAt: day });
    const res = await as(world.student).get(`/api/courses/${world.course.id}`);
    expect(res.status).toBe(200);
    const unit = res.body.units.find(u => u.id === world.unit.id);
    expect(unit).toMatchObject({ locked: true, availableAt: opens.toISOString(), materials: [], quiz: null });
    expect(unit.stories.length).toBeGreaterThan(0);
    for (const s of unit.stories) {
      expect(Object.keys(s).sort()).toEqual(['commentCount', 'hasLessonPlan', 'id', 'lessonStatus', 'materials', 'order', 'questions', 'repetitionActivities', 'title', 'unitId']);
      expect(s).toMatchObject({ materials: [], questions: [], repetitionActivities: [], commentCount: 0 });
    }
    expect(JSON.stringify(res.body)).not.toContain('Texto original de la historia');
    expect(JSON.stringify(res.body)).not.toContain('uploads-dev');
  });

  test('GET /enrollments/my-courses strips closed units too', async () => {
    await lockUnit({ releaseAt: future() });
    const res = await as(world.student).get('/api/enrollments/my-courses');
    const unit = res.body.find(e => e.courseId === world.course.id).course.units.find(u => u.id === world.unit.id);
    expect(unit.locked).toBe(true);
    expect(unit.stories.every(s => Object.keys(s).sort().join() === 'id,order,title,unitId')).toBe(true);
  });

  test('once the date passes everything opens again and the course payload says locked: false', async () => {
    await lockUnit({ releaseAt: ymd(new Date(Date.now() - DAY_MS)) });
    for (const [label, call] of sweep()) {
      if (studentOnly.has(label)) continue;
      const res = await call(world.student);
      expect([label, res.body.code]).toEqual([label, undefined]);
      expect([label, res.status]).toEqual([label, label === 'POST comment' ? 201 : 200]);
    }
    const course = await as(world.student).get(`/api/courses/${world.course.id}`);
    expect(course.body.units[0]).toMatchObject({ locked: false, availableAt: null });
    expect(course.body.units[0].stories[0].text).toBeDefined();
    // and the student endpoints that need state work again too
    expect((await visit(world.student, lesson.progress.id, keys.exp)).status).toBe(200);
  });

  test('another student unit still open is unaffected (the rule is per unit)', async () => {
    const other = await Unit.create({ courseId: world.course.id, title: 'Unidad 2', order: 1 });
    await lockUnit({ releaseAt: future() });
    expect((await as(world.student).get(`/api/vocabulary/unit/${other.id}`)).status).toBe(200);
    expect((await as(world.student).get(`/api/vocabulary/unit/${world.unit.id}`)).status).toBe(403);
  });

  describe('PUT /units/:id and the public page', () => {
    afterEach(() => lockUnit({}));
    test('the teacher sets and removes the rules; invalid values are 400; another teacher is 403', async () => {
      const url = `/api/units/${world.unit.id}`;
      const ok = await as(world.teacher).put(url, { releaseAfterDays: 7, releaseAt: '2026-12-31' });
      expect([ok.status, ok.body.releaseAfterDays, ok.body.releaseAt]).toEqual([200, 7, '2026-12-31']);
      expect((await as(world.teacher).put(url, { title: 'Solo título' })).body).toMatchObject({ releaseAfterDays: 7, releaseAt: '2026-12-31' });
      const cleared = await as(world.teacher).put(url, { releaseAfterDays: null, releaseAt: null });
      expect(cleared.body).toMatchObject({ releaseAfterDays: null, releaseAt: null });
      for (const body of [{ releaseAfterDays: -1 }, { releaseAfterDays: 4000 }, { releaseAfterDays: 'abc' }, { releaseAt: 'mañana' }]) {
        expect((await as(world.teacher).put(url, body)).status).toBe(400);
      }
      expect((await as(world.otherTeacher).put(url, { releaseAfterDays: 1 })).status).toBe(403);
      expect((await world.unit.reload()).releaseAfterDays).toBeNull();
    });

    test('GET /public/courses/:slug shows releaseAfterDays per unit and nothing else of the rule', async () => {
      await world.unit.update({ releaseAfterDays: 14, releaseAt: '2027-01-01' });
      const res = await as(null).get(`/api/public/courses/${world.course.slug}`);
      expect(res.status).toBe(200);
      expect(res.body.units[0].releaseAfterDays).toBe(14);
      expect(res.body.units[0]).not.toHaveProperty('releaseAt');
    });
  });
});
