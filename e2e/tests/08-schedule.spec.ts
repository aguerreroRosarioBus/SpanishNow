import { expect, test, Page } from '@playwright/test';
import { login } from '../helpers/auth';
import { scheduleFixture } from '../helpers/schedule';

async function enter(page: Page, account: { email: string; password: string }, teacher = false) {
  await page.addInitScript(() => { if (!localStorage.getItem('spanishnow.locale')) localStorage.setItem('spanishnow.locale', 'es'); });
  await login(page, account, teacher ? /teacher\/dashboard/ : /student\/dashboard/);
}
test('agenda real: propuesta NY, aceptación Córdoba, cambio de idioma y reprogramación conservando original', async ({ browser }, info) => {
  const c = scheduleFixture();
  const viewport = info.project.use.viewport;
  const teacherContext = await browser.newContext({ timezoneId: 'America/New_York', locale: 'es-ES', viewport });
  const studentContext = await browser.newContext({ timezoneId: 'America/Argentina/Cordoba', locale: 'es-ES', viewport });
  const teacher = await teacherContext.newPage(), student = await studentContext.newPage();
  try {
    await enter(teacher, c.teacher, true);
    await teacher.goto(`/schedule?conversationId=${c.conversationId}`);
    await teacher.getByRole('combobox', { name: 'Clases compradas', exact: true }).selectOption({ index: 1 });
    await teacher.getByLabel('Fecha y hora local', { exact: true }).fill(c.body.intent.localStart);
    await teacher.getByLabel('Zona IANA de programación', { exact: true }).fill('America/New_York');
    const created = teacher.waitForResponse(r => r.url().endsWith('/api/class-sessions') && r.request().method() === 'POST');
    await teacher.getByRole('button', { name: 'Proponer una clase', exact: true }).click();
    const response = await created; expect(response.status()).toBe(201); const session = await response.json();
    await enter(student, c.students[0]);
    await student.goto(`/messages/${c.conversationId}`);
    const card = student.getByTestId('session-card').first();
    await expect(card).toContainText('America/Argentina/Cordoba'); await expect(card).toContainText('America/New_York');
    await card.getByRole('button', { name: 'Aceptar esta propuesta', exact: true }).click();
    const dialog = card.getByTestId('session-confirmation'); await expect(dialog).toContainText('UTC-03:00');
    await dialog.getByRole('checkbox').check();
    await student.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption('en');
    await expect(dialog.getByRole('checkbox')).toBeChecked(); await expect(dialog).toContainText('Your time');
    const accepted = student.waitForResponse(r => r.url().includes(`/class-sessions/${session.id}/proposals/1/accept`));
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click(); expect((await accepted).status()).toBe(200);
    await expect(card).toContainText('Confirmed');
    await teacher.goto(`/schedule?reschedule=${session.id}`);
    const target = c.body.intent.localStart.replace('09:00', '12:00');
    await teacher.getByLabel('Fecha y hora local', { exact: true }).fill(target);
    const proposed = teacher.waitForResponse(r => r.url().endsWith(`/class-sessions/${session.id}/proposals`));
    await teacher.getByRole('button', { name: 'Proponer otro horario', exact: true }).click(); expect((await proposed).status()).toBe(200);
    await student.goto(`/schedule?sessionId=${session.id}`);
    const pending = student.getByTestId('session-card').first(); await expect(pending).toContainText('Confirmed time stays');
    await pending.getByRole('button', { name: 'Decline', exact: true }).click();
    const declined = student.waitForResponse(r => r.url().includes('/decline'));
    await pending.getByTestId('session-confirmation').getByRole('button', { name: 'Confirm', exact: true }).click();
    const original = await (await declined).json(); expect(original.startsAt).toBe(session.startsAt);
    // Evidencia visual del recorrido real; sin interceptar ni simular respuestas.
    await student.screenshot({ path: info.outputPath('schedule-real.png'), fullPage: true });
  } finally { await Promise.allSettled([teacherContext.close(), studentContext.close()]); }
});

test('DST: la UI exige elegir instancia y conserva el borrador al alternar EN/ES', async ({ page }) => {
  const c = scheduleFixture(); await enter(page, c.teacher, true); await page.goto('/schedule');
  await page.getByLabel('Fecha y hora local', { exact: true }).fill('2026-11-01T01:30');
  await page.getByLabel('Zona IANA de programación', { exact: true }).fill('America/New_York');
  await expect(page.getByRole('radio')).toHaveCount(2);
  await page.getByRole('radio').nth(1).check();
  await expect(page.getByTestId('schedule-form')).toContainText('UTC-05:00');
  await page.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption('en');
  await expect(page.getByLabel('Local date and time', { exact: true })).toHaveValue('2026-11-01T01:30');
  await page.getByLabel('Local date and time', { exact: true }).fill('2027-03-14T02:30');
  await expect(page.getByRole('button', { name: /Valid alternative/ })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Propose a class', exact: true })).toBeDisabled();
});
