import { expect, test, Page } from '@playwright/test';

async function studentApi(page: Page) {
  const user = { id: 1, name: 'Ángela ficticia', email: 'alumno@example.test', role: 'student', permissions: [] };
  let prefs = { locale: 'es', timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: '2026-10-22T12:00:00Z', chatUnreadEmail: false };
  const course = { id: 10, title: 'Historias de María', level: 'A1', slug: 'historias', price: 9015, currency: 'USD' };
  const mutations: string[] = [];
  await page.addInitScript(user => {
    localStorage.setItem('user', JSON.stringify(user)); localStorage.setItem('token', 'ficticio'); localStorage.setItem('spanishnow.locale', 'es');
  }, user);
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') mutations.push(path);
    let body: unknown = [];
    if (path === '/api/auth/me') body = { user };
    else if (path === '/api/me/preferences') {
      if (request.method() === 'PATCH') prefs = { ...prefs, ...request.postDataJSON() };
      body = prefs;
    } else if (path === '/api/conversations/unread') body = { total: 0 };
    else if (path === '/api/courses') body = [course, { ...course, id: 20, level: 'B1', title: 'Otro curso' }];
    else if (path === '/api/enrollments/my-courses') body = [{ id: 5, courseId: 10, studentId: 1, createdAt: '2026-10-23T02:30:00Z', course }];
    else if (path === '/api/enrollments/5/progress') body = {
      stories: [{ storyId: 100, storyTitle: 'María en la fiesta', unitTitle: 'Unidad docente', narrativeCompleted: true, answers: { total: 1, correct: 1, attempts: 2 }, reinforcements: { total: 0, completed: 0 } }],
      quizzes: [], certificate: { eligible: true, code: null, missing: { stories: 0, quizzes: 0 } }
    };
    else if (path === '/api/me/orders') body = [{ id: 1, paidAt: '2026-10-23T02:30:00Z', course, amount: 9015, currency: 'USD', status: 'paid', refundedAmount: 1500, receiptUrl: null }];
    else if (path === '/api/users/teachers') body = [{ id: 2, name: 'José ficticio', email: 'docente@example.test', coursesCount: 2 }];
    await route.fulfill({ json: body });
  });
  await page.route(/https:\/\//, route => route.abort());
  return mutations;
}

test('catálogo conserva nivel, títulos y moneda al cambiar idioma', async ({ page }) => {
  const mutations = await studentApi(page);
  await page.goto('/student/dashboard?view=catalog&level=A1');
  await expect(page.getByRole('heading', { name: 'Explorar cursos' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'Explore courses' })).toBeVisible();
  await expect(page.getByText('Level A1 courses', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Historias de María' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Otro curso' })).toHaveCount(0);
  expect(page.url()).toContain('level=A1');
  expect(mutations).toEqual(['/api/me/preferences']);
});

test('avance conserva borrador de nombre y no emite certificado al traducir', async ({ page }) => {
  const mutations = await studentApi(page);
  await page.goto('/student/progress');
  await page.getByRole('button', { name: 'Obtener certificado' }).click();
  await page.locator('input[name="certName"]').fill('Nombre a conservar');
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
  await expect(page.locator('input[name="certName"]')).toHaveValue('Nombre a conservar');
  await expect(page.getByRole('button', { name: 'Issue certificate' })).toBeVisible();
  await expect(page.getByText('María en la fiesta', { exact: true })).toBeVisible();
  await expect(page.getByText('2 attempts', { exact: false })).toBeVisible();
  expect(mutations).toEqual(['/api/me/preferences']);
});

test('compras y docentes traducen etiquetas, conservando fecha local e identidad', async ({ page }) => {
  await studentApi(page);
  await page.goto('/student/purchases');
  await expect(page.locator('tbody')).toContainText('90,15');
  await expect(page.locator('tbody')).toContainText('22 oct');
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
  await expect(page.locator('tbody')).toContainText('90.15');
  await expect(page.locator('tbody')).toContainText('USD');
  await expect(page.locator('tbody')).toContainText('Oct 22');
  await expect(page.locator('tbody')).toContainText('Partially refunded');
  await page.goto('/teachers');
  await page.locator('app-language-selector select').selectOption('en');
  await expect(page.getByText('2 courses', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'José ficticio' })).toBeVisible();
});
