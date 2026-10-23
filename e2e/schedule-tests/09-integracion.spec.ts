import { expect, test, Page } from '@playwright/test';
// W09 (SPEC §5.4 TZ-T02/TZ-T05, §15 AC05/AC06): propuesta en Nueva York durante la semana del cambio de horario de
// otoño; alumna en Londres con interfaz en inglés. Usa la misma base aislada y fixtures que 08-schedule (sin producción).
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { login } from '../helpers/auth';
import { balances, scheduleFixture } from '../helpers/schedule';

// La fixture deja a todos los alumnos en Córdoba; esta prueba necesita una alumna en Londres. Se cambia solo en la base E2E aislada.
function setStudentTimeZone(email: string, timeZone: string): void {
  const script = `
    const { User } = require('./src/models');
    (async () => {
      const [count] = await User.update({ timeZone: process.env.TZ_VALUE }, { where: { email: process.env.STUDENT_EMAIL } });
      if (count !== 1) throw new Error('No existe la alumna de la fixture');
      process.exit(0);
    })().catch(e => { console.error(e); process.exit(1); });`;
  const run = spawnSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '../../backend'), encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_NAME: 'spanishnow_w06_e2e_test', JWT_SECRET: 'w06-e2e-local-secret', MAIL_TRANSPORT: 'log', DOTENV_CONFIG_QUIET: 'true', STUDENT_EMAIL: email, TZ_VALUE: timeZone }
  });
  if (run.status !== 0) throw new Error(`No se pudo cambiar la zona de la alumna:\n${run.stdout}\n${run.stderr}`);
}

// El login se hace en español (etiquetas fijas); el idioma se cambia después, con el selector de la barra superior.
async function enter(page: Page, account: { email: string; password: string }, teacher = false, locale: 'es' | 'en' = 'es') {
  await page.addInitScript(() => { if (!localStorage.getItem('spanishnow.locale')) localStorage.setItem('spanishnow.locale', 'es'); });
  await login(page, account, teacher ? /teacher\/dashboard/ : /student\/dashboard/);
  if (locale === 'en') await page.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption('en');
}

test('DST otoño: propuesta NY en la hora ambigua, alumna en Londres en EN acepta y ve el mismo instante', async ({ browser }, info) => {
  const c = scheduleFixture();
  const viewport = info.project.use.viewport;
  const teacherContext = await browser.newContext({ timezoneId: 'America/New_York', locale: 'es-ES', viewport });
  const studentContext = await browser.newContext({ timezoneId: 'Europe/London', locale: 'en-GB', viewport });
  const teacher = await teacherContext.newPage(), student = await studentContext.newPage();
  try {
    await enter(teacher, c.teacher, true);
    await teacher.goto('/schedule');
    await teacher.getByRole('combobox', { name: 'Alumno', exact: true }).selectOption({ index: 1 });
    await teacher.getByRole('combobox', { name: 'Clases compradas', exact: true }).selectOption({ index: 1 });
    await teacher.getByLabel('Fecha y hora local', { exact: true }).fill('2026-11-01T01:30');
    await teacher.getByLabel('Zona IANA de programación', { exact: true }).fill('America/New_York');
    await expect(teacher.getByRole('radio')).toHaveCount(2);
    await teacher.getByRole('radio').nth(1).check();
    await expect(teacher.getByTestId('schedule-form')).toContainText('UTC-05:00');
    const created = teacher.waitForResponse(r => r.url().endsWith('/api/class-sessions') && r.request().method() === 'POST');
    await teacher.getByRole('button', { name: 'Proponer una clase', exact: true }).click();
    const response = await created; expect(response.status()).toBe(201);
    const session = await response.json();
    // Instante UTC de la segunda ocurrencia (-05:00): 2026-11-01T06:30:00Z.
    expect(session.startsAt).toBe('2026-11-01T06:30:00.000Z');

    setStudentTimeZone(c.students[0].email, 'Europe/London');
    await enter(student, c.students[0], false, 'en');
    await student.goto(`/messages/${c.conversationId}`);
    const card = student.getByTestId('session-card').first();
    await expect(card).toContainText('Europe/London');
    await card.getByRole('button', { name: 'Accept this proposal', exact: true }).click();
    const dialog = card.getByTestId('session-confirmation');
    await expect(dialog).toContainText('Your time');
    await dialog.getByRole('checkbox').check();
    const accepted = student.waitForResponse(r => r.url().includes(`/class-sessions/${session.id}/proposals/1/accept`));
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    expect((await accepted).status()).toBe(200);
    await expect(card).toContainText('Confirmed');
    // Sin reprogramación: la reserva de la compra queda una vez.
    expect(balances(c.purchases)[0].unitsReserved).toBe(1);
  } finally { await Promise.allSettled([teacherContext.close(), studentContext.close()]); }
});
