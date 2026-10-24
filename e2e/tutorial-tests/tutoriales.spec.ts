import { test, expect, Page } from '@playwright/test';

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

const user = { id: 701, role: 'teacher', name: 'Docente de prueba', email: 'tutorial@example.test', isTestAccount: true, permissions: [] };
const conversation = { id: 1, role: 'teacher', counterpart: { id: 702, name: 'Alumno de prueba', role: 'student' }, context: null, canSendOffers: true,
  blockedByMe: false, blockedByOther: false, reportedByMe: false, lastReadSeq: 0, lastMessageSeq: 0, teacherReplied: true, unreadCount: 0 };
const template = { id: 1, teacherId: 701, templateKey: 'individual', status: 'active', current: {
  id: 1, templateId: 1, version: 1, nameEs: 'Cuatro clases individuales', nameEn: 'Four individual classes',
  modality: 'individual', groupSize: 1, billing: 'per_buyer', sessionsCount: 4, minutesPerSession: 50, seatsCovered: 1,
  priceAmount: 9000, currency: 'USD', validityHours: 720, policyVersionId: 1, expectations: { es: {}, en: {} },
} };
const snapshot = { ...template.current, teacherName: user.name, templateVersion: 1, policyVersion: 1,
  beneficiaryIds: [702], policy: { freeCancelHours: 24, maxPauseHours: 168, maxPauses: 1, refundWindowHours: 360 }, legalDocuments: [] };
const offer = { id: 1, conversationId: 1, teacherId: 701, buyerId: 702, status: 'sent', amount: 9000, currency: 'USD',
  sessionsCount: 4, minutesPerSession: 50, seatsCovered: 1, sentAt: '2026-10-23T12:00:00Z', expiresAt: '2027-01-01T12:00:00Z',
  snapshot, canCheckout: false, canManage: false };
const blocks = [
  { blockKey: 'keyframe-tutorial', type: 'keyframe', phase: 'during', active: true, required: true, position: 0, text: 'María llega a la fiesta.', audioUrl: '/tutorial.wav' },
  { blockKey: 'full-tutorial', type: 'full_story', phase: 'after', active: true, required: true, position: 1 },
];
const course = { id: 1, title: 'Curso ficticio', teacherId: 701, level: 'A1', enrollmentCount: 0,
  units: [{ id: 1, title: 'Primera unidad', courseId: 1, order: 1, stories: [
    { id: 100, unitId: 1, title: 'Historia ficticia', text: 'María llega a la fiesta.', order: 1, hasLessonPlan: true, lessonStatus: 'published' },
  ] }] };

async function populated(page: Page) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api', '');
    const responses: Record<string, unknown> = {
      '/teacher/class-packages': [template], '/teacher/class-settings': { classesEnabledAt: '2026-10-23T12:00:00Z', salesPausedAt: null },
      '/class-offers/1': offer,
      '/teacher/class-purchases': [{ id: 1, offerId: 1, buyerId: 702, buyerName: 'Alumno ficticio', teacherId: 701, version: 1, status: 'active',
        expiresAt: '2027-01-01T12:00:00Z', paidAt: '2026-10-23T12:00:00Z', pauseCount: 0, minutesPerSession: 50, seatsCovered: 1,
        snapshot, balance: { granted: 4, available: 3, reserved: 1, consumed: 0, expired: 0, refunded: 0 } }],
      '/courses/1': course, '/courses/1/students': [], '/materials/course/1': [],
      '/lesson-plans/story/100/draft': { id: 1, storyId: 100, revision: 1, status: 'draft', blocks },
      '/lesson-plans/story/100': { id: 1, storyId: 100, revision: 1, status: 'published', blocks,
        story: { id: 100, title: 'Historia ficticia', fullStoryText: 'María llega a la fiesta.' },
        progress: { id: 1, lastBlockKey: blocks[0].blockKey, narrativeCompleted: false, answers: [], reinforcements: [] } },
      '/enrollments/my-courses': [{ id: 1, courseId: 1, studentId: 701, lessonProgress: [] }],
      '/enrollments/1/progress': { stories: [], quizzes: [], certificate: null },
      '/questions/story/100': [], '/vocabulary/unit/1': [],
      '/integrations/google-calendar/status': { status: 'disconnected', calendars: [] },
      '/live-classes/1': { id: 1, teacherId: 701, courseId: null, title: 'Sala ficticia', status: 'draft',
        allowStudentEdit: false, revision: 1, isOwner: true, updatedAt: '2026-10-23T12:00:00Z', createdAt: '2026-10-23T12:00:00Z',
        participants: [], board: { activePageId: 'page1', pages: [{ id: 'page1', title: 'Primera página', format: 'wide', background: 'plain', elements: [] }] } },
    };
    if (path.includes('comments') && route.request().method() === 'GET') return route.fulfill({ json: { rows: [], total: 0 } });
    if (Object.hasOwn(responses, path)) return route.fulfill({ json: responses[path] });
    return route.fallback();
  });
}

async function setup(page: Page, role = 'teacher', locale = 'es') {
  const writes: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') && !['GET', 'OPTIONS'].includes(request.method())) {
      writes.push(`${request.method()} ${path.replace('/api', '')}`);
    }
  });
  await page.addInitScript(({ user, role, locale }) => {
    localStorage.setItem('user', JSON.stringify({ ...user, role }));
    localStorage.setItem('token', 'tutorial-ficticio');
    localStorage.setItem('spanishnow.locale', locale);
  }, { user, role, locale });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api', '');
    let data: unknown = [];
    if (path === '/auth/me') data = { user: { ...user, role } };
    else if (path === '/me/preferences') data = { locale, timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: '2026-10-23T12:00:00Z', chatUnreadEmail: false };
    else if (path === '/features') data = { chat: true, class_packages: true, class_scheduling: true };
    else if (path === '/class-sessions') data = { items: [], truncated: false };
    else if (path === '/class-sessions/reminders') data = { items: [] };
    else if (path === '/class-sessions/options') data = { students: [], purchases: [], cohorts: [], whiteboards: [] };
    else if (path === '/live-classes/google/status') data = { configured: false, connected: false };
    else if (path === '/conversations') data = { items: [], nextCursor: null };
    else if (path === '/conversations/1') data = { ...conversation, role, counterpart: { ...conversation.counterpart, role: role === 'teacher' ? 'student' : 'teacher' } };
    else if (path.endsWith('/messages')) data = { items: [], nextCursor: null, hasMore: false };
    else if (path === '/conversations/unread') data = { count: 0 };
    else if (path === '/teachers/available') data = [];
    else if (path === '/me/class-packages' || path === '/teacher/class-purchases') data = [];
    else if (path === '/teacher/class-packages') data = [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return writes;
}

const popover = (page: Page) => page.locator('.spanishnow-tour');
const next = (page: Page) => page.locator('.driver-popover-next-btn').click();

async function finish(page: Page) {
  for (let step = 0; step < 20; step++) {
    await expect(popover(page)).toBeVisible();
    const title = await page.locator('.driver-popover-title').textContent();
    if (title === 'Ya conoces el próximo paso' || title === 'You know the next step') {
      await next(page); await expect(popover(page)).toHaveCount(0); return;
    }
    await next(page);
  }
  throw new Error('La guía no terminó');
}

test('agenda docente: práctica real, teclado, cierre, repetición y ninguna escritura', async ({ page }) => {
  const writes = await setup(page);
  await page.goto('/schedule');
  const help = page.getByTestId('screen-help');
  await expect(help).toBeVisible();
  await help.click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Entender tu agenda');
  await expect(page.getByTestId('schedule-form')).toHaveCount(0);
  await next(page); await next(page);
  await expect(page.locator('.driver-popover-title')).toHaveText('Explora una propuesta');
  await expect(page.locator('.driver-popover-next-btn')).toHaveText('Omitir práctica');
  await page.getByTestId('open-schedule-form').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Elegir y revisar');
  await popover(page).evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  await page.screenshot({ path: test.info().outputPath('agenda-guia.png') });
  await expect(page.getByTestId('schedule-form')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popover(page)).toHaveCount(0);
  const proposalPanel = page.locator('.pilot-sheet');
  await expect.poll(() => proposalPanel.evaluate(panel => panel.contains(document.activeElement))).toBe(true);
  await expect(page.getByRole('heading', { name: 'Agenda de clases', exact: true })).toBeVisible();
  await expect(page.getByTestId('schedule-form')).toBeVisible();
  expect(writes).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(proposalPanel).toHaveCount(0);
  await help.click(); await finish(page);
  expect(await page.evaluate(() => localStorage.getItem('spanishnow.tutorial.701.teacher.schedule.v1'))).toBe('completed');
  await expect(help).toBeVisible();
  await page.reload();
  await expect(help).toBeVisible();
  await expect(page.getByText('¿Primera vez aquí?', { exact: false })).toHaveCount(0);
  await help.click(); await page.getByRole('button', { name: 'Cerrar guía', exact: true }).click();
  await expect(help).toBeFocused();
});

test('omitir práctica mantiene cerrado el formulario y salta campos ausentes', async ({ page }) => {
  const writes = await setup(page);
  await page.goto('/schedule'); await page.getByTestId('screen-help').click();
  await next(page); await next(page); await next(page);
  await expect(page.locator('.driver-popover-title')).toHaveText('Encontrar una clase');
  await expect(page.getByTestId('schedule-form')).toHaveCount(0);
  await finish(page);
  expect(writes).toEqual([]);
});

test('alumno EN: pasos por rol, movimiento reducido, teclado y móvil sin desbordamiento', async ({ page }) => {
  const writes = await setup(page, 'student', 'en');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/schedule'); await page.getByTestId('screen-help').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Understand your schedule');
  await expect(page.locator('.driver-popover-close-btn')).toHaveAttribute('aria-label', 'Close guide');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('.spanishnow-tour'))).toBe(true);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await expect(page.locator('.driver-popover-title')).toHaveText('Find a class');
  const box = await popover(page).boundingBox(); const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  await expect(page.getByTestId('open-schedule-form')).toHaveCount(0);
  await finish(page); expect(writes).toEqual([]);
});

test('aula: abrir preparación no crea sala y la guía se puede cerrar', async ({ page }) => {
  const writes = await setup(page);
  await page.goto('/live'); await page.getByTestId('screen-help').click();
  await next(page);
  await expect(page.locator('.driver-popover-title')).toHaveText('Explora una sala nueva');
  await page.locator('[data-tour="live-create"]').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Preparar antes de empezar');
  await page.keyboard.press('Escape');
  await expect(page.locator('.create-form')).toBeVisible(); expect(writes).toEqual([]);
});

test('mensajes y paquetes vacíos: propósito útil, fin disponible y sugerencia descartable', async ({ page }) => {
  await setup(page, 'student');
  await page.goto('/messages');
  await page.getByRole('button', { name: 'Ocultar sugerencia' }).click();
  await expect(page.getByTestId('screen-help')).toBeVisible();
  await page.getByTestId('screen-help').click(); await finish(page);
  await page.goto('/class-packages');
  await page.getByTestId('screen-help').click();
  await expect(page.locator('.driver-popover-description')).toContainText('saldo y vigencia');
  await finish(page);
});

test('navegar durante una guía la destruye y no la marca completada', async ({ page }) => {
  await setup(page);
  await page.goto('/schedule'); await page.getByTestId('screen-help').click();
  // Navegación real del router por historial del navegador.
  await page.evaluate(() => { history.pushState({}, '', '/live'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page).toHaveURL(/\/live$/);
  await expect(popover(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('spanishnow.tutorial.701.teacher.schedule.v1'))).toBeNull();
  await page.getByTestId('screen-help').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Encontrar tu aula en vivo');
});

test('las tres pantallas de paquetes explican su diferencia antes de abrir Ayuda', async ({ page }) => {
  await setup(page); await populated(page);
  const cases = [
    ['/teacher/class-packages', 'Prepara las opciones de clases que vas a ofrecer', 'Preparar paquetes para ofrecer'],
    ['/teacher/class-purchases', 'Consulta las clases que ya compró cada alumno', 'Entender los paquetes comprados'],
    ['/teacher/class-cohorts', 'Reúne a los alumnos que van a tomar clases juntos', 'Formar un grupo'],
  ];
  for (const [path, heading, title] of cases) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.locator('.package-orientation nav a')).toHaveCount(2);
    await page.screenshot({ path: test.info().outputPath(path.split('/').at(-1)! + '.png'), fullPage: true });
    await page.getByTestId('screen-help').click();
    await expect(page.locator('.driver-popover-title')).toHaveText(title);
    await finish(page);
  }
});

test('catálogo y oferta: practicar selección y edición no guarda ni envía', async ({ page }) => {
  const writes = await setup(page); await populated(page);
  await page.goto('/teacher/class-packages'); await page.getByTestId('screen-help').click();
  await next(page); await next(page); await next(page);
  await expect(page.locator('.driver-popover-title')).toHaveText('Explora una plantilla');
  await page.locator('[data-tour="catalog-edit"]').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Guardar una versión nueva');
  await page.keyboard.press('Escape'); expect(writes).toEqual([]);
  await page.goto('/teacher/class-offers/new?conversationId=1');
  await page.getByTestId('screen-help').click(); await next(page);
  await page.locator('#packageChoice').selectOption({ label: 'Cuatro clases individuales' });
  await expect(page.locator('.driver-popover-title')).toHaveText('Revisar antes de enviar');
  await finish(page); expect(writes).toEqual([]);
  await page.goto('/class-offers/1'); await page.getByTestId('screen-help').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Revisar una oferta'); await finish(page);
});

test('curso y compositor: pestaña, vista previa y Escape sin cerrar el editor ni publicar', async ({ page }) => {
  const writes = await setup(page); await populated(page);
  await page.addInitScript(() => localStorage.setItem('spanishnow.lesson-tutorial.701.v1', '1'));
  await page.goto('/teacher/course/1/manage'); await page.getByTestId('screen-help').click();
  await next(page); await next(page);
  await page.locator('[data-tour="course-students"]').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Gestionar con contexto');
  await page.keyboard.press('Escape');
  await page.locator('.filter-chip').first().click();
  await page.locator('.story-row__title').click();
  await expect(page.locator('.composer-dialog')).toBeVisible();
  await page.locator('button[appTutorial="composer"]').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Diseñar una lección');
  await next(page); await next(page); await next(page); await next(page);
  await expect(page.locator('.driver-popover-title')).toHaveText('Prueba la vista del alumno');
  await page.locator('[data-tour="composer-preview"]').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Revisar antes de publicar');
  await page.keyboard.press('Escape');
  await expect(page.locator('.composer-dialog')).toBeVisible();
  await expect(page.locator('button[appTutorial="composer"]')).toBeFocused();
  expect(writes).toEqual([]);
});

test('historia: abrir repetición no reproduce, responde ni completa progreso', async ({ page }) => {
  const writes = await setup(page, 'student'); await populated(page);
  await page.route('**/tutorial.wav', route => route.abort());
  await page.goto('/student/course/1/play');
  await expect(page.getByRole('heading', { name: 'Historia ficticia', exact: true })).toBeVisible();
  await page.getByTestId('screen-help').click();
  await next(page); await next(page); await next(page); await next(page);
  await expect(page.locator('.driver-popover-title')).toHaveText('Explora la repetición');
  await page.locator('app-lesson-audio-controls details summary').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Continuar cuando estés listo');
  await finish(page); expect(writes).toEqual([]);
  await expect(page.locator('.steps__current')).toContainText('Paso 1');
});

test('pizarra e integraciones: controles reales y conexiones sin activar proveedores', async ({ page }) => {
  const writes = await setup(page); await populated(page);
  await page.goto('/live/1'); await page.getByTestId('screen-help').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Orientarte en el aula');
  await next(page); await next(page); await next(page); await next(page);
  await page.locator('.collaborators').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Consultar y volver');
  await page.keyboard.press('Escape');
  await expect(page.locator('.room-panel')).toBeVisible();
  expect(writes.filter(path => !path.endsWith('/presence'))).toEqual([]);
  await page.goto('/teacher/integrations'); await page.getByTestId('screen-help').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Conectar tus herramientas');
  await finish(page);
});

test('conversación: la guía preserva el borrador y no manda mensajes', async ({ page }) => {
  const writes = await setup(page);
  await page.goto('/messages/1');
  await page.locator('textarea').fill('Quiero consultar un horario');
  const before = writes.length;
  await page.getByTestId('screen-help').click();
  await expect(page.locator('.driver-popover-title')).toHaveText('Acordar el próximo paso');
  await finish(page);
  await expect(page.locator('textarea')).toHaveValue('Quiero consultar un horario');
  expect(writes.slice(before)).toEqual([]);
});
