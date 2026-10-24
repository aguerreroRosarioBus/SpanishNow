import { test, expect, Page, Locator } from '@playwright/test';

const zone = 'America/Argentina/Cordoba';
const user = { id: 701, role: 'teacher', name: 'Solange · Docente de prueba', email: 'piloto@example.test', isTestAccount: true, permissions: [] };
const current = { id: 1, templateId: 1, version: 2, nameEs: 'Conversación individual', nameEn: 'Individual conversation',
  descriptionEn: '', descriptionEs: '', modality: 'individual', groupSize: 1, billing: 'per_buyer', sessionsCount: 4, minutesPerSession: 50,
  seatsCovered: 1, priceAmount: 9000, currency: 'USD', validityHours: 2160, policyVersionId: 1,
  hotmartProductId: null, hotmartOfferCode: null, hotmartCheckoutUrl: null, expectations: { es: { audience: 'Para quienes quieren conversar con más confianza.' }, en: { audience: 'For learners who want to speak with more confidence.' } } };
const templates = ['active', 'draft', 'paused', 'archived'].map((status, i) => ({ id: i + 1, teacherId: 701, templateKey: 'individual-' + i, status,
  current: { ...current, id: i + 1, nameEs: ['Conversación individual', 'Tu primera clase', 'Español para viajar', 'Clases anteriores'][i], nameEn: ['Individual conversation', 'Your first class', 'Spanish for travel', 'Previous classes'][i] } }));
const policy = { freeCancelHours: 24, maxPauseHours: 720, maxPauses: 1, refundWindowHours: 360, refundMode: 'full_unused_then_review' };
const snapshot = { ...current, teacherName: user.name, templateVersion: 2, policyVersion: 1, policy, beneficiaryIds: [702], legalDocuments: [] };
const offer = { id: 1, conversationId: 1, teacherId: 701, buyerId: 702, status: 'paid', amount: 9000, currency: 'USD', sessionsCount: 4,
  minutesPerSession: 50, seatsCovered: 1, sentAt: '2026-10-23T12:00:00Z', expiresAt: '2026-11-01T12:00:00Z', snapshot, canCheckout: false, canManage: true };
const session = { id: 10, teacherId: 701, teacher: { id: 701, name: user.name, timeZone: zone }, kind: 'individual', cohortId: null, status: 'confirmed', version: 1,
  startsAt: '2026-10-27T13:00:00Z', endsAt: '2026-10-27T13:50:00Z', localStart: '2026-10-27T10:00', timeZone: zone, utcOffset: '-03:00', minutes: 50,
  participants: [{ userId: 702, name: 'Jane · Alumna de prueba', status: 'confirmed', attendance: 'pending' }], proposal: null, proposals: [], sync: [], rules: policy,
  groupResolutionRequired: false, timeZoneRulesChanged: false, serverNow: '2026-10-24T12:00:00Z', replacementSessionId: null };

async function setup(page: Page, locale: 'es' | 'en') {
  const errors: string[] = [], writes: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ user, locale }) => {
    localStorage.setItem('user', JSON.stringify(user)); localStorage.setItem('token', 'ficticio-piloto'); localStorage.setItem('spanishnow.locale', locale);
  }, { user, locale });
  let preferences = { locale, timeZone: zone, timeZoneConfirmedAt: '2026-10-22T12:00:00Z', chatUnreadEmail: false };
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.replace('/api', '');
    if (req.method() !== 'GET') writes.push(`${req.method()} ${path}`);
    if (path === '/me/preferences' && req.method() === 'PATCH') preferences = { ...preferences, ...req.postDataJSON() };
    const responses: Record<string, unknown> = {
      '/auth/me': { user }, '/features': { chat: true, class_packages: true, class_scheduling: true }, '/me/preferences': preferences,
      '/class-sessions': { items: [session], truncated: false }, '/class-sessions/10': session,
      '/class-sessions/reminders': { items: [] }, '/class-sessions/options': { students: [{ id: 702, name: 'Jane · Alumna de prueba' }], purchases: [], cohorts: [] },
      '/teacher/class-packages': templates, '/teacher/class-settings': { classesEnabledAt: '2026-10-22T12:00:00Z', salesPausedAt: null },
      '/class-offers/1': offer, '/messages/unread': { count: 0 },
      '/conversations/1': { id: 1, role: 'teacher', counterpart: { id: 702, name: 'Jane · Alumna de prueba', role: 'student' }, canSendOffers: true },
    };
    await route.fulfill({ json: responses[path] ?? [] });
  });
  return { errors, writes };
}
async function healthy(page: Page, errors: string[]) {
  expect(errors).toEqual([]);
  expect(await page.locator('body').innerText()).not.toMatch(/undefined|\[packages\.|\[schedule\.|\{(?:hours|template|policy)\}/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  const emptyButtons = await page.locator('button:visible').evaluateAll(buttons => buttons.filter(b => !b.textContent?.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')).length);
  expect(emptyButtons).toBe(0);
}
async function sameHeight(a: Locator, b: Locator) {
  const first = await a.boundingBox(), second = await b.boundingBox();
  expect(first).not.toBeNull(); expect(second).not.toBeNull();
  expect(Math.abs(first!.height - second!.height)).toBeLessThanOrEqual(1);
}

for (const locale of ['es', 'en'] as const) {
  test(`${locale}: nueva oferta, destinatario y resumen sin enviar al seleccionar`, async ({ page }, info) => {
    const { errors, writes } = await setup(page, locale);
    await page.goto('/teacher/class-offers/new?conversationId=1');
    await expect(page.locator('.recipient-strip')).toContainText('Jane');
    await page.locator('#packageChoice').selectOption({ label: locale === 'es' ? 'Conversación individual' : 'Individual conversation' });
    await expect(page.locator('.summary-price')).toContainText('90');
    await sameHeight(page.locator('.send-actions .btn-primary'), page.locator('.send-actions .btn-secondary'));
    await expect(page.locator('.preview-expectations dd')).toHaveCount(1);
    await page.locator('.language-select').selectOption(locale === 'es' ? 'en' : 'es');
    await expect(page.locator('.summary-price')).toContainText('90');
    await expect(page.locator('#packageChoice')).not.toHaveValue('0');
    await healthy(page, errors); expect(writes).toEqual(['PATCH /me/preferences']);
    await page.screenshot({ path: info.outputPath('nueva-oferta.png'), fullPage: true });
  });
  test(`${locale}: agenda, alturas y alineación, cambio de zona sin reprogramar`, async ({ page }, info) => {
    const { errors, writes } = await setup(page, locale);
    await page.goto('/schedule');
    await expect(page.getByTestId('session-card')).toBeVisible();
    await expect(page.locator('#scheduleZone')).toHaveCount(0);
    await sameHeight(page.locator('#dateFrom'), page.locator('.date-actions button[type=submit]'));
    if (info.project.name === 'desktop') {
      const input = await page.locator('#dateFrom').boundingBox(), button = await page.locator('.date-actions button[type=submit]').boundingBox();
      expect(Math.abs(input!.y - button!.y)).toBeLessThanOrEqual(1);
    }
    await page.getByTestId('change-zone').click();
    await expect(page.locator('#scheduleZone')).toBeVisible();
    await sameHeight(page.locator('#scheduleZone'), page.locator('.zone-edit-actions .btn-primary'));
    if (info.project.name === 'desktop') {
      const input = await page.locator('#scheduleZone').boundingBox(), button = await page.locator('.zone-edit-actions .btn-primary').boundingBox();
      expect(Math.abs(input!.y - button!.y)).toBeLessThanOrEqual(1);
    }
    await page.locator('#scheduleZone').fill('Cordoba');
    await page.locator('.pilot-zone-panel').getByRole('option').first().click();
    expect(writes.some(p => p.includes('/class-sessions'))).toBe(false);
    await healthy(page, errors);
    await page.screenshot({ path: info.outputPath('agenda.png'), fullPage: true });
  });
  test(`${locale}: cancelación en diálogo, teclado y conservación del motivo`, async ({ page }, info) => {
    const { errors, writes } = await setup(page, locale);
    await page.goto('/schedule');
    const trigger = page.locator('.card-actions').getByRole('button', { name: locale === 'es' ? 'Cancelar clase' : 'Cancel class', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await dialog.locator('textarea').fill('Cambio solicitado por la alumna');
    await sameHeight(dialog.locator('select'), dialog.locator('.dialog-actions .btn-danger'));
    await page.screenshot({ path: info.outputPath('cancelacion.png'), fullPage: true });
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
    await trigger.click(); await expect(dialog.locator('textarea')).toHaveValue('Cambio solicitado por la alumna');
    await expect(dialog).toHaveCSS('opacity', '1');
    await dialog.locator('textarea').focus();
    for (let i = 0; i < 10; i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
    await healthy(page, errors); expect(writes).toEqual([]);
  });
  test(`${locale}: catálogo y editor lateral con borrador`, async ({ page }, info) => {
    const { errors, writes } = await setup(page, locale);
    await page.goto('/teacher/class-packages');
    await expect(page.locator('.package-card')).toHaveCount(4);
    await page.screenshot({ path: info.outputPath('paquetes.png'), fullPage: true });
    await page.locator('[data-tour=catalog-edit]').first().click();
    const drawer = page.getByRole('dialog'); await expect(drawer).toBeVisible();
    await expect(drawer).toHaveCSS('opacity', '1');
    await drawer.locator('#nameEs').fill('Mi borrador de conversación');
    await expect(drawer.locator('#nameEs')).toHaveValue('Mi borrador de conversación');
    const originalAmount = await drawer.locator('#priceAmount').inputValue();
    await sameHeight(drawer.locator('#nameEs'), drawer.locator('#groupSize'));
    await page.screenshot({ path: info.outputPath('editor-paquete.png'), fullPage: true });
    await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0);
    await healthy(page, errors); expect(writes).toEqual([]); expect(originalAmount).toBe('9000');
  });
  test(`${locale}: proponer abre un panel sin desplazar la agenda`, async ({ page }, info) => {
    const { errors, writes } = await setup(page, locale);
    await page.goto('/schedule');
    const card = page.getByTestId('session-card'); await expect(card).toBeVisible();
    const before = await card.boundingBox();
    await page.getByTestId('open-schedule-form').click();
    const drawer = page.getByRole('dialog'); await expect(drawer).toBeVisible(); await expect(drawer).toHaveCSS('opacity', '1');
    await expect(drawer.getByTestId('schedule-form')).toBeVisible();
    await sameHeight(drawer.locator('input[name=localStart]'), drawer.locator('input[name=minutes]'));
    const after = await card.boundingBox(); expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('proponer-clase.png'), fullPage: true });
    await page.keyboard.press('Escape'); await expect(drawer).toHaveCount(0);
    await expect(page.getByTestId('open-schedule-form')).toBeFocused();
    await healthy(page, errors); expect(writes).toEqual([]);
  });
  test(`${locale}: oferta completa y oferta incompleta sin controles vacíos`, async ({ page }, info) => {
    const { errors, writes } = await setup(page, locale);
    await page.goto('/class-offers/1');
    await expect(page.locator('.offer-price')).toContainText('90');
    await expect(page.locator('.offer-version')).toContainText('2');
    await expect(page.locator('[data-testid=incomplete-offer]')).toHaveCount(0);
    await healthy(page, errors);
    await page.screenshot({ path: info.outputPath('oferta.png'), fullPage: true });
    await page.route('**/api/class-offers/1', route => route.fulfill({ json: { ...offer, status: 'sent', canCheckout: true, snapshot: { ...snapshot, policy: undefined, templateVersion: undefined, policyVersion: undefined } } }));
    await page.reload(); await expect(page.getByTestId('incomplete-offer')).toBeVisible();
    await expect(page.locator('.offer-checkout .btn-primary')).toBeDisabled();
    await healthy(page, errors); expect(writes).toEqual([]);
  });
}
