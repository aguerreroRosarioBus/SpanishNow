import { expect, Locator, Page, test } from '@playwright/test';
import { login } from '../helpers/auth';
import { student, teacher } from '../helpers/accounts';
import { closeTutorialIfOpen, COURSE_TITLE, composerDialog, publish } from '../helpers/composer';

/**
 * Composición incremental: historia nueva solo con título -> compositor -> fragmento a fragmento con preguntas inline y
 * expresiones marcadas en el texto -> panel lateral -> publicar -> texto reconstruido -> el alumno la recorre.
 * La historia se crea en una unidad nueva: dentro de una unidad la siguiente historia está bloqueada hasta completar la anterior.
 */
test.describe.serial('Composición incremental de una lección', () => {
  const UNIT_TITLE = 'Unidad E2E Incremental';
  const STORY_TITLE = 'Historia E2E Incremental';
  const KF1 = 'María llega a la fiesta con su amigo';
  const KF2 = 'Juan está muy contento en la fiesta';
  const TARGET1 = { phrase: 'llega a la fiesta', translation: 'arrives at the party' };
  const TARGET2 = { phrase: 'muy contento', translation: 'very happy' };
  const Q1 = '¿María llega a la fiesta?';
  const Q2 = '¿Juan está contento o triste?';
  let courseUrl = '';

  const duringFrames = (dialog: Locator) => dialog.locator('section[data-phase="during"] article.block-card').filter({ has: dialog.page().locator('textarea[id^="kf-text-"]') });
  const beforeBlocks = (dialog: Locator) => dialog.locator('section[data-phase="before"] article.block-card');

  /** Selecciona `phrase` dentro del textarea del keyframe y lanza el evento que escucha el compositor. */
  async function selectPhrase(frame: Locator, phrase: string): Promise<void> {
    await frame.locator('textarea[id^="kf-text-"]').evaluate((el: HTMLTextAreaElement, wanted) => {
      const start = el.value.indexOf(wanted);
      el.focus();
      el.setSelectionRange(start, start + wanted.length);
      el.dispatchEvent(new Event('select', { bubbles: true }));
    }, phrase);
  }

  async function markTarget(dialog: Locator, frame: Locator, target: { phrase: string; translation: string }): Promise<void> {
    await selectPhrase(frame, target.phrase);
    await expect(frame.locator('.mark-expression .helper')).toContainText(target.phrase);
    await frame.getByRole('button', { name: 'Marcar como expresión objetivo' }).click();
    const form = frame.getByRole('form', { name: 'Nueva expresión' });
    await expect(form.getByLabel('Expresión')).toHaveValue(target.phrase);
    await form.getByLabel('Traducción').fill(target.translation);
    await form.getByRole('button', { name: 'Guardar expresión' }).click();
    await expect(form).toBeHidden();
    await expect(dialog.getByRole('status').filter({ hasText: `«${target.phrase}» añadida como expresión objetivo en Antes` })).toBeVisible();
  }

  test('1-5. Profesor: crea la historia con solo título, compone incrementalmente, revisa el panel y publica', async ({ page }) => {
    await login(page, teacher, /teacher\/dashboard/);
    await page.locator('.card', { hasText: COURSE_TITLE }).getByRole('link', { name: /Gestionar Contenido/ }).click();
    await expect(page).toHaveURL(/teacher\/course\/(\d+)\/manage/);
    courseUrl = /teacher\/course\/(\d+)\/manage/.exec(page.url())![1];

    // Unidad nueva (por la regla de desbloqueo secuencial del alumno).
    await page.getByRole('button', { name: '+ Nueva Unidad' }).click();
    await page.getByLabel('Título *').fill(UNIT_TITLE);
    await page.getByLabel('Descripción *').fill('Unidad creada por el E2E de composición incremental');
    await page.getByRole('button', { name: 'Crear Unidad' }).click();
    const unit = page.locator('app-unit-card').filter({ hasText: UNIT_TITLE });
    await expect(unit).toBeVisible();

    // 1. Historia solo con título -> «Crear y componer lección» abre el compositor.
    await unit.getByRole('button', { name: '+ Historia' }).click();
    const create = page.getByRole('button', { name: 'Crear y componer lección' });
    await expect(create).toBeDisabled();
    await page.getByLabel('Título *').fill(STORY_TITLE);
    await create.click();
    const dialog = composerDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Cargando borrador')).toBeHidden();
    await closeTutorialIfOpen(page);
    await expect(duringFrames(dialog)).toHaveCount(1);
    await expect(duringFrames(dialog).first().locator('textarea[id^="kf-text-"]')).toHaveValue('');
    await expect(beforeBlocks(dialog)).toHaveCount(0);

    // 2. Keyframe 1 + pregunta Sí/No inline.
    const frame1 = duringFrames(dialog).first();
    await frame1.locator('textarea[id^="kf-text-"]').fill(KF1);
    await frame1.getByRole('button', { name: '＋ Pregunta sobre esto' }).click();
    const q1Form = dialog.getByRole('form', { name: 'Nueva pregunta' });
    await q1Form.getByLabel('Pregunta', { exact: true }).fill(Q1);
    await q1Form.getByRole('radio', { name: 'Sí / No' }).check();
    await q1Form.getByRole('group', { name: 'Respuesta correcta' }).getByRole('radio', { name: 'Sí' }).check();
    await q1Form.getByRole('button', { name: 'Guardar pregunta' }).click();
    await expect(q1Form).toBeHidden();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.locator('section[data-phase="during"] article.block-card select').first()).toHaveValue(/\d+/);

    // Keyframe 2 + pregunta de dos opciones inline.
    await frame1.getByRole('button', { name: '＋ Seguir la historia' }).click();
    await expect(duringFrames(dialog)).toHaveCount(2);
    const frame2 = duringFrames(dialog).nth(1);
    await expect(frame2.locator('textarea[id^="kf-text-"]')).toBeFocused();
    await frame2.locator('textarea[id^="kf-text-"]').fill(KF2);
    await frame2.getByRole('button', { name: '＋ Pregunta sobre esto' }).click();
    const q2Form = dialog.getByRole('form', { name: 'Nueva pregunta' });
    await q2Form.getByLabel('Pregunta', { exact: true }).fill(Q2);
    await q2Form.getByRole('radio', { name: 'Dos opciones' }).check();
    await q2Form.locator('input[name="a"]').fill('contento');
    await q2Form.locator('input[name="b"]').fill('triste');
    await q2Form.getByRole('group', { name: 'Respuesta correcta' }).getByRole('radio', { name: 'contento' }).check();
    await q2Form.getByRole('button', { name: 'Guardar pregunta' }).click();
    await expect(q2Form).toBeHidden();
    await expect(dialog.getByRole('alert')).toHaveCount(0);

    // 3. Dos expresiones objetivo marcadas desde el texto -> aparecen en «Antes».
    await markTarget(dialog, frame1, TARGET1);
    await expect(beforeBlocks(dialog)).toHaveCount(1);
    await markTarget(dialog, frame2, TARGET2);
    await expect(beforeBlocks(dialog)).toHaveCount(2);
    await expect(beforeBlocks(dialog).first()).toContainText('Expresión');
    await expect(beforeBlocks(dialog).first().locator('select').first().locator('option:checked')).toContainText(`${TARGET1.phrase} — ${TARGET1.translation}`);
    await expect(beforeBlocks(dialog).nth(1).locator('select').first().locator('option:checked')).toContainText(`${TARGET2.phrase} — ${TARGET2.translation}`);

    // 4. Panel lateral: historia hasta ahora y chequeo TPRS.
    await dialog.getByRole('tab', { name: /La historia hasta ahora/ }).click();
    const storyPanel = dialog.getByRole('tabpanel');
    await expect(storyPanel.locator('.story-text')).toContainText(KF1);
    await expect(storyPanel.locator('.story-text')).toContainText(KF2);
    expect((await storyPanel.locator('.story-text').innerText()).replace(/\s+/g, ' ')).toBe(`${KF1} ${KF2}`);

    await dialog.getByRole('tab', { name: /Chequeo TPRS/ }).click();
    const item = (label: string) => dialog.getByRole('tabpanel').locator('li').filter({ hasText: label });
    await expect(item('expresiones objetivo')).toHaveClass(/ok/);
    await expect(item('expresiones objetivo')).toContainText('cumplido');
    await expect(item('Fragmentos con texto')).toHaveClass(/ok/);
    await expect(item('Preguntas Sí/No')).toHaveClass(/ok/);
    await expect(item('Reaparición')).not.toHaveClass(/ok/);
    await expect(item('Reaparición')).toContainText('pendiente');
    await expect(item('Una lectura completa')).toHaveClass(/ok/); // el borrador nuevo ya trae la lectura completa en «Después»

    // 5. Guardar borrador y publicar.
    await dialog.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Borrador guardado' })).toBeVisible();
    const revision = await publish(dialog);
    expect(revision).toBeGreaterThanOrEqual(1);

    // El texto de la historia se reconstruyó desde los keyframes: «Editar Texto» lo muestra de solo lectura.
    await dialog.getByRole('button', { name: 'Cerrar compositor' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: /Expandir todas/ }).click();
    const card = page.locator('app-story-card').filter({ hasText: STORY_TITLE });
    await card.getByText(STORY_TITLE).first().click();
    await card.getByRole('button', { name: /Editar Texto/ }).click();
    const editor = page.locator('.modal-content', { hasText: 'Editar Historia' });
    await expect(editor.getByLabel('Texto de la Historia')).toHaveValue(`${KF1}\n\n${KF2}`);
    await expect(editor.getByLabel('Texto de la Historia')).toHaveJSProperty('readOnly', true);
    await expect(editor.getByText('Se genera desde la lección')).toBeVisible();
  });

  test('6. Alumno: abre la historia nueva, ve el primer keyframe y responde la pregunta Sí/No', async ({ page }) => {
    await login(page, student, /student\/dashboard/);
    await page.goto(`/student/course/${courseUrl}/play`);

    // Ir a la unidad nueva con las flechas de unidad del menú lateral.
    const unitTitle = page.locator('.unit-nav-title');
    await expect(unitTitle).not.toBeEmpty();
    for (let i = 0; i < 30; i++) {
      const current = ((await unitTitle.textContent()) ?? '').trim();
      if (current.includes(UNIT_TITLE)) break;
      await page.locator('.unit-nav button').last().click();
      await expect(unitTitle).not.toHaveText(current); // esperar a que cambie de unidad antes de volver a pulsar
    }
    await expect(unitTitle).toContainText(UNIT_TITLE);
    await expect(page.getByRole('heading', { level: 4, name: STORY_TITLE })).toBeVisible();
    await expect(page.getByText(/Lección publicada · revisión \d+/)).toBeVisible();

    const next = () => page.getByRole('button', { name: 'Continuar' }).click();
    // Antes: las dos expresiones objetivo marcadas.
    for (const target of [TARGET1, TARGET2]) {
      await expect(page.getByRole('heading', { level: 5, name: new RegExp(target.phrase, 'i') })).toBeVisible();
      await expect(page.locator('app-lesson-block')).toContainText(target.translation);
      await next();
    }

    // Durante: primer keyframe y su pregunta Sí/No (primero una respuesta incorrecta, luego la correcta).
    await expect(page.getByRole('heading', { name: 'Fragmento de la historia' })).toBeVisible();
    await expect(page.locator('app-lesson-block .story-text')).toContainText(KF1);
    await next();
    await expect(page.getByRole('heading', { level: 5, name: Q1 })).toBeVisible();
    const options = page.locator('app-lesson-block .d-grid button');
    await expect(options).toHaveText([/Sí/, /No/]);
    await options.filter({ hasText: /^\s*No\s*$/ }).click();
    await page.getByRole('button', { name: 'Comprobar respuesta' }).click();
    const feedback = page.getByRole('status').filter({ hasText: 'Vuelve a intentarlo' });
    await expect(feedback).toBeVisible();
    await feedback.getByRole('button', { name: 'Reintentar' }).click();
    await options.filter({ hasText: /^\s*Sí\s*$/ }).click();
    await page.getByRole('button', { name: 'Comprobar respuesta' }).click();
    await expect(page.getByRole('status').filter({ hasText: '¡Correcto!' })).toBeVisible();
    await next();

    // Segundo keyframe.
    await expect(page.locator('app-lesson-block .story-text')).toContainText(KF2);
  });
});
