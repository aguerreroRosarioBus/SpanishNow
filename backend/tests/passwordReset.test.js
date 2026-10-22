// Forgot / reset password (tokens stored hashed, expiry, single use) and public registration.
const { randomUUID, createHash } = require('crypto');
const { User, PasswordToken } = require('../src/models');
const { createToken, hashToken } = require('../src/services/passwordTokens');
const { clearOutbox } = require('../src/services/mailService');
const { as, createUser } = require('./helpers/fixtures');
const { mailsTo, waitFor, tokenFromMail } = require('./helpers/sales');

describe('forgot and reset password', () => {
  beforeEach(() => clearOutbox());

  test('forgot-password answers 200 for any email and only emails existing accounts', async () => {
    const user = await createUser('student', 'forgetful');
    const known = await as(null).post('/api/auth/forgot-password', { email: user.email });
    const unknown = await as(null).post('/api/auth/forgot-password', { email: `ghost-${randomUUID()}@jest.test` });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);

    const [mail] = await waitFor(async () => { const m = mailsTo(user.email); return m.length ? m : null; });
    expect(mail.subject).toMatch(/Reset your SpanishNow password/);
    expect(mail.text).toContain('Reset password');
    expect(mail.text).toContain('1 hour');
    expect(mail.text).not.toContain('invite=1');
    expect(mail.html).toContain('/auth/reset-password?token=');
    expect(await PasswordToken.count({ where: { userId: user.id, purpose: 'reset' } })).toBe(1);

    expect((await as(null).post('/api/auth/forgot-password', { email: 'not-an-email' })).status).toBe(400);
  });

  test('the token is stored as sha256, never in clear, and expires in about one hour', async () => {
    const user = await createUser('student', 'hashed');
    await as(null).post('/api/auth/forgot-password', { email: user.email });
    const [mail] = await waitFor(async () => { const m = mailsTo(user.email); return m.length ? m : null; });
    const token = tokenFromMail(mail);
    const row = await PasswordToken.findOne({ where: { userId: user.id } });
    expect(row.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(row.tokenHash).not.toContain(token);
    expect(row.usedAt).toBeNull();
    const minutes = (row.expiresAt.getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(58);
    expect(minutes).toBeLessThanOrEqual(60);
  });

  test('a valid token sets the password, signs the user in, and works only once', async () => {
    const user = await createUser('student', 'resetter');
    const token = await createToken(user, 'reset');

    const res = await as(null).post('/api/auth/reset-password', { token, password: 'brand-new-1' });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: user.id, name: user.name, email: user.email, role: 'student', permissions: [], isTestAccount: false });
    expect((await as({ token: res.body.token }).get('/api/enrollments/my-courses')).status).toBe(200);
    expect((await as(null).post('/api/auth/login', { email: user.email, password: 'brand-new-1' })).status).toBe(200);
    expect((await as(null).post('/api/auth/login', { email: user.email, password: 'jest-password-1' })).status).toBe(401);

    const reused = await as(null).post('/api/auth/reset-password', { token, password: 'another-pass-2' });
    expect(reused.status).toBe(400);
    expect(reused.body).toEqual({ error: expect.any(String), code: 'password_link_invalid', params: {} });
    expect((await as(null).post('/api/auth/login', { email: user.email, password: 'brand-new-1' })).status).toBe(200);
    expect((await PasswordToken.findOne({ where: { tokenHash: hashToken(token) } })).usedAt).toBeInstanceOf(Date);
  });

  test('an expired token is refused and the password does not change', async () => {
    const user = await createUser('student', 'late');
    const token = await createToken(user, 'reset');
    await PasswordToken.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { tokenHash: hashToken(token) } });

    const res = await as(null).post('/api/auth/reset-password', { token, password: 'too-late-1' });
    expect(res.status).toBe(400);
    expect((await as(null).post('/api/auth/login', { email: user.email, password: 'jest-password-1' })).status).toBe(200);
  });

  test('unknown tokens and short passwords are refused; an invite token (14 days) also sets the password', async () => {
    const user = await createUser('student', 'invited');
    expect((await as(null).post('/api/auth/reset-password', { token: 'made-up', password: 'long-enough' })).status).toBe(400);
    expect((await as(null).post('/api/auth/reset-password', { password: 'long-enough' })).status).toBe(400);

    const invite = await createToken(user, 'invite');
    const row = await PasswordToken.findOne({ where: { tokenHash: hashToken(invite) } });
    expect(Math.round((row.expiresAt.getTime() - Date.now()) / 86400000)).toBe(14);
    expect((await as(null).post('/api/auth/reset-password', { token: invite, password: '123' })).status).toBe(400);
    expect((await PasswordToken.findOne({ where: { tokenHash: hashToken(invite) } })).usedAt).toBeNull();
    expect((await as(null).post('/api/auth/reset-password', { token: invite, password: 'chosen-pass' })).status).toBe(200);
  });

  test('spending a token invalidates the other pending tokens of the user', async () => {
    const user = await createUser('student', 'multi');
    const first = await createToken(user, 'reset');
    const second = await createToken(user, 'reset');
    expect((await as(null).post('/api/auth/reset-password', { token: first, password: 'first-pass-1' })).status).toBe(200);
    expect((await as(null).post('/api/auth/reset-password', { token: second, password: 'second-pass-2' })).status).toBe(400);
  });
});

describe('public registration', () => {
  const register = body => as(null).post('/api/auth/register', body);
  const data = extra => ({ name: 'New Person', email: `new-${randomUUID()}@jest.test`, password: 'secret-123', ...extra });

  test('creates a student whether or not role is sent', async () => {
    const withRole = await register(data({ role: 'student' }));
    expect(withRole.status).toBe(201);
    expect(withRole.body.user.role).toBe('student');
    const without = await register(data());
    expect(without.status).toBe(201);
    expect(without.body.user.role).toBe('student');
  });

  test('role teacher is refused and no account is created', async () => {
    const body = data({ role: 'teacher' });
    const res = await register(body);
    expect(res.status).toBe(400);
    expect(await User.count({ where: { email: body.email } })).toBe(0);
    expect((await register(data({ role: 'admin' }))).status).toBe(400);
  });
});
