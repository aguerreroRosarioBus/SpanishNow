const { randomUUID } = require('crypto');
const { app, as, createUser } = require('./helpers/fixtures');
const request = require('supertest');

describe('W01: códigos estables de acceso compatibles con error', () => {
  test('sesión ausente, credenciales y validaciones llevan code/params', async () => {
    const unauthenticated = await request(app).get('/api/me/preferences');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toMatchObject({ error: expect.any(String), code: 'unauthenticated', params: {} });
    const invalid = await as(null).post('/api/auth/login', { email: `absent-${randomUUID()}@example.test`, password: 'ficticio' });
    expect(invalid.status).toBe(401);
    expect(invalid.body).toMatchObject({ error: expect.any(String), code: 'invalid_credentials', params: {} });
    const validation = await as(null).post('/api/auth/register', { name: '', email: 'invalid', password: 'x' });
    expect(validation.status).toBe(400);
    expect(validation.body).toMatchObject({ code: 'validation_failed', errors: expect.any(Array), params: { fields: expect.arrayContaining(['name', 'email', 'password']) } });
  });

  test('email duplicado y enlace inválido no requieren interpretar texto arbitrario', async () => {
    const user = await createUser('student', 'auth-code');
    const duplicate = await as(null).post('/api/auth/register', { name: 'Prueba', email: user.email, password: 'ficticio123' });
    expect(duplicate.body.code).toBe('email_already_registered');
    const link = await as(null).post('/api/auth/reset-password', { token: 'ficticio', password: 'ficticio123' });
    expect(link.status).toBe(400);
    expect(link.body).toMatchObject({ error: expect.any(String), code: 'password_link_invalid', params: {} });
  });
});
