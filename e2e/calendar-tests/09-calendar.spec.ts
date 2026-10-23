import { expect, test, Page, APIRequestContext } from '@playwright/test';
// Suite aislada (base spanishnow_w07_e2e_test, puertos 3117/4317). Google Calendar va por el adaptador fake del servidor.
import { login } from '../helpers/auth';
import { calendarFixture } from '../helpers/calendar';

const API = 'http://localhost:3117/api';
async function token(request: APIRequestContext, creds: { email: string; password: string }) {
  const response = await request.post(`${API}/auth/login`, { data: creds });
  expect(response.ok()).toBe(true);
  return (await response.json()).token as string;
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

test('Calendar: conectar, confirmar, reprogramar, cancelar y desconectar con el fake', async ({ page, request }, info) => {
  const c = calendarFixture();
  await page.addInitScript(() => { if (!localStorage.getItem('spanishnow.locale')) localStorage.setItem('spanishnow.locale', 'es'); });
  await login(page, c.teacher, /teacher\/dashboard/);

  // 1. Conectar: el servidor redirige de vuelta con el resultado; nada de credenciales en la página.
  await page.goto('/teacher/integrations');
  await expect(page.getByText('Sin conectar', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Conectar Google Calendar' }).click();
  await expect(page).toHaveURL(/\/teacher\/integrations$/);
  await expect(page.getByText('Google Calendar conectado.')).toBeVisible();
  await expect(page.getByText('calendar-fake@example.test')).toBeVisible();
  await page.getByLabel('Calendario para tus clases').selectOption('clases@example.test');
  await page.getByRole('button', { name: 'Guardar elecciones' }).click();
  await expect(page.getByText('Elecciones guardadas.')).toBeVisible();
  expect(await page.content()).not.toMatch(/fake-refresh|fake-at-/);

  // 2. Confirmar: la propuesta se crea y el alumno acepta; el outbox crea el evento y la sesión muestra «Listo».
  const teacherToken = await token(request, c.teacher), studentToken = await token(request, c.students[0]);
  const created = await request.post(`${API}/class-sessions`, { headers: { ...auth(teacherToken), 'Idempotency-Key': crypto.randomUUID().replaceAll('-', '') }, data: c.body });
  expect(created.status()).toBe(201);
  const session = await created.json();
  const accepted = await request.post(`${API}/class-sessions/${session.id}/proposals/1/accept`, { headers: auth(studentToken), data: {} });
  expect(accepted.status()).toBe(200);
  const syncOf = async () => (await (await request.get(`${API}/class-sessions/${session.id}`, { headers: auth(teacherToken) })).json()).sync.find((r: { provider: string }) => r.provider === 'google_calendar');
  await expect.poll(async () => (await syncOf()).status, { timeout: 30000, intervals: [1000] }).toBe('ready');
  await page.goto(`/schedule?sessionId=${session.id}`);
  const card = page.getByTestId('session-card').first();
  await card.locator('details.sync summary').click();
  await expect(card.getByText(/Google Calendar · Listo/)).toBeVisible();
  await page.screenshot({ path: info.outputPath('calendar-sync-ready.png'), fullPage: true });

  // ICS del alumno: UID estable y SEQUENCE de la versión vigente.
  const ics = await request.get(`${API}/class-sessions/${session.id}/calendar.ics`, { headers: auth(studentToken) });
  const first = await ics.text();
  expect(first).toContain(`UID:class-session-${session.id}@`);
  expect(first).not.toMatch(/ATTENDEE/);

  // 3. Reprogramar: un solo evento actualizado a la versión nueva.
  const target = c.body.intent.localStart.replace('09:00', '12:00');
  const proposed = await request.post(`${API}/class-sessions/${session.id}/proposals`, { headers: auth(teacherToken), data: { version: session.version, intent: { ...c.body.intent, localStart: target } } });
  expect(proposed.status()).toBe(200);
  const proposal = await proposed.json();
  expect((await request.post(`${API}/class-sessions/${session.id}/proposals/${proposal.version}/accept`, { headers: auth(studentToken), data: {} })).status()).toBe(200);
  await expect.poll(async () => (await syncOf()).syncedVersion, { timeout: 30000, intervals: [1000] }).toBe(proposal.version);
  const second = await (await request.get(`${API}/class-sessions/${session.id}/calendar.ics`, { headers: auth(studentToken) })).text();
  expect(second).toContain(`SEQUENCE:${proposal.version}`);
  expect(second).not.toBe(first);

  // 4. Cancelar: el evento se cancela; la sesión y el historial siguen.
  const cancelled = await request.post(`${API}/class-sessions/${session.id}/cancel`, { headers: auth(teacherToken), data: { version: proposal.version, reason: 'Imprevisto del docente' } });
  expect(cancelled.status()).toBe(200);
  await expect.poll(async () => (await syncOf()).status, { timeout: 30000, intervals: [1000] }).toBe('cancelled');

  // 5. Desconectar: pide confirmación, explica qué se conserva y no borra la sesión.
  await page.goto('/teacher/integrations');
  await page.getByRole('button', { name: 'Desconectar', exact: true }).click();
  await expect(page.getByText('Tus clases, saldo e historial no cambian')).toBeVisible();
  await page.getByRole('button', { name: 'Sí, desconectar' }).click();
  await expect(page.getByText('Sin conectar', { exact: true })).toBeVisible();
  const after = await request.get(`${API}/class-sessions/${session.id}`, { headers: auth(teacherToken) });
  expect(after.status()).toBe(200);
  expect((await after.json()).status).toBe('cancelled');
  await page.screenshot({ path: info.outputPath('calendar-disconnected.png'), fullPage: true });
});

test('Calendar: el enlace de conexión de otra docente no vincula su Calendar a tu cuenta (P1)', async ({ page, request }) => {
  const a = calendarFixture(), b = calendarFixture();
  await page.addInitScript(() => { if (!localStorage.getItem('spanishnow.locale')) localStorage.setItem('spanishnow.locale', 'es'); });
  // A inicia la conexión y le manda el enlace de autorización a B, que tiene sesión iniciada.
  const aToken = await token(request, a.teacher);
  const started = await request.post(`${API}/integrations/google-calendar/connect`, { headers: auth(aToken), data: {} });
  expect(started.status()).toBe(200);
  const { url } = await started.json();
  await login(page, b.teacher, /teacher\/dashboard/);
  await page.goto(url);
  await expect(page).toHaveURL(/\/teacher\/integrations$/);
  await expect(page.getByText(/la inició otra cuenta/)).toBeVisible();
  await expect(page.getByText('Google Calendar conectado.')).toHaveCount(0);
  await expect(page.getByText('Sin conectar', { exact: true })).toBeVisible();
  // La conexión de A no cambió y la de B tampoco existe.
  const aState = await (await request.get(`${API}/integrations/google-calendar`, { headers: auth(aToken) })).json();
  expect(aState).toMatchObject({ connected: false, accountEmail: null });
  const bState = await (await request.get(`${API}/integrations/google-calendar`, { headers: auth(await token(request, b.teacher)) })).json();
  expect(bState).toMatchObject({ connected: false });
});
