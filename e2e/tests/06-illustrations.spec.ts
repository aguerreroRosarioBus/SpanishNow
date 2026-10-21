import { expect, Locator, Page, test } from '@playwright/test';
import { login } from '../helpers/auth';
import { student, teacher } from '../helpers/accounts';
import { closeTutorialIfOpen, COURSE_TITLE, composerDialog, publish } from '../helpers/composer';

/**
 * Ilustraciones: dibujo en la pizarra, subida de imagen, imagen en una expresión, publicación, vista del alumno,
 * y reedición (quitar / editar dibujo). Usa una unidad propia (la siguiente historia de una unidad está bloqueada hasta completar la anterior).
 * Las subidas son locales (MEDIA_FAKE_UPLOADS en global-setup).
 */
test.describe.serial('Ilustraciones en la lección', () => {
  const UNIT_TITLE = 'Unidad E2E Ilustraciones';
  const STORY_TITLE = 'Historia E2E Ilustraciones';
  const KF1 = 'María llega a la fiesta con su amigo';
  const KF2 = 'Juan está muy contento en la fiesta';
  const ALT1 = 'María saluda a su amigo en la puerta de la fiesta';
  const TARGET = { phrase: 'llega a la fiesta', translation: 'arrives at the party' };
  // PNG 1x1 rojo.
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  let courseUrl = '';

  const duringFrames = (dialog: Locator) => dialog.locator('section[data-phase="during"] article.block-card').filter({ has: dialog.page().locator('textarea[id^="kf-text-"]') });
  const whiteboard = (page: Page) => page.getByRole('dialog', { name: /./ }).filter({ has: page.getByRole('toolbar', { name: 'Herramientas de dibujo' }) });

  /** Dibuja un trazo con el ratón sobre el lienzo vivo, en coordenadas relativas (0..1). */
  async function stroke(page: Page, points: [number, number][]): Promise<void> {
    const box = (await page.locator('canvas.wb-live').boundingBox())!;
    const at = ([x, y]: [number, number]) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
    await page.mouse.move(at(points[0]).x, at(points[0]).y);
    await page.mouse.down();
    for (const p of points.slice(1)) await page.mouse.move(at(p).x, at(p).y, { steps: 6 });
    await page.mouse.up();
  }

  async function selectPhrase(frame: Locator, phrase: string): Promise<void> {
    await frame.locator('textarea[id^="kf-text-"]').evaluate((el: HTMLTextAreaElement, wanted) => {
      const start = el.value.indexOf(wanted);
      el.focus();
      el.setSelectionRange(start, start + wanted.length);
      el.dispatchEvent(new Event('select', { bubbles: true }));
    }, phrase);
  }

  /** Dibuja con varias herramientas, deshace una vez y confirma con «Usar como ilustración». */
  async function drawAndUse(page: Page): Promise<void> {
    const wb = whiteboard(page);
    await expect(wb).toBeVisible();
    const toolbar = wb.getByRole('toolbar', { name: 'Herramientas de dibujo' });
    await stroke(page, [[0.2, 0.3], [0.4, 0.6], [0.6, 0.3], [0.8, 0.6]]);
    await toolbar.getByRole('button', { name: 'Rojo' }).click();
    await expect(toolbar.getByRole('button', { name: 'Rojo' })).toHaveAttribute('aria-pressed', 'true');
    await stroke(page, [[0.1, 0.8], [0.9, 0.8]]);
    await toolbar.getByRole('button', { name: /^Rectángulo/ }).click();
    await expect(toolbar.getByRole('button', { name: /^Rectángulo/ })).toHaveAttribute('aria-pressed', 'true');
    await stroke(page, [[0.3, 0.2], [0.7, 0.5]]);
    await stroke(page, [[0.05, 0.05], [0.2, 0.15]]); // se deshace
    await toolbar.getByRole('button', { name: /^Deshacer/ }).click();
    await expect(toolbar.getByRole('button', { name: /^Rehacer/ })).toBeEnabled();
    await wb.getByRole('button', { name: 'Usar como ilustración' }).click();
    await expect(wb).toBeHidden();
  }

  test('1-4. Profesor: dibuja, sube imagen, ilustra una expresión y publica', async ({ page }) => {
    await login(page, teacher, /teacher\/dashboard/);
    await page.locator('.card', { hasText: COURSE_TITLE }).getByRole('link', { name: /Gestionar contenido/i }).click();
    await expect(page).toHaveURL(/teacher\/course\/(\d+)\/manage/);
    courseUrl = /teacher\/course\/(\d+)\/manage/.exec(page.url())![1];

    await page.getByRole('button', { name: 'Nueva unidad' }).click();
    await page.getByLabel('Título *').fill(UNIT_TITLE);
    await page.getByLabel('Descripción *').fill('Unidad creada por el E2E de ilustraciones');
    await page.getByRole('button', { name: 'Crear Unidad' }).click();
    const unit = page.locator('app-unit-card').filter({ hasText: UNIT_TITLE });
    await expect(unit).toBeVisible();
    await unit.getByRole('button', { name: 'Agregar historia' }).click();
    await page.getByLabel('Título *').fill(STORY_TITLE);
    await page.getByRole('button', { name: 'Crear y componer lección' }).click();
    const dialog = composerDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Cargando borrador')).toBeHidden();
    await closeTutorialIfOpen(page);

    // 1. Keyframe 1 + dibujo.
    const frame1 = duringFrames(dialog).first();
    await frame1.locator('textarea[id^="kf-text-"]').fill(KF1);
    await frame1.getByRole('button', { name: 'Dibujar', exact: true }).click();
    await drawAndUse(page);
    await expect(frame1.locator('.ill-thumb img')).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    const alt1 = frame1.getByLabel('Descripción (texto alternativo)');
    await expect(alt1).toBeVisible();
    await alt1.fill(ALT1);
    await expect(frame1.locator('.ill-thumb img')).toHaveAttribute('alt', ALT1);

    // 2. Keyframe 2 + imagen subida.
    await frame1.getByRole('button', { name: '＋ Seguir la historia' }).click();
    await expect(duringFrames(dialog)).toHaveCount(2);
    const frame2 = duringFrames(dialog).nth(1);
    await frame2.locator('textarea[id^="kf-text-"]').fill(KF2);
    await frame2.locator('input[type="file"]').first().setInputFiles({ name: 'ilustracion.png', mimeType: 'image/png', buffer: PNG });
    await expect(frame2.locator('.ill-thumb img')).toBeVisible();
    await expect(frame2.getByLabel('Descripción (texto alternativo)')).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);

    // 3. Expresión objetivo con imagen dibujada desde el formulario inline.
    await selectPhrase(frame1, TARGET.phrase);
    await frame1.getByRole('button', { name: 'Marcar como expresión objetivo' }).click();
    const form = frame1.getByRole('form', { name: 'Nueva expresión' });
    await expect(form.getByLabel('Expresión')).toHaveValue(TARGET.phrase);
    await form.getByLabel('Traducción').fill(TARGET.translation);
    await form.getByRole('button', { name: 'Dibujar', exact: true }).click();
    await drawAndUse(page);
    await expect(form.getByRole('img', { name: 'Vista previa de la imagen de la expresión' })).toBeVisible();
    await form.getByRole('button', { name: 'Guardar expresión' }).click();
    await expect(form).toBeHidden();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.locator('section[data-phase="before"] .vocab-thumb img')).toBeVisible();

    // 4. Guardar y publicar.
    await dialog.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Borrador guardado' })).toBeVisible();
    expect(await publish(dialog)).toBeGreaterThanOrEqual(1);
  });

  test('5. Alumno: ve las ilustraciones', async ({ page }) => {
    await login(page, student, /student\/dashboard/);
    await page.goto(`/student/course/${courseUrl}/play`);
    const unitTitle = page.locator('.index__unit-title');
    await expect(unitTitle).not.toBeEmpty();
    for (let i = 0; i < 30; i++) {
      const current = ((await unitTitle.textContent()) ?? '').trim();
      if (current.includes(UNIT_TITLE)) break;
      await page.locator('.index__unit-nav button').last().click();
      await expect(unitTitle).not.toHaveText(current);
    }
    await expect(unitTitle).toContainText(UNIT_TITLE);
    await expect(page.getByRole('heading', { level: 1, name: STORY_TITLE })).toBeVisible();

    const loaded = (img: Locator) => expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

    // Tarjeta de la expresión con su imagen.
    await expect(page.locator('app-lesson-block .read-text--term').filter({ hasText: new RegExp(TARGET.phrase, 'i') })).toBeVisible();
    const exprImg = page.locator('app-lesson-block app-lesson-illustration img').first();
    await expect(exprImg).toHaveAttribute('alt', `Imagen de ${TARGET.phrase}`);
    await loaded(exprImg);
    await page.getByRole('button', { name: 'Continuar' }).click();

    // Keyframe 1 con su imagen, alt y vista ampliada.
    await expect(page.locator('app-lesson-block .story-text')).toContainText(KF1);
    const kfImg = page.locator('app-lesson-block .kf-image img').first();
    await expect(kfImg).toHaveAttribute('alt', ALT1);
    await loaded(kfImg);
    await page.locator('app-lesson-block .kf-image').getByRole('button', { name: /Ampliar ilustración/ }).click();
    const lightbox = page.getByRole('dialog', { name: 'Ilustración ampliada' });
    await expect(lightbox).toBeVisible();
    await loaded(lightbox.locator('img'));
    await page.keyboard.press('Escape');
    await expect(lightbox).toBeHidden();

    // Keyframe 2 (imagen subida) y luego la historia completa ilustrada.
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.locator('app-lesson-block .story-text')).toContainText(KF2);
    await loaded(page.locator('app-lesson-block .kf-image img').first());
    await page.getByRole('button', { name: 'Continuar' }).click();
    const fullStory = page.getByRole('heading', { name: 'Historia completa' });
    await expect(fullStory).toBeVisible();
    const paras = page.locator('app-full-story-block .story-para.with-image, .story-text.illustrated .story-para.with-image');
    await expect(paras).toHaveCount(2);
    await expect(paras.first()).toContainText(KF1);
    await loaded(paras.first().locator('img'));
    await loaded(paras.nth(1).locator('img'));
  });

  test('6. Profesor: quita una imagen y edita un dibujo', async ({ page }) => {
    const corsErrors: string[] = [];
    page.on('console', m => { if (/CORS|tainted/i.test(m.text())) corsErrors.push(m.text()); });
    await login(page, teacher, /teacher\/dashboard/);
    await page.goto(`/teacher/course/${courseUrl}/manage`);
    await page.getByRole('button', { name: 'Expandir todo' }).click();
    const card = page.locator('app-story-card').filter({ hasText: STORY_TITLE });
    await card.getByRole('button', { name: STORY_TITLE }).click();
    const dialog = composerDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Cargando borrador')).toBeHidden();
    await closeTutorialIfOpen(page);
    await expect(duringFrames(dialog)).toHaveCount(2);
    const frame1 = duringFrames(dialog).first();
    const frame2 = duringFrames(dialog).nth(1);
    await expect(frame1.locator('.ill-thumb img')).toBeVisible();
    await expect(frame2.locator('.ill-thumb img')).toBeVisible();

    // Quitar con confirmación.
    await frame2.getByRole('button', { name: 'Quitar', exact: true }).click();
    const confirm = frame2.getByRole('alertdialog', { name: 'Confirmar quitar la ilustración' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Quitar' }).click();
    await expect(frame2.locator('.ill-thumb')).toHaveCount(0);
    await expect(frame2.getByRole('button', { name: 'Dibujar', exact: true })).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);

    // Editar dibujo: la pizarra ofrece partir de la imagen actual y la carga sin error de CORS.
    await frame1.getByRole('button', { name: 'Editar dibujo' }).click();
    const wb = whiteboard(page);
    await expect(wb).toBeVisible();
    const base = wb.getByLabel('Partir de la imagen actual');
    await expect(base).toBeEnabled();
    await expect(base).toBeChecked();
    await expect(wb.getByText(/No se pudo cargar la imagen actual/)).toHaveCount(0);
    await wb.getByRole('button', { name: 'Cancelar' }).click();
    await expect(wb).toBeHidden();
    expect(corsErrors).toEqual([]);
  });
});
