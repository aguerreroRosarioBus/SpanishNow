import { test, expect, Page } from '@playwright/test';

type FakeUser = { id: number; name: string; email: string; role: 'student' | 'teacher'; permissions: string[] };
const user = (role: 'student' | 'teacher', admin = false): FakeUser => ({
  id: 41, name: 'Ángela ficticia', email: 'angela@example.test', role,
  permissions: admin ? ['users.manage'] : []
});

async function mockApi(page: Page, options: { user?: FakeUser; failSave?: boolean; accountLocale?: 'en' | 'es' } = {}) {
  let prefs = { locale: options.accountLocale ?? 'en', timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: '2026-10-22T15:00:00.000Z' };
  const patches: unknown[] = [];
  let failSave = options.failSave ?? false;
  await page.addInitScript(({ account }) => {
    if (!localStorage.getItem('spanishnow.locale')) localStorage.setItem('spanishnow.locale', 'es');
    if (account) { localStorage.setItem('user', JSON.stringify(account)); localStorage.setItem('token', 'token-ficticio'); }
  }, { account: options.user });
  // Impide cualquier acceso externo durante estas pruebas.
  await page.route(/https:\/\//, route => route.abort());
  await page.route('**/api/**', async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === '/api/auth/me') return json({ user: options.user });
    if (path === '/api/auth/login') return json({ error: 'Invalid credentials', code: 'invalid_credentials', params: {} }, 401);
    if (path === '/api/me/preferences') {
      if (req.method() === 'PATCH') {
        patches.push(req.postDataJSON());
        if (failSave) { failSave = false; return json({ error: 'Prueba de fallo' }, 503); }
        prefs = { ...prefs, ...req.postDataJSON() };
      }
      return json(prefs);
    }
    if (path === '/api/public/courses') return json([{
      id: 7, slug: 'historias', title: 'Historias con María', description: 'Contenido docente original',
      price: 9015, currency: 'USD', level: 'A1', teacher: { name: 'José ficticio' }
    }]);
    if (path === '/api/checkout/session/ficticia') return json({
      status: 'paid', course: { title: 'Historias con María', slug: 'historias' },
      email: 'persona@example.test', needsPassword: true
    });
    if (path === '/api/admin/users') return json({ users: [], total: 0, page: 1, pageSize: 25 });
    if (path === '/api/admin/permissions') return json([]);
    if (path === '/api/teacher/comments') return json({ items: [], total: 0 });
    return json([]);
  });
  return { patches, saved: () => prefs };
}

test('selector público cambia lang y conserva borrador, URL, foco y elección tras recarga', async ({ page }) => {
  await mockApi(page);
  await page.goto('/auth/register?returnUrl=%2Flive%2F1');
  await page.locator('#name').fill('Nombre ficticio');
  await page.locator('#email').fill('persona@example.test');
  await page.locator('#password').fill('clave-ficticia');
  const selector = page.getByRole('combobox', { name: 'Idioma' });
  await selector.focus();
  const url = page.url();
  await selector.selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('combobox', { name: 'Language' })).toBeFocused();
  await expect(page.getByText('Create your account', { exact: true })).toBeVisible();
  await expect(page.locator('#name')).toHaveValue('Nombre ficticio');
  await expect(page.locator('#email')).toHaveValue('persona@example.test');
  await expect(page.locator('#password')).toHaveValue('clave-ficticia');
  expect(page.url()).toBe(url);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('error de login se traduce sin repetir petición ni perder los valores', async ({ page }) => {
  await mockApi(page);
  let attempts = 0;
  page.on('request', req => { if (req.method() === 'POST' && req.url().endsWith('/api/auth/login')) attempts++; });
  await page.goto('/auth/login');
  await page.locator('#email').fill('persona@example.test');
  await page.locator('#password').fill('clave-ficticia');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Email o contraseña incorrectos');
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
  await expect(page.getByRole('alert')).toContainText('Incorrect email or password');
  await expect(page.locator('#email')).toHaveValue('persona@example.test');
  expect(attempts).toBe(1);
});

test('catálogo cambia interfaz y formato de precio, conserva moneda y contenido docente', async ({ page }) => {
  await mockApi(page);
  await page.goto('/courses');
  await expect(page.getByRole('heading', { name: 'Cursos de español', exact: true })).toBeVisible();
  await expect(page.locator('.price-tag')).toContainText('90,15');
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'Spanish courses', exact: true })).toBeVisible();
  await expect(page.locator('.price-tag')).toContainText('90.15');
  await expect(page.locator('.price-tag')).toContainText('USD');
  await expect(page.getByRole('heading', { name: 'Historias con María' })).toBeVisible();
  await expect(page.getByText('Contenido docente original')).toBeVisible();
  await expect(page.getByText('By José ficticio')).toBeVisible();
});

for (const role of ['student', 'teacher'] as const) {
  test(`preferencia de ${role} carga, se guarda por cuenta y no modifica zona`, async ({ page }) => {
    const api = await mockApi(page, { user: user(role) });
    await page.goto('/settings');
    await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('en');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Language' }).selectOption('es');
    await expect.poll(() => api.saved().locale).toBe('es');
    expect(api.patches).toEqual([{ locale: 'es' }]);
    expect(api.saved().timeZone).toBe('America/Argentina/Cordoba');
    expect(api.saved().timeZoneConfirmedAt).toBe('2026-10-22T15:00:00.000Z');
    await expect(page.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Idioma' })).toHaveValue('es');
    await expect(page.locator('app-language-selector')).toHaveCount(1);
  });
}

test('administración tiene el mismo selector y conserva el filtro sin recargar', async ({ page }) => {
  await mockApi(page, { user: user('student', true), accountLocale: 'es' });
  await page.goto('/admin/users');
  const search = page.locator('input[type="search"]');
  await search.fill('filtro ficticio');
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
  await expect(search).toHaveValue('filtro ficticio');
  const nav = page.locator('app-sidebar-nav');
  await expect(nav.getByRole('link', { name: 'Users', exact: true })).toHaveAttribute('href', '/admin/users');
  expect(page.url()).toContain('/admin/users');
  await expect(page.locator('app-language-selector')).toHaveCount(1);
});

test('zona requiere confirmación y alternar idioma conserva el borrador', async ({ page }) => {
  const api = await mockApi(page, { user: user('student') });
  await page.goto('/settings');
  const zone = page.locator('#time-zone');
  await expect(zone).toHaveValue('America/Argentina/Cordoba');
  await zone.fill('Asia/Kathmandu');
  await expect(page.getByRole('button', { name: 'Save time zone', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Language' }).selectOption('es');
  await expect(zone).toHaveValue('Asia/Kathmandu');
  await page.locator('#confirm-time-zone').check();
  await page.getByRole('button', { name: 'Guardar zona horaria', exact: true }).click();
  await expect.poll(() => api.saved().timeZone).toBe('Asia/Kathmandu');
  expect(api.patches).toEqual([{ locale: 'es' }, { timeZone: 'Asia/Kathmandu', confirmTimeZone: true }]);
});

test('fallo de persistencia avisa y permite reintentar conservando elección local', async ({ page }) => {
  const api = await mockApi(page, { user: user('student'), failSave: true });
  await page.goto('/settings');
  await page.getByRole('combobox', { name: 'Language' }).selectOption('es');
  await expect(page.getByText('No pudimos guardar las preferencias en tu cuenta. Intenta de nuevo.')).toBeVisible();
  expect(api.saved().locale).toBe('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect.poll(() => api.saved().locale).toBe('es');
  await expect(page.locator('.preference-error')).toHaveCount(0);
});

test('cabecera a 320px mantiene selector visible y sin desbordamiento horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await mockApi(page, { user: user('teacher') });
  await page.goto('/settings');
  await expect(page.getByRole('combobox', { name: 'Language' })).toBeVisible();
  const sizes = await page.locator('header.navbar-top').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
});

test('retornos de pago traducen estado y conservan curso y destinatario', async ({ page }) => {
  await mockApi(page);
  await page.goto('/checkout/success?session_id=ficticia');
  await expect(page.getByRole('heading', { name: '¡Ya puedes entrar!' })).toBeVisible();
  await expect(page.getByText('Tu compra de Historias con María está confirmada.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'You’re in!' })).toBeVisible();
  await expect(page.getByText('Your purchase of Historias con María is confirmed.')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'persona@example.test' })).toBeVisible();
  await page.goto('/checkout/thanks');
  await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Language' }).selectOption('es');
  await expect(page.getByRole('heading', { name: 'Pago recibido' })).toBeVisible();
});
