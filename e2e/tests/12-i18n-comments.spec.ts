import {test, expect} from '@playwright/test';
test('comentarios docente: EN/ES conserva respuesta y confirmación sin enviar ni borrar', async ({page}) => {
  const user = {id: 41, name: 'Docente ficticia', email: 'docente@example.test', role: 'teacher', permissions: []};
  const calls = {loads: 0, mutations: 0};
  let prefs = {locale: 'es', timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: '2026-10-22T12:00:00Z'};
  await page.addInitScript(account => { localStorage.setItem('user', JSON.stringify(account)); localStorage.setItem('token', 'ficticio'); localStorage.setItem('spanishnow.locale','es'); }, user);
  await page.route(/https:\/\//, r => r.abort());
  await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname; const json = (body: unknown) => route.fulfill({json: body});
    if (path === '/api/auth/me') return json({user});
    if (path === '/api/me/preferences') {if (req.method() === 'PATCH') prefs = {...prefs, ...req.postDataJSON()};return json(prefs);}
    if (path === '/api/teacher/comments') {calls.loads++;return json({rows: [{id: 1, body: '<b>Texto humano original</b>', author: {id: 2, name: 'José original'}, course: {id: 1, title: 'Curso original'}, unit: {id: 1, title: 'Unidad original'}, story: {id: 1, title: 'Historia original'}, createdAt: '2026-10-23T02:30:00Z', replies: 2, answeredByTeacher: false}], total: 1});}
    if (req.method() !== 'GET') calls.mutations++;
    return json([]);
  });
  await page.goto('/teacher/comments');
  await page.getByRole('button', {name: 'Responder a José original', exact: true}).click();
  await page.getByRole('textbox', {name: 'Tu respuesta a José original', exact: true}).fill('Borrador humano');
  const before = calls.loads;
  await page.locator('app-language-selector select').selectOption('en');
  await expect(page.getByRole('textbox', {name: 'Your reply to José original', exact: true})).toHaveValue('Borrador humano');
  await expect(page.locator('.item__body')).toHaveText('<b>Texto humano original</b>');
  await expect(page.locator('.item__body b')).toHaveCount(0);
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.getByRole('button', {name: 'Delete José original’s comment', exact: true}).click();
  await page.locator('app-language-selector select').selectOption('es');
  await expect(page.locator('app-confirm-dialog .modal-body')).toContainText('¿Eliminar el comentario de José original?');
  expect(calls.loads).toBe(before); expect(calls.mutations).toBe(0);
});
