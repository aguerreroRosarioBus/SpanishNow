import { expect, test, Page } from '@playwright/test';
// W09 (SPEC §5.4 TZ-T02/TZ-T05, §15 AC05/AC06): propuesta en Nueva York durante la semana del cambio de horario de
// otoño; alumna en Londres con interfaz en inglés. Usa la misma base aislada y fixtures que 08-schedule (sin producción).
import { login } from '../helpers/auth';
import { balances, scheduleFixture } from '../helpers/schedule';

async function enter(page: Page, account: { email: string; password: string }, teacher = false, locale: 'es' | 'en' = 'es') {
  await page.addInitScript(l => { if (!localStorage.getItem('spanishnow.locale')) localStorage.setItem('spanishnow.locale', l); }, locale);
  await login(page, account, teacher ? /teacher\/dashboard/ : /student\/dashboard/);
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
