const templates = require('../src/services/emailTemplates');
const { EN, ES } = require('../src/services/emailMessages');
const { as, createUser } = require('./helpers/fixtures');
const { clearOutbox } = require('../src/services/mailService');
const { mailsTo, waitFor } = require('./helpers/sales');

const course = { id: 7, title: 'Historias con María <&>' };
const story = { id: 9, title: 'Una pregunta <&>' };
const human = '¿Cómo se dice <script>alert(1)</script>?';

describe('W01: emails bilingües según destinatario', () => {
  beforeEach(() => clearOutbox());

  test('catálogos de email conservan claves y parámetros EN/ES', () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(ES).sort());
    const params = text => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    for (const key of Object.keys(EN)) expect(params(ES[key])).toEqual(params(EN[key]));
  });

  test.each(['en', 'es'])('todas las plantillas generan HTML %s escapado y mensajes humanos originales', locale => {
    const inputs = { locale, name: 'Ángela <&>', teacherName: 'José <&>', authorName: 'Ángela <&>', studentName: 'Ángela <&>', course, story, body: human };
    const emails = [
      templates.purchaseConfirmation({ ...inputs, amount: 9015, currency: 'USD', inviteToken: 'ficticio' }),
      templates.invitation({ ...inputs, hasAccount: false, inviteToken: 'ficticio' }),
      templates.invitation({ ...inputs, hasAccount: true }),
      templates.passwordReset({ ...inputs, token: 'ficticio' }),
      templates.newQuestion(inputs), templates.teacherReplied(inputs)
    ];
    for (const email of emails) {
      expect(email.html).toContain(`lang="${locale}"`);
      expect(email.text).toContain('Ángela <&>');
      expect(email.html).not.toContain('<script>');
      expect(email.html).not.toMatch(/<[^>]*<(?:&|script)/);
      expect(email.text).not.toMatch(/\{\w+\}/);
    }
    expect(emails[0].subject).toBe(`${locale === 'es' ? 'Tu compra' : 'Your purchase'}: ${course.title}`);
    expect(emails[0].text).toContain(locale === 'es' ? '90,15' : '90.15');
    expect(emails[0].text).toContain('USD');
    expect(emails[4].text).toContain(human);
    expect(emails[5].text).toContain(human);
    expect(emails[4].html).toContain('&lt;script&gt;');
  });

  test('sin preferencia de cuenta usa inglés; el idioma no cambia URLs ni moneda', () => {
    const args = { name: 'Ana', token: 'token+ficticio&', course, amount: 9015, currency: 'USD' };
    const fallback = templates.passwordReset({ ...args, locale: null });
    expect(fallback.html).toContain('lang="en"');
    expect(fallback.subject).toBe(EN['email.resetSubject']);
    const urls = locale => [...templates.purchaseConfirmation({ ...args, locale }).html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
    expect(urls('en')).toEqual(urls('es'));
    expect(templates.passwordUrl(args.token)).toContain('token%2Bficticio%26');
  });

  test.each(['en', 'es'])('recuperación usa locale %s guardado en cuenta, no el del solicitante', async locale => {
    const user = await createUser('student', 'email-locale');
    await user.update({ locale });
    const response = await as(null).post('/api/auth/forgot-password', { email: user.email, locale: locale === 'en' ? 'es' : 'en' });
    expect(response.status).toBe(200);
    const mail = await waitFor(() => mailsTo(user.email)[0]);
    expect(mail.subject).toBe((locale === 'es' ? ES : EN)['email.resetSubject']);
    expect(mail.html).toContain(`lang="${locale}"`);
  });
});
