// Inscripción automática en el curso de prueba al registrarse (src/services/trialEnrollment.js, POST /api/auth/register).
const { randomUUID } = require('crypto');
const request = require('supertest');
const { app, as, createUser } = require('./helpers/fixtures');
const { Course, Enrollment, User } = require('../src/models');
const { DEFAULT_TRIAL_SLUG, trialCourseSlug } = require('../src/services/trialEnrollment');

const PASSWORD = 'ficticio123';

describe('curso de prueba: inscripción al registrarse', () => {
  let teacher;
  let slug;
  const savedSlug = process.env.TRIAL_COURSE_SLUG;

  beforeAll(async () => { teacher = await createUser('teacher', 'trial-teacher'); });
  beforeEach(() => {
    slug = `trial-${randomUUID().slice(0, 8)}`;
    process.env.TRIAL_COURSE_SLUG = slug;
  });
  afterAll(() => { if (savedSlug === undefined) delete process.env.TRIAL_COURSE_SLUG; else process.env.TRIAL_COURSE_SLUG = savedSlug; });

  const course = (values = {}) => Course.create({ title: 'Free trial', level: 'A1', teacherId: teacher.id, slug, price: 0, isPublished: true, ...values });
  const register = () => request(app).post('/api/auth/register').send({ name: 'Alumno', email: `alumno-${randomUUID()}@jest.test`, password: PASSWORD });
  const enrollmentsOf = userId => Enrollment.findAll({ where: { studentId: userId } });

  test('el slug sale de TRIAL_COURSE_SLUG y por defecto es el del curso de prueba', () => {
    expect(trialCourseSlug()).toBe(slug);
    delete process.env.TRIAL_COURSE_SLUG;
    expect(trialCourseSlug()).toBe(DEFAULT_TRIAL_SLUG);
    process.env.TRIAL_COURSE_SLUG = '  ';
    expect(trialCourseSlug()).toBe(DEFAULT_TRIAL_SLUG);
  });

  test('un alumno que se registra queda inscripto con source free y ve el curso en sus cursos', async () => {
    const trial = await course();
    const res = await register();
    expect(res.status).toBe(201);
    const enrollments = await enrollmentsOf(res.body.user.id);
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0]).toMatchObject({ courseId: trial.id, source: 'free', orderId: null });
    const mine = await as({ token: res.body.token }).get('/api/enrollments/my-courses');
    expect(mine.status).toBe(200);
    expect(JSON.stringify(mine.body)).toContain(slug);
  });

  test('cada registro se inscribe una sola vez y los alumnos anteriores no se tocan', async () => {
    const existing = await createUser('student', 'trial-existing');
    const trial = await course();
    const first = await register();
    const second = await register();
    expect(await Enrollment.count({ where: { courseId: trial.id } })).toBe(2);
    expect(await enrollmentsOf(first.body.user.id)).toHaveLength(1);
    expect(await enrollmentsOf(second.body.user.id)).toHaveLength(1);
    expect(await enrollmentsOf(existing.id)).toHaveLength(0);
  });

  test('si el curso no existe el registro sigue igual y no queda inscripción', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(await User.count({ where: { id: res.body.user.id } })).toBe(1);
    expect(await enrollmentsOf(res.body.user.id)).toHaveLength(0);
  });

  test('no inscribe si el curso no está publicado o si tiene precio', async () => {
    const trial = await course({ isPublished: false });
    const draft = await register();
    expect(draft.status).toBe(201);
    expect(await enrollmentsOf(draft.body.user.id)).toHaveLength(0);

    await trial.update({ isPublished: true, price: 1900 });
    const paid = await register();
    expect(paid.status).toBe(201);
    expect(await enrollmentsOf(paid.body.user.id)).toHaveLength(0);

    await trial.update({ price: 0 });
    const free = await register();
    expect(await enrollmentsOf(free.body.user.id)).toHaveLength(1);
  });

  test('un registro rechazado (email repetido o datos inválidos) no deja inscripciones', async () => {
    const trial = await course();
    const email = `repetido-${randomUUID()}@jest.test`;
    expect((await request(app).post('/api/auth/register').send({ name: 'Uno', email, password: PASSWORD })).status).toBe(201);
    const before = await Enrollment.count({ where: { courseId: trial.id } });
    expect((await request(app).post('/api/auth/register').send({ name: 'Dos', email, password: PASSWORD })).status).toBe(400);
    expect((await request(app).post('/api/auth/register').send({ name: '', email: 'x', password: '1' })).status).toBe(400);
    expect(await Enrollment.count({ where: { courseId: trial.id } })).toBe(before);
  });
});
