import { test, expect, Page } from '@playwright/test';
async function mockApi(page: Page) {
  const requests = {quote: 0, checkout: 0};
  await page.addInitScript(() => localStorage.setItem('spanishnow.locale', 'es'));
  await page.route(/https:\/\//, route => route.abort());
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({json: body, status});
    if (path.includes('/quote')) { requests.quote++; return json({code: 'coupon_expired', error: 'PRIVATE_INTERNAL'}, 400); }
    if (path.includes('/checkout')) { requests.checkout++; return json({}, 503); }
    if (path === '/api/public/courses/historias') return json({id: 7, slug: 'historias', title: 'Historias originales', description: 'Texto docente original', teacher: {name: 'José original'}, level: 'A1', price: 9015, currency: 'USD', checkoutProvider: 'site', materialsCount: 2, units: [{id: 1, title: 'Unidad docente original', order: 1, stories: [{id: 1, title: 'Narración original', order: 1, hasVideo: true}], hasQuiz: true}]});
    if (path.startsWith('/api/public/affiliate-dashboard/')) return json({affiliate: {name: 'José original', code: 'JOSE', commissionPercent: 12.5}, links: [{courseTitle: 'Historias originales', url: 'https://example.test/c?ref=JOSE'}], stats: [{currency: 'USD', orders: 1, sales: 9015, commission: 1127, paid: 1000, owed: 127}], orders: [{paidAt: '2026-10-22T12:30:00Z', courseTitle: 'Historias originales', amount: 9015, currency: 'USD', commissionAmount: 1127, commissionStatus: 'pending'}], payouts: [{paidAt: '2026-10-22', amount: 1000, currency: 'USD', note: 'Nota humana original'}]});
    if (path.startsWith('/api/public/certificates/')) return json({code: 'K7QM-X2PD-9TNA', studentName: 'José original', teacherName: 'María original', courseTitle: 'Historias originales', issuedAt: '2026-10-22T12:30:00Z'});
    return json([]);
  });
  return requests;
}
test('venta: cambia texto, plural, precio y error conservando cupón sin repetir compra', async ({page}) => {
  const requests = await mockApi(page);
  await page.goto('/courses/historias');
  await expect(page.getByRole('heading', {name: 'Contenido del curso', exact: true})).toBeVisible();
  await expect(page.locator('.price-tag')).toContainText('90,15');
  await page.getByRole('button', {name: '¿Tienes un cupón?'}).click();
  await page.getByRole('textbox', {name: 'Código de cupón'}).fill('BORRADOR');
  await page.getByRole('button', {name: 'Aplicar', exact: true}).click();
  await expect(page.locator('#couponError')).toHaveText('Este cupón venció.');
  await page.locator('app-language-selector select').selectOption('en');
  await expect(page.getByRole('heading', {name: "What's inside", exact: true})).toBeVisible();
  await expect(page.locator('.price-tag')).toContainText('USD');
  await expect(page.locator('.price-tag')).toContainText('90.15');
  await expect(page.locator('#couponCode')).toHaveValue('BORRADOR');
  await expect(page.locator('#couponError')).toHaveText('This coupon has expired.');
  await expect(page.getByText('1 unit · 1 lesson')).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Historias originales', exact: true})).toBeVisible();
  expect(requests).toEqual({quote: 1, checkout: 0});
});
test('afiliados y certificado conservan nombres, código, moneda, notas y fechas', async ({page}) => {
  await mockApi(page);
  await page.goto('/affiliate/ficticio');
  await expect(page.getByRole('heading', {name: 'Hola, José original'})).toBeVisible();
  await expect(page.locator('.kpi__hint')).toContainText('90,15');
  await page.locator('app-language-selector select').selectOption('en');
  await expect(page.getByRole('heading', {name: 'Hi, José original'})).toBeVisible();
  await expect(page.locator('.kpi__hint')).toContainText('90.15');
  await expect(page.locator('.kpi__hint')).toContainText('USD');
  await expect(page.getByText('Nota humana original')).toBeVisible();
  await expect(page.getByText('Oct 22, 2026', {exact: true})).toHaveCount(2);
  await page.goto('/certificates/K7QM-X2PD-9TNA');
  await page.locator('app-language-selector select').selectOption('en');
  await expect(page.getByText('Valid certificate', {exact: true})).toBeVisible();
  await page.locator('app-language-selector select').selectOption('es');
  await expect(page.getByText('Certificado válido', {exact: true})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'José original', exact: true})).toBeVisible();
  await expect(page.getByText('K7QM-X2PD-9TNA', {exact: true})).toBeVisible();
  await expect(page.getByRole('link', {name: 'Descargar PDF'})).toHaveAttribute('href', /K7QM-X2PD-9TNA\/pdf\?lang=es$/);
});
