import {test, expect} from '@playwright/test';
for (const area of ['coupons', 'affiliates']) {
  test(`${area}: idioma conserva borrador, importes y confirmación sin mutar datos`, async ({page}) => {
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
      if (path === '/api/teacher/coupons' || path === '/api/coupons') {loads++;return json([{id: 1, code: 'PRIMAVERA', percentOff: null, amountOff: 1500, currency: 'usd', courseId: null, maxRedemptions: 5, redemptions: 0, expiresAt: '2026-10-23T00:00:00.000Z', active: true}]);}
      if (/\/affiliates$/.test(path)) {loads++;return json([{id: 7, name: 'Ana ficticia', email: 'ana@example.test', code: 'ANA1', commissionPercent: 20, active: true, notes: null, stats: [{currency: 'usd', orders: 1, sales: 9015, commission: 1800, paid: 0, owed: 1800}]}]);}
      if (/\/(orders|payouts)$/.test(path)) return json([]);
      return json([]);
    });
    await page.goto(`/teacher/${area}`);
    if (area === 'coupons') {
      await expect(page.getByRole('heading', {name: 'Cupones', exact: true})).toBeVisible();
      await expect(page.locator('td').filter({hasText: '15,00'}).first()).toBeVisible();
      await page.getByRole('button', {name: 'Eliminar el cupón PRIMAVERA'}).click();
      await page.locator('app-language-selector select').selectOption('en');
      await expect(page.getByText('Delete coupon PRIMAVERA?')).toBeVisible();
      await expect(page.locator('td').filter({hasText: '15.00'}).first()).toBeVisible();
      await expect(page.getByText('Oct 23, 2026')).toBeVisible();
    } else {
      await page.getByRole('button', {name: 'Ver detalle de Ana ficticia'}).click();
      await page.locator('#payAmount').fill('12.5');
      await page.locator('#payNote').fill('Borrador pago');
      await page.locator('app-language-selector select').selectOption('en');
      await expect(page.getByRole('heading', {name: 'Payments'})).toBeVisible();
      await expect(page.locator('#payAmount')).toHaveValue('12.5');
      await expect(page.locator('#payNote')).toHaveValue('Borrador pago');
      await expect(page.locator('.summary')).toContainText('90.15');
      await expect(page.locator('.summary')).toContainText('USD');
    }
    expect(loads).toBe(1); expect(writes).toBe(0);
  });
}
