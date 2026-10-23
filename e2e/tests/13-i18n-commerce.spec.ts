import {test, expect} from '@playwright/test';
for (const area of ['sales', 'orders']) {
  test(`${area}: idioma conserva importes, período/filtro y confirmación sin reembolsar`, async ({page}) => {
    const user = {id: 41, name: 'Docente ficticia', email: 'docente@example.test', role: 'teacher', permissions: []};
    let loads = 0, refunds = 0;
    let prefs = {locale: 'es', timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: '2026-10-22T12:00:00Z'};
    await page.addInitScript(account => {localStorage.setItem('user', JSON.stringify(account));localStorage.setItem('token', 'ficticio');localStorage.setItem('spanishnow.locale', 'es');}, user);
    await page.route(/https:\/\//, r => r.abort());
    await page.route('**/api/**', async route => {
      const req = route.request(); const path = new URL(req.url()).pathname; const json = (body: unknown) => route.fulfill({json: body});
      if (path === '/api/auth/me') return json({user});
      if (path === '/api/me/preferences') {if (req.method() === 'PATCH') prefs = {...prefs,...req.postDataJSON()};return json(prefs);}
      if (path.includes('/refund')) {refunds++;return json({});}
      if (path === '/api/teacher/sales/summary') {loads++;return json({totals: [{currency: 'USD', gross: 9015, refunds: 0, net: 9015, orders: 1, refundsCount: 0}], byMonth: [{currency: 'USD', month: '2026-01', net: 9015, orders: 1}], byCourse: []});}
      if (path === '/api/teacher/orders') {loads++;return json({rows: [{id: 1, amount: 9015, currency: 'USD', refundedAmount: 1500, status: 'paid', provider: 'hotmart', buyer: {name: 'José original', email: 'ficticio@example.test'}, course: {title: 'Curso original'}, createdAt: '2026-10-23T02:30:00Z', paidAt: null}], total: 1});}
      return json([]);
    });
    await page.goto(`/teacher/${area}`);
    if (area === 'sales') {
      await expect(page.locator('.kpi__value').first()).toContainText('90,15');
      await page.locator('app-language-selector select').selectOption('en');
      await expect(page.getByRole('heading', {name: 'Sales', exact: true})).toBeVisible();
      await expect(page.locator('.kpi__value').first()).toContainText('90.15');
      await expect(page.locator('.chart__tick').filter({hasText: 'Jan 26'})).toBeVisible();
      await expect(page.getByRole('button', {name: '12 months', exact: true})).toHaveAttribute('aria-pressed','true');
    } else {
      await page.locator('#orderQuery').fill('Borrador filtro');
      await page.getByRole('button', {name: 'Marcar como reembolsada la orden de José original'}).click();
      await page.locator('#revokeAccess').uncheck();
      await page.locator('app-language-selector select').selectOption('en');
      await expect(page.locator('#refundTitle')).toHaveText('Mark as refunded');
      await expect(page.locator('.modal-body')).toContainText('90.15');
      await expect(page.locator('.modal-body')).toContainText('USD');
      await expect(page.locator('#revokeAccess')).not.toBeChecked();
      await expect(page.locator('#orderQuery')).toHaveValue('Borrador filtro');
      await expect(page.getByText('Partial refund', {exact: true})).toBeVisible();
    }
    expect(loads).toBe(1); expect(refunds).toBe(0);
  });
}
