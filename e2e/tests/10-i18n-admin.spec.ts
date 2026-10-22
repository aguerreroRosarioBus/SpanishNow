import {test, expect} from '@playwright/test';
test('administración conserva filtros, nombre y confirmación sin ejecutar una acción', async ({page}) => {
  const user = {id: 41, name: 'Administradora ficticia', email: 'admin@example.test', role: 'teacher', permissions: ['users.manage', 'test_users.manage']};
  const calls = {loads: 0, mutations: 0};
  let prefs = {locale: 'es', timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: '2026-10-22T15:00:00Z'};
  await page.addInitScript(account => {
    localStorage.setItem('user', JSON.stringify(account)); localStorage.setItem('token', 'ficticio'); localStorage.setItem('spanishnow.locale', 'es');
  }, user);
  await page.route(/https:\/\//, route => route.abort());
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({json: body});
    if (path === '/api/auth/me') return json({user});
    if (path === '/api/me/preferences') { if (request.method() === 'PATCH') prefs = {...prefs,...request.postDataJSON()}; return json(prefs); }
    if (path === '/api/admin/permissions') return json([{key: 'users.manage', label: 'Gestionar usuarios y permisos', description: 'Permiso propio'}]);
    if (path === '/api/admin/users' && request.method() === 'GET') {calls.loads++;return json({users: [{id: 42, name: 'Nombre original', email: 'ficticio@example.test', role: 'student', permissions: [], isTestAccount: true, fixedAdmin: false, suspendedAt: null, createdAt: '2026-10-23T02:30:00Z', enrollmentsCount: 2, coursesCount: 0}], total: 1});}
    if (path.startsWith('/api/admin/')) {calls.mutations++;return json({});}
    return json([]);
  });
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', {name: 'Usuarios', exact: true})).toBeVisible();
  await page.locator('#testName').fill('Borrador original');
  await page.locator('#fSearch').fill('Nombre');
  await expect.poll(() => calls.loads).toBe(2);
  await page.getByRole('button', {name: 'Suspender', exact: true}).click();
  await expect(page.locator('app-confirm-dialog .modal-body')).toContainText('no podrá iniciar sesión');
  const before = calls.loads;
  await page.locator('app-language-selector select').selectOption('en');
  await expect(page.locator('app-confirm-dialog .modal-body')).toContainText('will not be able to sign in');
  await expect(page.locator('app-confirm-dialog').getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
  await expect(page.locator('#testName')).toHaveValue('Borrador original');
  await expect(page.locator('#fSearch')).toHaveValue('Nombre');
  await expect(page.getByText('Manage users and permissions', {exact: true})).toBeVisible();
  expect(calls.loads).toBe(before); expect(calls.mutations).toBe(0);
  await page.locator('app-confirm-dialog').getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page.getByText('Nombre original', {exact: true})).toBeVisible();
});
