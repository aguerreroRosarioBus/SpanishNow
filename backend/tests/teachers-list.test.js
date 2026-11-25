// A-07 (auditoría 25/11/2026): GET /api/users/teachers no expone el email de los docentes a quien no corresponde.
const { User, Course } = require('../src/models');
const { as, createUser } = require('./helpers/fixtures');

describe('GET /api/users/teachers', () => {
  let teacher; let otherTeacher; let student; let admin;
  beforeAll(async () => {
    [teacher, otherTeacher, student, admin] = await Promise.all([
      createUser('teacher', 'lista-docente'), createUser('teacher', 'lista-otro'),
      createUser('student', 'lista-alumno'), createUser('teacher', 'lista-admin')
    ]);
    await User.update({ permissions: ['users.manage'] }, { where: { id: admin.id } });
    await Course.create({ title: 'Curso lista', description: 'x', level: 'A1', teacherId: teacher.id });
  });
  const find = (body, user) => body.find(item => item.id === user.id);

  it('exige sesión', async () => {
    expect((await as(null).get('/api/users/teachers')).status).toBe(401);
  });

  it('un alumno ve nombre y cantidad de cursos, sin email', async () => {
    const res = await as(student).get('/api/users/teachers');
    expect(res.status).toBe(200);
    const item = find(res.body, teacher);
    expect(item).toMatchObject({ id: teacher.id, name: teacher.name, coursesCount: 1 });
    expect(res.body.every(row => !('email' in row))).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('@jest.test');
  });

  it('un docente solo ve su propio email', async () => {
    const res = await as(teacher).get('/api/users/teachers');
    expect(find(res.body, teacher).email).toBe(teacher.email);
    expect('email' in find(res.body, otherTeacher)).toBe(false);
  });

  it('quien administra usuarios ve los emails', async () => {
    const res = await as(admin).get('/api/users/teachers');
    expect(find(res.body, teacher).email).toBe(teacher.email);
    expect(find(res.body, otherTeacher).email).toBe(otherTeacher.email);
  });
});
