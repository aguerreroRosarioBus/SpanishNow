// Lesson comments: permissions, plain-text sanitizing, one level of replies, hidden, edit/delete, paging, hourly limit,
// teacher inbox, per-story counts and the e-mails (sent after the response, never blocking it).
const { randomUUID } = require('crypto');
const { LessonComment, Story, Unit, Enrollment } = require('../src/models');
const { sanitizeBody, MAX_BODY } = require('../src/services/commentService');
const { clearOutbox, getOutbox } = require('../src/services/mailService');
const { as, createUser, createWorld, createStory } = require('./helpers/fixtures');
const { mailsTo, waitFor } = require('./helpers/sales');

describe('lesson comments', () => {
  let world; let story; let url;
  const post = (user, body, parentId, target = story) => as(user).post(`/api/stories/${target.id}/comments`, { body, ...(parentId ? { parentId } : {}) });
  const list = (user, query = '', target = story) => as(user).get(`/api/stories/${target.id}/comments${query}`);
  const seed = (user, body = 'Una pregunta', values = {}) => LessonComment.create({ storyId: story.id, userId: user.id, body, ...values });

  beforeAll(async () => {
    world = await createWorld();
    story = (await createStory(world)).story;
    url = `/api/stories/${story.id}/comments`;
  });
  // The tests share users; the hourly limit (tested on its own below, with fresh users) must not leak between them.
  beforeEach(async () => {
    clearOutbox();
    await require('../src/config/database').query('UPDATE lesson_comments SET createdAt = createdAt - INTERVAL 3 HOUR WHERE userId IN (?) AND createdAt > NOW() - INTERVAL 2 HOUR',
      { replacements: [[world.student.id, world.student2.id, world.teacher.id]] });
  });

  describe('sanitizing', () => {
    test('plain text: tags and comments removed, control and bidi characters removed, line breaks normalized, trimmed', () => {
      expect(sanitizeBody('  Hola <b>mundo</b> <script>alert(1)</script>  ').value).toBe('Hola mundo alert(1)');
      expect(sanitizeBody('a<!-- oculto -->b').value).toBe('ab');
      expect(sanitizeBody('<img src=x onerror=alert(1)>texto').value).toBe('texto');
      expect(sanitizeBody('x < y y > z, 1<3').value).toBe('x < y y > z, 1<3'); // not tags: kept
      expect(sanitizeBody('uno\r\ndos\rtres\n\n\n\ncuatro').value).toBe('uno\ndos\ntres\n\ncuatro');
      expect(sanitizeBody('a\u0000b\u0007c‮d​e﻿').value).toBe('abcde');
      expect(sanitizeBody('a\tb').value).toBe('a b');
      expect(sanitizeBody('😀'.repeat(MAX_BODY)).value).toHaveLength(MAX_BODY * 2); // counted in characters, not UTF-16 units
    });

    test('1 to 2000 characters after trimming; text only', () => {
      for (const bad of ['', '   ', '\n\t', '<b></b>', 'x'.repeat(MAX_BODY + 1), 5, null, undefined, ['a'], { a: 1 }]) expect(sanitizeBody(bad).error).toMatch(/body/);
      expect(sanitizeBody('x'.repeat(MAX_BODY)).value).toHaveLength(MAX_BODY);
      expect(sanitizeBody(`  ${'x'.repeat(MAX_BODY)}  `).value).toHaveLength(MAX_BODY);
    });
  });

  describe('who can read and write', () => {
    test('anonymous 401; unknown or malformed story 404', async () => {
      expect((await as(null).get(url)).status).toBe(401);
      expect((await as(null).post(url, { body: 'x' })).status).toBe(401);
      expect((await as(world.student).get('/api/stories/99999999/comments')).status).toBe(404);
      expect((await as(world.student).get('/api/stories/abc/comments')).status).toBe(404);
      expect((await as(world.student).post('/api/stories/abc/comments', { body: 'x' })).status).toBe(404);
    });

    test('enrolled students and the owner teacher read and write; an outsider, a student of another course and another teacher get 403', async () => {
      expect((await list(world.student)).status).toBe(200);
      expect((await list(world.teacher)).status).toBe(200);
      expect((await post(world.student, 'Hola desde el alumno')).status).toBe(201);
      expect((await post(world.teacher, 'Hola desde el docente')).status).toBe(201);
      for (const user of [world.outsider, world.otherTeacher]) {
        expect([user.role, (await list(user)).status]).toEqual([user.role, 403]);
        expect([user.role, (await post(user, 'No debería')).status]).toEqual([user.role, 403]);
      }
      // a student of ANOTHER course reading this lesson, and this course's student reading a foreign lesson
      expect((await list(world.student, '', world.foreignStory)).status).toBe(403);
      expect((await post(world.student, 'x', null, world.foreignStory)).status).toBe(403);
      expect((await list(world.otherTeacher, '', world.foreignStory)).status).toBe(200);
    });
  });

  describe('writing', () => {
    test('201 with the comment as the client sees it; the body is stored sanitized', async () => {
      const res = await post(world.student, ' <b>Hola</b>\r\n¿Cómo estás? ');
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        body: 'Hola\n¿Cómo estás?', parentId: null, hidden: false, editedAt: null, replies: [], canEdit: true, canDelete: true,
        author: { id: world.student.id, name: world.student.name, isTeacher: false }
      });
      expect(Object.keys(res.body.author).sort()).toEqual(['id', 'isTeacher', 'name']);
      expect((await LessonComment.findByPk(res.body.id)).body).toBe('Hola\n¿Cómo estás?');
      const byTeacher = await post(world.teacher, 'Respuesta');
      expect(byTeacher.body.author).toMatchObject({ id: world.teacher.id, isTeacher: true });
    });

    test('validation: empty, too long and non-text bodies are 400 and save nothing', async () => {
      const before = await LessonComment.count({ where: { storyId: story.id } });
      for (const body of ['', '   ', 'x'.repeat(2001), 5, null, '<i></i>']) expect([JSON.stringify(body).slice(0, 12), (await post(world.student, body)).status]).toEqual([JSON.stringify(body).slice(0, 12), 400]);
      expect((await as(world.student).post(url, {})).status).toBe(400);
      expect((await post(world.student, 'x'.repeat(2000))).status).toBe(201);
      expect(await LessonComment.count({ where: { storyId: story.id } })).toBe(before + 1);
    });

    test('replies have one level: parent must be a first-level comment of the same story', async () => {
      const parent = (await post(world.student, 'Pregunta')).body;
      const reply = await post(world.student2, 'Respuesta de un compañero', parent.id);
      expect(reply.status).toBe(201);
      expect(reply.body.parentId).toBe(parent.id);
      expect((await post(world.student, 'Respuesta a una respuesta', reply.body.id)).status).toBe(400);
      expect((await post(world.student, 'x', 99999999)).status).toBe(404);
      expect((await post(world.student, 'x', 'abc')).status).toBe(400);
      const other = (await createStory(world)).story;
      expect((await post(world.student, 'Otro story', parent.id, other)).status).toBe(404); // the parent belongs to another lesson
    });
  });

  describe('listing', () => {
    let s2; let target;
    beforeAll(async () => { target = (await createStory(world)).story; s2 = target; });
    const mine = (user, body = 'c', values = {}) => LessonComment.create({ storyId: s2.id, userId: user.id, body, ...values });

    test('newest first, replies oldest first, 20 per page with the total; author, isTeacher, canEdit and canDelete per viewer', async () => {
      const first = await mine(world.student, 'primera');
      await new Promise(r => setTimeout(r, 1100)); // MySQL keeps seconds
      const second = await mine(world.student2, 'segunda');
      const r1 = await LessonComment.create({ storyId: s2.id, userId: world.teacher.id, parentId: first.id, body: 'resp docente' });
      const r2 = await LessonComment.create({ storyId: s2.id, userId: world.student.id, parentId: first.id, body: 'resp alumno', createdAt: new Date(Date.now() + 2000) });

      const asStudent = (await list(world.student, '', s2)).body;
      expect(asStudent.total).toBe(2);
      expect(asStudent.rows.map(r => r.id)).toEqual([second.id, first.id]);
      expect(asStudent.rows[1].replies.map(r => r.id)).toEqual([r1.id, r2.id]);
      expect(asStudent.rows[1].replies[0].author).toMatchObject({ id: world.teacher.id, isTeacher: true });
      expect(asStudent.rows[1]).toMatchObject({ canEdit: true, canDelete: true, author: { isTeacher: false } });
      expect(asStudent.rows[0]).toMatchObject({ canEdit: false, canDelete: false });
      expect(asStudent.rows[1].replies.map(r => [r.canEdit, r.canDelete])).toEqual([[false, false], [true, true]]);
      const asTeacher = (await list(world.teacher, '', s2)).body;
      expect(asTeacher.rows[0]).toMatchObject({ canEdit: false, canDelete: true });
      expect(asTeacher.rows[1].replies.map(r => [r.canEdit, r.canDelete])).toEqual([[true, true], [false, true]]);
    });

    test('pages of 20', async () => {
      const paged = (await createStory(world)).story;
      await LessonComment.bulkCreate(Array.from({ length: 25 }, (_, i) => ({ storyId: paged.id, userId: world.student.id, body: `c${i}`, createdAt: new Date(Date.now() - i * 1000) })));
      const one = (await list(world.student, '', paged)).body;
      const two = (await list(world.student, '?page=2', paged)).body;
      expect([one.rows.length, one.total, two.rows.length, two.total]).toEqual([20, 25, 5, 25]);
      expect(new Set([...one.rows, ...two.rows].map(r => r.id)).size).toBe(25);
      expect((await list(world.student, '?page=0', paged)).body.rows).toHaveLength(20);
      expect((await list(world.student, '?page=abc', paged)).body.rows).toHaveLength(20);
      expect((await list(world.student, '?page=9', paged)).body.rows).toHaveLength(0);
    });
  });

  describe('hidden', () => {
    let hiddenStory; let c; let reply;
    beforeAll(async () => {
      hiddenStory = (await createStory(world)).story;
      c = await LessonComment.create({ storyId: hiddenStory.id, userId: world.student.id, body: 'Pregunta a ocultar' });
      reply = await LessonComment.create({ storyId: hiddenStory.id, userId: world.teacher.id, parentId: c.id, body: 'Respuesta' });
    });
    const ids = res => res.body.rows.map(r => r.id);

    test('only the teacher of the course can hide; the value must be boolean', async () => {
      const hide = (user, body) => as(user).put(`/api/comments/${c.id}/hidden`, body);
      expect((await hide(world.student, { hidden: true })).status).toBe(403);
      expect((await hide(world.otherTeacher, { hidden: true })).status).toBe(403);
      expect((await hide(null, { hidden: true })).status).toBe(401);
      for (const bad of [{}, { hidden: 'true' }, { hidden: 1 }]) expect((await hide(world.teacher, bad)).status).toBe(400);
      expect((await as(world.teacher).put('/api/comments/99999999/hidden', { hidden: true })).status).toBe(404);
    });

    test('hidden: invisible to other students (thread included), visible and marked to its author and to the teacher; unhide restores', async () => {
      const res = await as(world.teacher).put(`/api/comments/${c.id}/hidden`, { hidden: true });
      expect([res.status, res.body.hidden]).toEqual([200, true]);
      expect(ids(await list(world.student2, '', hiddenStory))).not.toContain(c.id);
      expect((await list(world.student2, '', hiddenStory)).body.total).toBe(0);
      const own = await list(world.student, '', hiddenStory);
      expect(own.body.rows.find(r => r.id === c.id)).toMatchObject({ hidden: true });
      expect(own.body.rows.find(r => r.id === c.id).replies.map(r => r.id)).toEqual([reply.id]);
      expect(ids(await list(world.teacher, '', hiddenStory))).toContain(c.id);
      // nobody can reply to a comment they cannot see
      expect((await post(world.student2, 'x', c.id, hiddenStory)).status).toBe(404);
      expect((await post(world.teacher, 'x', c.id, hiddenStory)).status).toBe(201);

      expect((await as(world.teacher).put(`/api/comments/${c.id}/hidden`, { hidden: false })).body.hidden).toBe(false);
      expect(ids(await list(world.student2, '', hiddenStory))).toContain(c.id);
    });

    test('a hidden reply is hidden only for others; hidden comments do not count for students in commentCount but do for the teacher', async () => {
      const s = (await createStory(world)).story;
      const q = await LessonComment.create({ storyId: s.id, userId: world.student.id, body: 'q' });
      const hiddenReply = await LessonComment.create({ storyId: s.id, userId: world.student2.id, parentId: q.id, body: 'oculta', hidden: true });
      expect((await list(world.student, '', s)).body.rows[0].replies).toHaveLength(0);
      expect((await list(world.student2, '', s)).body.rows[0].replies[0]).toMatchObject({ id: hiddenReply.id, hidden: true });
      const count = async user => (await as(user).get(`/api/courses/${world.course.id}`)).body.units[0].stories.find(x => x.id === s.id).commentCount;
      expect([await count(world.student), await count(world.teacher)]).toEqual([1, 2]);
    });
  });

  describe('edit and delete', () => {
    test('only the author edits; editedAt is set only when the text changes; the text is sanitized again', async () => {
      const c = (await post(world.student, 'Original')).body;
      expect((await as(world.teacher).put(`/api/comments/${c.id}`, { body: 'Del docente' })).status).toBe(403);
      expect((await as(world.student2).put(`/api/comments/${c.id}`, { body: 'Ajeno' })).status).toBe(403);
      expect((await as(world.otherTeacher).put(`/api/comments/${c.id}`, { body: 'Otro' })).status).toBe(403);
      expect((await as(null).put(`/api/comments/${c.id}`, { body: 'x' })).status).toBe(401);
      expect((await as(world.student).put(`/api/comments/${c.id}`, { body: '  ' })).status).toBe(400);
      expect((await as(world.student).put('/api/comments/99999999', { body: 'x' })).status).toBe(404);
      expect((await as(world.student).put('/api/comments/abc', { body: 'x' })).status).toBe(404);

      const same = await as(world.student).put(`/api/comments/${c.id}`, { body: 'Original' });
      expect([same.status, same.body.editedAt]).toEqual([200, null]);
      const edited = await as(world.student).put(`/api/comments/${c.id}`, { body: ' Editado <u>ok</u> ' });
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ id: c.id, body: 'Editado ok', canEdit: true });
      expect(edited.body.editedAt).not.toBeNull();
      expect((await LessonComment.findByPk(c.id)).body).toBe('Editado ok');
    });

    test('a student who lost the enrolment can no longer edit', async () => {
      const s = await createUser('student', 'left');
      const enrollment = await Enrollment.create({ studentId: s.id, courseId: world.course.id });
      const c = (await post(s, 'Antes de irme')).body;
      await enrollment.destroy();
      expect((await as(s).put(`/api/comments/${c.id}`, { body: 'Después' })).status).toBe(403);
      expect((await as(s).delete(`/api/comments/${c.id}`)).status).toBe(204); // but can still remove their own text
    });

    test('delete: the author or the teacher of the course (204); anybody else 403; deleting a first-level comment deletes its replies', async () => {
      const parent = (await post(world.student, 'Padre')).body;
      const reply = (await post(world.student2, 'Hija', parent.id)).body;
      expect((await as(world.student2).delete(`/api/comments/${parent.id}`)).status).toBe(403);
      expect((await as(world.otherTeacher).delete(`/api/comments/${parent.id}`)).status).toBe(403);
      expect((await as(world.outsider).delete(`/api/comments/${parent.id}`)).status).toBe(403);
      expect((await as(null).delete(`/api/comments/${parent.id}`)).status).toBe(401);
      expect((await as(world.student).delete(`/api/comments/${reply.id}`)).status).toBe(403); // the reply is not theirs
      expect((await as(world.teacher).delete(`/api/comments/${parent.id}`)).status).toBe(204);
      expect(await LessonComment.findByPk(parent.id)).toBeNull();
      expect(await LessonComment.findByPk(reply.id)).toBeNull();
      expect((await as(world.teacher).delete(`/api/comments/${parent.id}`)).status).toBe(404);

      const own = (await post(world.student, 'Mío')).body;
      const ownReply = (await post(world.student2, 'Mía', own.id)).body;
      expect((await as(world.student2).delete(`/api/comments/${ownReply.id}`)).status).toBe(204);
      expect(await LessonComment.findByPk(own.id)).not.toBeNull();
    });
  });

  describe('limit of 10 per user per hour', () => {
    test('the 11th comment of an hour is 429 { code: rate_limited }; older ones, edits and other users do not count', async () => {
      const user = await createUser('student', 'chatty');
      await Enrollment.create({ studentId: user.id, courseId: world.course.id });
      await LessonComment.bulkCreate(Array.from({ length: 3 }, () => ({ storyId: story.id, userId: user.id, body: 'viejo', createdAt: new Date(Date.now() - 2 * 3600000) })));
      for (let i = 0; i < 10; i++) expect([i, (await post(user, `c${i}`)).status]).toEqual([i, 201]);
      const blocked = await post(user, 'once');
      expect(blocked.status).toBe(429);
      expect(blocked.body).toEqual({ error: expect.any(String), code: 'rate_limited' });
      expect(await LessonComment.count({ where: { userId: user.id } })).toBe(13);
      expect((await post(world.student2, 'otro usuario')).status).toBe(201);
      const mine = (await list(user)).body.rows.find(r => r.canEdit);
      expect((await as(user).put(`/api/comments/${mine.id}`, { body: 'editar no cuenta' })).status).toBe(200);
      // the window slides: once the 10 are older than an hour, the user can write again
      await LessonComment.update({ createdAt: new Date(Date.now() - 3700000) }, { where: { userId: user.id }, silent: true });
      expect((await post(user, 'de nuevo')).status).toBe(201);
    });

    test('the teacher of the course is exempt: 12 comments in a row all work', async () => {
      const t = await createUser('teacher', 'unlimited');
      const { Course, Unit: U, Story: S } = require('../src/models');
      const c = await Course.create({ title: 'Curso docente', description: 'd', level: 'A1', teacherId: t.id });
      const u = await U.create({ courseId: c.id, title: 'U', order: 0 });
      const st = await S.create({ unitId: u.id, title: 'L', text: 't', order: 0 });
      for (let i = 0; i < 12; i++) expect([i, (await post(t, `d${i}`, null, st)).status]).toEqual([i, 201]);
      expect(await LessonComment.count({ where: { userId: t.id } })).toBe(12);
    });

    test('concurrent requests cannot exceed the limit', async () => {
      const user = await createUser('student', 'racer');
      await Enrollment.create({ studentId: user.id, courseId: world.course.id });
      const results = await Promise.all(Array.from({ length: 14 }, (_, i) => post(user, `r${i}`)));
      const statuses = results.map(r => r.status);
      expect(statuses.filter(s => s === 201)).toHaveLength(10);
      expect(statuses.filter(s => s === 429)).toHaveLength(4);
      expect(await LessonComment.count({ where: { userId: user.id } })).toBe(10);
    });
  });

  describe('teacher inbox', () => {
    let t; let course2; let st; let st2; let foreignComment;
    const inbox = (user, query = '') => as(user).get(`/api/teacher/comments${query}`);
    beforeAll(async () => {
      t = await createUser('teacher', 'inbox-teacher');
      const { Course } = require('../src/models');
      course2 = await Course.create({ title: 'Curso inbox', description: 'd', level: 'A1', teacherId: t.id });
      const unit = await Unit.create({ courseId: course2.id, title: 'U inbox', order: 0 });
      st = await Story.create({ unitId: unit.id, title: 'Lección A', text: 't', order: 0 });
      st2 = await Story.create({ unitId: unit.id, title: 'Lección B', text: 't', order: 1 });
      foreignComment = await LessonComment.create({ storyId: world.foreignStory.id, userId: world.student.id, body: 'de otro docente' });
    });

    test('teachers only', async () => {
      expect((await inbox(null)).status).toBe(401);
      expect((await inbox(world.student)).status).toBe(403);
      expect((await inbox(t, '?status=nope')).status).toBe(400);
      expect((await inbox(t, '?courseId=abc')).status).toBe(400);
      expect((await inbox(t)).body).toMatchObject({ rows: [], total: 0 });
    });

    test('unanswered = a student\'s first-level comment, not hidden, with no reply of the teacher; all = every first-level comment; own courses only', async () => {
      const mk = (story, user, body, values = {}) => LessonComment.create({ storyId: story.id, userId: user.id, body, ...values });
      const unanswered = await mk(st, world.student, 'sin responder');
      const answered = await mk(st, world.student2, 'respondida');
      await mk(st, t, 'respuesta del docente', { parentId: answered.id });
      const peerOnly = await mk(st2, world.student, 'solo un compañero respondió');
      await mk(st2, world.student2, 'compañero', { parentId: peerOnly.id });
      const hidden = await mk(st2, world.student, 'oculta', { hidden: true });
      const own = await mk(st2, t, 'pregunta propia del docente');

      const open = await inbox(t, '?status=unanswered');
      expect(open.body.rows.map(r => r.id).sort()).toEqual([unanswered.id, peerOnly.id].sort());
      expect(open.body.total).toBe(2);
      const all = await inbox(t, '?status=all');
      expect(all.body.rows.map(r => r.id).sort()).toEqual([unanswered.id, answered.id, peerOnly.id, hidden.id, own.id].sort());
      expect(all.body.total).toBe(5);
      expect((await inbox(t)).body.total).toBe(5); // default: all
      expect(all.body.rows.map(r => r.id)).not.toContain(foreignComment.id);

      const row = id => all.body.rows.find(r => r.id === id);
      expect(row(answered.id)).toMatchObject({
        body: 'respondida', author: { id: world.student2.id, name: world.student2.name, isTeacher: false }, replies: 1, answeredByTeacher: true,
        story: { id: st.id, title: 'Lección A' }, course: { id: course2.id, title: 'Curso inbox' }, unit: { title: 'U inbox' }
      });
      expect(row(peerOnly.id)).toMatchObject({ replies: 1, answeredByTeacher: false });
      expect(row(unanswered.id)).toMatchObject({ replies: 0, answeredByTeacher: false });
      expect(row(own.id).author.isTeacher).toBe(true);
      expect(Object.keys(row(answered.id).author).sort()).toEqual(['id', 'isTeacher', 'name']);
      expect((await inbox(world.otherTeacher, '?status=all')).body.rows.map(r => r.id)).toContain(foreignComment.id);
    });

    test('filters by course and pages by 20', async () => {
      const mine = await inbox(t, `?courseId=${course2.id}`);
      expect(mine.body.total).toBe(5);
      expect((await inbox(t, `?courseId=${world.course.id}`)).body.total).toBe(0); // not their course: nothing leaks
      await LessonComment.bulkCreate(Array.from({ length: 22 }, (_, i) => ({ storyId: st.id, userId: world.student.id, body: `n${i}`, createdAt: new Date(Date.now() + (i + 1) * 1000) })));
      const one = await inbox(t, '?status=unanswered');
      const two = await inbox(t, '?status=unanswered&page=2');
      expect([one.body.rows.length, two.body.rows.length, one.body.total]).toEqual([20, 4, 24]);
    });
  });

  describe('e-mails', () => {
    const pendingMails = to => mailsTo(to);
    test('a student\'s first-level comment e-mails the teacher in Spanish, after the response, with the text escaped and a link to the lesson', async () => {
      const res = await post(world.student, 'Duda sobre "ser" & "estar"');
      expect(res.status).toBe(201);
      const mail = await waitFor(() => pendingMails(world.teacher.email)[0]);
      expect(mail.subject).toBe(`Nueva pregunta en ${story.title}`);
      expect(mail.text).toContain('Duda sobre "ser" & "estar"');
      expect(mail.html).toContain('Duda sobre &quot;ser&quot; &amp; &quot;estar&quot;');
      expect(mail.text).toContain(`/teacher/course/${world.course.id}/manage?story=${story.id}`);
      expect(mail.html).toContain('lang="es"');
      expect(`${mail.subject} ${mail.text}`).not.toMatch(/\b(el alumno|la alumna|el estudiante|la estudiante|él|ella)\b/i);
      expect(getOutbox().filter(m => m.to === world.student.email)).toHaveLength(0);
    });

    test('a student\'s reply (not first level) and the teacher\'s own comments send nothing', async () => {
      const parent = (await post(world.student, 'Base')).body;
      await waitFor(() => pendingMails(world.teacher.email)[0]);
      clearOutbox();
      await post(world.student2, 'Respuesta de un compañero', parent.id);
      await post(world.teacher, 'Comentario propio');
      const own = (await post(world.teacher, 'Otro propio')).body;
      await post(world.teacher, 'Respuesta propia a lo propio', own.id);
      await new Promise(r => setTimeout(r, 300));
      expect(getOutbox()).toHaveLength(0);
    });

    test('the teacher\'s reply e-mails the author of the comment, in English, without gendered pronouns', async () => {
      const parent = (await post(world.student, 'Mi pregunta')).body;
      clearOutbox();
      const res = await post(world.teacher, 'Buena pregunta, mira el ejemplo.', parent.id);
      expect(res.status).toBe(201);
      const mail = await waitFor(() => pendingMails(world.student.email)[0]);
      expect(mail.subject).toBe(`${world.teacher.name} replied to your question in ${story.title}`);
      expect(mail.text).toContain('Buena pregunta, mira el ejemplo.');
      expect(mail.text).toContain(`/student/course/${world.course.id}/play?story=${story.id}`);
      expect(`${mail.subject} ${mail.text}`).not.toMatch(/\b(he|she|his|her|him|hers)\b/i);
      expect(getOutbox().filter(m => m.to === world.student2.email)).toHaveLength(0);
    });

    test('the teacher replying inside a thread started by a student notifies that student, even if a peer replied before', async () => {
      const parent = (await post(world.student, 'Hilo')).body;
      await post(world.student2, 'Un compañero contesta', parent.id);
      clearOutbox();
      await post(world.teacher, 'Ahora el docente', parent.id);
      await waitFor(() => pendingMails(world.student.email)[0]);
      expect(getOutbox().filter(m => m.to === world.student2.email)).toHaveLength(0);
    });

    test('a failing mail transport never fails or delays the request', async () => {
      const previous = process.env.MAIL_TRANSPORT;
      process.env.MAIL_TRANSPORT = 'broken';
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const res = await post(world.student, 'Con el correo caído');
        expect(res.status).toBe(201);
        await waitFor(() => spy.mock.calls.some(call => /notification failed/.test(String(call[0]))));
      } finally {
        spy.mockRestore();
        process.env.MAIL_TRANSPORT = previous;
      }
    });
  });

  test('GET /courses/:id adds commentCount per story for the student and the teacher', async () => {
    const s = (await createStory(world)).story;
    await LessonComment.bulkCreate([0, 1, 2].map(i => ({ storyId: s.id, userId: world.student.id, body: `n${i}` })));
    for (const user of [world.student, world.teacher]) {
      const res = await as(user).get(`/api/courses/${world.course.id}`);
      expect(res.body.units[0].stories.find(x => x.id === s.id).commentCount).toBe(3);
      expect(res.body.units[0].stories.every(x => Number.isInteger(x.commentCount))).toBe(true);
    }
  });
});
