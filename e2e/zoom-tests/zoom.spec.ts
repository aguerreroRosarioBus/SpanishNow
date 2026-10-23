import { test, expect, Page } from '@playwright/test';
import { login } from '../helpers/auth';
import { zoomFixture, zoomState, zoomConnectionState } from './zoom-db';
const api = 'http://localhost:3116/api';
async function enter(page: Page, account: { email: string; password: string }, teacher = true) {
  await page.addInitScript(() => localStorage.setItem('spanishnow.locale', 'es'));
  await login(page, account, teacher ? /teacher\/dashboard/ : /student\/dashboard/);
}
async function connect(page: Page) {
  await page.goto('/teacher/integrations/zoom');
  await page.getByRole('button', { name: 'Conectar Zoom', exact: true }).click();
  await expect(page.getByTestId('zoom-card')).toContainText('Conectada');
  await expect(page.getByTestId('zoom-card')).toContainText('Modo de prueba');
}
test('OAuth y sync reales del fake, UTC estable al reprogramar y enlaces por rol', async ({ browser }, info) => {
  const c = zoomFixture();
  const teacherContext = await browser.newContext({ viewport: info.project.use.viewport, timezoneId: 'America/New_York' });
  const studentContext = await browser.newContext({ viewport: info.project.use.viewport, timezoneId: 'America/Argentina/Cordoba' });
  const teacher = await teacherContext.newPage(), student = await studentContext.newPage();
  try {
    await enter(teacher, c.teacher); await connect(teacher);
    await teacher.goto(`/zoom/sessions/${c.sessionId}`);
    await teacher.getByRole('button', { name: 'Reintentar sincronización de reunión', exact: true }).click();
    await expect(teacher.getByTestId('zoom-session').getByRole('status')).toContainText('Reintento encolado');
    await expect.poll(() => zoomState(c.sessionId).status).toBe('ready');
    const original = zoomState(c.sessionId);
    await teacher.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await teacher.getByRole('button', { name: 'Reunión', exact: true }).click();
    await expect(teacher.getByRole('link', { name: 'Abrir reunión' })).toHaveAttribute('href', /\/s\/.*zak=fake/);
    await expect(teacher.getByRole('link', { name: 'Pizarra', exact: true })).toHaveAttribute('href', /\/live\/\d+/);
    await enter(student, c.student, false); await student.goto(`/zoom/sessions/${c.sessionId}`);
    await expect(student.getByTestId('zoom-session')).toContainText('America/Argentina/Cordoba');
    await student.getByRole('button', { name: 'Reunión', exact: true }).click();
    await expect(student.getByRole('link', { name: 'Abrir reunión' })).toHaveAttribute('href', /\/j\//);
    expect(await student.content()).not.toContain('zak=');
    const proposal = await teacher.request.post(`${api}/class-sessions/${c.sessionId}/proposals`, { headers: { Authorization: `Bearer ${c.teacher.token}` },
      data: { version: original.version, intent: { ...c.intent, localStart: c.intent.localStart.replace('09:00', '12:00') } } });
    expect(proposal.status()).toBe(200); const version = (await proposal.json()).version;
    expect((await student.request.post(`${api}/class-sessions/${c.sessionId}/proposals/${version}/accept`, { headers: { Authorization: `Bearer ${c.student.token}` }, data: {} })).status()).toBe(200);
    await expect.poll(() => zoomState(c.sessionId).syncedVersion).toBe(version);
    const updated = zoomState(c.sessionId); expect(updated.externalId).toBe(original.externalId); expect(updated.startsAt).not.toBe(original.startsAt);
    await student.screenshot({ path: info.outputPath('zoom-participante.png'), fullPage: true });
  } finally { await teacherContext.close(); await studentContext.close(); }
});
test('desconexión, reintento accionable y contingencia EN/ES sin declarar integración lista', async ({ page }, info) => {
  const c = zoomFixture(); await enter(page, c.teacher); await connect(page);
  await page.getByRole('button', { name: 'Desconectar Zoom', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByTestId('zoom-card')).toContainText('Desconectada');
  await page.goto(`/zoom/sessions/${c.sessionId}`);
  await page.getByRole('button', { name: 'Reintentar sincronización de reunión', exact: true }).click();
  await expect(page.getByRole('alert').last()).toContainText('Reconectá Zoom');
  await page.getByLabel('Enlace manual de contingencia', { exact: true }).fill('https://zoom.us/s/123456789?zak=private');
  await page.getByRole('button', { name: 'Guardar enlace de participante', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText('No se admiten enlaces de anfitrión');
  await page.getByLabel('Enlace manual de contingencia', { exact: true }).fill('https://zoom.us/j/123456789?pwd=manual');
  await page.getByRole('combobox', { name: 'Idioma', exact: true }).selectOption('en');
  await expect(page.getByLabel('Manual contingency link', { exact: true })).toHaveValue('https://zoom.us/j/123456789?pwd=manual');
  await page.getByRole('button', { name: 'Save participant link', exact: true }).click();
  await expect(page.getByTestId('zoom-session')).toContainText('Manual contingency is active');
  await expect(page.getByTestId('zoom-session')).toContainText('Needs attention');
  await page.getByRole('button', { name: 'Meeting', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open meeting', exact: true })).toHaveAttribute('href', 'https://zoom.us/j/123456789?pwd=manual');
  await page.screenshot({ path: info.outputPath('zoom-contingencia-en.png'), fullPage: true });
});

test('P1: enlace iniciado por A y completado por B rechaza sin conectar ninguna cuenta', async ({ page }) => {
  const a = zoomFixture(), b = zoomFixture();
  const started = await page.request.post(`${api}/integrations/zoom/connect`, {
    headers: { Authorization: `Bearer ${a.teacher.token}` }, data: {}
  });
  expect(started.status()).toBe(200);
  await enter(page, b.teacher);
  await page.goto((await started.json()).url);
  await expect(page.getByTestId('zoom-card').getByRole('alert')).toBeVisible();
  await expect(page).not.toHaveURL(/token=/);
  expect(zoomConnectionState(a.teacher.id)).toMatchObject({ credentials: false, pending: false });
  expect(zoomConnectionState(b.teacher.id)).toMatchObject({ credentials: false });
});
