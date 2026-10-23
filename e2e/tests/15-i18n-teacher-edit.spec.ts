import {test, expect} from '@playwright/test';

test('edición docente: el idioma conserva el modal abierto y el borrador del curso sin mutar datos', async ({page}) => {
  const user = {id: 41, name: 'Docente ficticia', email: 'docente@example.test', role: 'teacher', permissions: []};
  let loads = 0, writes = 0;
  const prefs = {locale: 'es', timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: '2026-10-22T12:00:00Z'};
  await page.addInitScript(account => {localStorage.setItem('user', JSON.stringify(account));localStorage.setItem('token', 'ficticio');localStorage.setItem('spanishnow.locale', 'es');}, user);
  await page.route(/https:\/\//, r => r.abort());
  await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname; const json = (body: unknown) => route.fulfill({json: body});
    if (path === '/api/auth/me') return json({user});
    if (path === '/api/me/preferences') return json(prefs);
    if (req.method() !== 'GET') {writes++;return json({});}
    if (path === '/api/courses') {loads++;return json([{id: 3, title: 'Curso original', slug: 'curso', description: 'Contenido docente', level: 'A1', price: 9000, currency: 'usd', isPublished: true, teacherId: 41}]);}
    return json([]);
  });
  await page.goto('/teacher/dashboard');
  await expect(page.getByRole('heading', {name: 'Mis cursos'})).toBeVisible();
  await page.getByRole('button', {name: 'Nuevo curso'}).first().click();
  await page.locator('#title').fill('Borrador de curso');
  await page.locator('app-language-selector select').selectOption('en');
  await expect(page.getByRole('heading', {name: 'My courses'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'New course'})).toBeVisible();
  await expect(page.locator('#title')).toHaveValue('Borrador de curso');
  await expect(page.getByText('Curso original')).toBeVisible(); // contenido docente: no se traduce
  expect(loads).toBe(1); expect(writes).toBe(0);
});
