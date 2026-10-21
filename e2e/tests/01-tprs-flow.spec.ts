import { expect, Page, test } from '@playwright/test';
import { login } from '../helpers/auth';
import { student } from '../helpers/accounts';
import { correctAnswersByQuestion } from '../helpers/api';
import { closeTutorialIfOpen, COURSE_TITLE, moveBlock, openComposer, phaseSelectValues, publish, STORY_MARIA, tutorialDialog } from '../helpers/composer';

/**
 * Criterio de aceptación TPRS: editar -> publicar -> consumir -> equivocarse -> reintentar -> salir -> volver -> completar
 * -> reencontrar la expresión. Los pasos comparten estado en la base (se reconstruye en global-setup), por eso es serial.
 */
test.describe.serial('Flujo TPRS completo', () => {
  const TOOLTIP_TEXT = 'Tooltip creado por E2E';
  let tooltipWord = '';
  let publishedRevision = 0;
  let correct: Record<string, string> = {};

  const blockBadges = (page: Page) => page.getByLabel('Bloques de la lección').locator('.badge');
  const currentBadge = (page: Page) => page.getByLabel('Bloques de la lección').locator('.badge.bg-primary');
  const blockHeading = (page: Page) => page.locator('app-lesson-block h5, app-full-story-block h5').first();
  const sidebarItem = (page: Page, title: string) => page.locator('app-player-sidebar button.list-group-item').filter({ hasText: title });

  test('1. Profesor: tutorial, mover bloque, tooltip, guardar, vista previa y publicar', async ({ page }) => {
    const dialog = await openComposer(page);

    // Tutorial: se abre la primera vez, se cierra y se reabre desde el enlace.
    await expect(tutorialDialog(page)).toBeVisible();
    await closeTutorialIfOpen(page);
    await dialog.getByRole('link', { name: '¿Cómo funciona esta plantilla?' }).click();
    await expect(tutorialDialog(page)).toBeVisible();
    await closeTutorialIfOpen(page);

    // Mover un bloque (fase Antes) abajo y volver arriba; el orden se persiste en cada movimiento.
    const original = await phaseSelectValues(dialog, 'before');
    expect(original.length).toBeGreaterThanOrEqual(2);
    await moveBlock(dialog, 'before', 0, 'abajo');
    // ngModel escribe el valor de los <select> de forma asíncrona: se reintenta hasta que el DOM se estabiliza.
    await expect.poll(() => phaseSelectValues(dialog, 'before')).toEqual([original[1], original[0], ...original.slice(2)]);
    await moveBlock(dialog, 'before', 1, 'arriba');
    await expect.poll(() => phaseSelectValues(dialog, 'before')).toEqual(original);

    // Tooltip en el primer keyframe: se selecciona la primera palabra del texto guardado.
    const keyframe = dialog.locator('section[data-phase="during"] article.block-card').filter({ has: page.locator('textarea') }).first();
    await keyframe.locator('summary').click();
    const picker = keyframe.locator('textarea.kf-select');
    const frameText = await picker.inputValue();
    tooltipWord = /^\S+/.exec(frameText.trim())![0];
    await picker.evaluate((el: HTMLTextAreaElement, length) => {
      el.focus(); el.setSelectionRange(0, length); el.dispatchEvent(new Event('select', { bubbles: true }));
    }, tooltipWord.length);
    await keyframe.getByRole('button', { name: 'Crear tooltip con la selección' }).click();
    await keyframe.getByLabel(/Contenido del tooltip para/).fill(TOOLTIP_TEXT);
    await keyframe.getByRole('button', { name: 'Guardar tooltip' }).click();
    await expect(keyframe.locator('.kf-list')).toContainText(TOOLTIP_TEXT);

    await dialog.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(dialog.getByRole('status').filter({ hasText: 'Borrador guardado' })).toBeVisible();

    // Vista previa del recorrido del alumno.
    await dialog.getByRole('button', { name: 'Vista previa' }).click();
    // La vista previa es ahora una pestaña del panel lateral (se abre/cierra con el botón del pie).
    const preview = dialog.getByRole('tabpanel');
    await expect(preview).toBeVisible();
    await expect(preview.getByRole('heading', { name: 'Antes' })).toBeVisible();
    await expect(preview.getByRole('heading', { name: 'Durante' })).toBeVisible();
    await expect(preview).toContainText(frameText.trim().slice(0, 25));
    await dialog.getByRole('button', { name: 'Cerrar vista previa' }).click();

    publishedRevision = await publish(dialog);
    expect(publishedRevision).toBeGreaterThan(2);
  });

  test('2. Alumno: expresiones, keyframes, tooltip con teclado, error, reintento, salir/volver, completar y reencuentro', async ({ page, request }) => {
    correct = await correctAnswersByQuestion(request, 1);
    await login(page, student, /student\/dashboard/);
    await page.locator('.card', { hasText: COURSE_TITLE }).getByRole('link', { name: /Continuar Aprendiendo/ }).click();
    await expect(page).toHaveURL(/student\/course\/\d+\/play/);

    await expect(page.getByRole('heading', { level: 4, name: STORY_MARIA })).toBeVisible();
    await expect(page.getByText(`Lección publicada · revisión ${publishedRevision}`)).toBeVisible();

    // La historia siguiente está bloqueada hasta completar la lectura.
    const next = sidebarItem(page, 'El Primer Día de Clase');
    await expect(next).toBeDisabled();
    await expect(next).toContainText('🔒');
    await expect(page.getByRole('button', { name: /Historia siguiente/ })).toBeDisabled();

    // Expresiones antes de la narración.
    const total = await blockBadges(page).count();
    await expect(page.locator('app-lesson-block').getByText('Antes', { exact: true })).toBeVisible();
    const expressions: string[] = [];
    let tooltipChecked = false, wrongTried = false, reloaded = false;

    for (let i = 0; i < total; i++) {
      const isQuestion = await page.getByRole('button', { name: 'Comprobar respuesta' }).isVisible();
      const isKeyframe = await page.getByRole('heading', { name: 'Fragmento de la historia' }).isVisible();
      const isFullStory = await page.getByRole('heading', { name: 'Historia completa' }).isVisible();

      if (isFullStory) {
        await expect(page.locator('app-full-story-block .story-text')).not.toBeEmpty();
        await page.getByRole('button', { name: 'Completar lectura' }).click();
        break;
      }
      if (isKeyframe && !tooltipChecked) {
        // El tooltip del keyframe se abre y se cierra con el teclado.
        const highlight = page.locator('app-lesson-block .tooltip-highlight', { hasText: tooltipWord }).first();
        await expect(highlight).toBeVisible();
        await highlight.focus();
        await page.keyboard.press('Escape');
        await expect(page.locator('.tooltip-popover')).toHaveCount(0);
        await page.keyboard.press('Enter');
        await expect(page.locator('.tooltip-popover-body')).toHaveText(TOOLTIP_TEXT);
        await page.keyboard.press('Escape');
        tooltipChecked = true;
      } else if (isQuestion) {
        const text = (await blockHeading(page).innerText()).trim();
        const answer = correct[text];
        expect(answer, `respuesta correcta conocida para «${text}»`).toBeTruthy();
        const options = page.locator('app-lesson-block .d-grid button');
        if (!wrongTried) {
          // Equivocarse: contexto + Reintentar.
          const optionTexts = (await options.allInnerTexts()).map(t => t.trim());
          const wrong = optionTexts.find(t => t !== answer)!;
          await options.filter({ hasText: new RegExp(`^\\s*${wrong}\\s*$`) }).click();
          await page.getByRole('button', { name: 'Comprobar respuesta' }).click();
          const feedback = page.getByRole('status').filter({ hasText: 'Vuelve a intentarlo' });
          await expect(feedback).toBeVisible();
          await expect(feedback.locator('blockquote')).not.toBeEmpty();
          await feedback.getByRole('button', { name: 'Reintentar' }).click();
          await expect(feedback).toBeHidden();
          wrongTried = true;
        }
        await options.filter({ hasText: new RegExp(`^\\s*${answer}\\s*$`) }).click();
        await page.getByRole('button', { name: 'Comprobar respuesta' }).click();
        await expect(page.getByRole('status').filter({ hasText: '¡Correcto!' })).toBeVisible();
      } else if (!isKeyframe) {
        expressions.push((await blockHeading(page).innerText()).trim());
      }

      await page.getByRole('button', { name: 'Continuar' }).click();
      // Esperar al bloque siguiente antes de inspeccionarlo (el avance se persiste en el servidor).
      await expect(currentBadge(page)).toContainText(`${i + 2}.`);

      // Salir y volver: tras el primer error resuelto, al recargar se retoma el mismo bloque.
      if (wrongTried && !reloaded) {
        const badge = (await currentBadge(page).innerText()).trim();
        const heading = (await blockHeading(page).innerText()).trim();
        await page.reload();
        await expect(page.getByRole('heading', { level: 4, name: STORY_MARIA })).toBeVisible();
        await expect(currentBadge(page)).toHaveText(badge);
        await expect(blockHeading(page)).toHaveText(heading);
        reloaded = true;
      }
    }

    expect(expressions.length).toBeGreaterThan(0);
    expect(tooltipChecked && wrongTried && reloaded).toBe(true);

    // Lectura completada: la historia siguiente se desbloquea.
    await expect(page.getByText('Lectura completada').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Historia completa' })).toBeVisible();
    await expect(next).toBeEnabled();
    await expect(next).not.toContainText('🔒');
    const nextArrow = page.getByRole('button', { name: 'Historia siguiente' });
    await expect(nextArrow).toBeEnabled();

    // Reencuentro: «Me llamo» reaparece como repaso en la historia siguiente.
    const lessonResponse = page.waitForResponse(r => /\/lesson-plans\/story\/\d+$/.test(r.url()) && r.request().method() === 'GET');
    await nextArrow.click();
    const lesson = await (await lessonResponse).json();
    await expect(page.getByRole('heading', { level: 4, name: 'El Primer Día de Clase' })).toBeVisible();
    const revisit = lesson.blocks.find((b: any) => b.type === 'expression' && b.vocabularyRole === 'revisit' && b.active && b.phase !== 'later');
    expect(revisit?.vocabulary?.word?.toLowerCase()).toBe('me llamo');
    await expect(page.getByRole('heading', { level: 5, name: /Me llamo/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 5, name: /Me llamo/i }).first().getByText('Repaso')).toBeVisible();
  });

  test('4. Revisión fija: el alumno conserva su revisión aunque el profesor publique otra con distinto orden', async ({ page, browser }) => {
    const studentLesson = async (p: Page) => {
      const response = p.waitForResponse(r => /\/lesson-plans\/story\/1$/.test(r.url()) && r.request().method() === 'GET');
      await p.goto('/student/course/1/play');
      const lesson = await (await response).json();
      return { revision: lesson.revision as number, order: lesson.blocks.map((b: any) => b.blockKey) as string[] };
    };
    await login(page, student, /student\/dashboard/);
    const before = await studentLesson(page);
    expect(before.revision).toBe(publishedRevision);
    await expect(page.getByText(`revisión ${publishedRevision}`)).toBeVisible();

    // Profesor: nueva revisión con el orden de las expresiones invertido.
    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();
    const dialog = await openComposer(teacherPage);
    await closeTutorialIfOpen(teacherPage);
    const original = await phaseSelectValues(dialog, 'before');
    await moveBlock(dialog, 'before', 0, 'abajo');
    await expect.poll(() => phaseSelectValues(dialog, 'before')).toEqual([original[1], original[0], ...original.slice(2)]);
    const newRevision = await publish(dialog);
    expect(newRevision).toBeGreaterThan(publishedRevision);
    await teacherContext.close();

    const after = await studentLesson(page);
    expect(after.revision).toBe(publishedRevision);
    expect(after.order).toEqual(before.order);
    await expect(page.getByText(`Lección publicada · revisión ${publishedRevision}`)).toBeVisible();
  });

  test('5. Mi Avance refleja la lectura completada y Reiniciar Progreso lo deja en 0', async ({ page }) => {
    await login(page, student, /student\/dashboard/);
    await page.goto('/student/progress');
    const course = page.locator('.card', { hasText: COURSE_TITLE });
    const row = course.locator('li.story-progress-item').filter({ hasText: STORY_MARIA });
    await expect(row).toContainText('Lectura completada');
    await expect(row).toContainText(`revisión ${publishedRevision}`);
    await expect(course).toContainText(/Historias completadas\s*1\/\d+/);

    await page.goto('/student/dashboard');
    await page.locator('.card', { hasText: COURSE_TITLE }).getByRole('button', { name: /Reiniciar Progreso/ }).click();
    await page.getByRole('button', { name: 'Reiniciar', exact: true }).click();
    await expect(page.getByText('Progreso del curso reiniciado exitosamente')).toBeVisible();

    await page.goto('/student/progress');
    const reset = page.locator('.card', { hasText: COURSE_TITLE });
    await expect(reset).toContainText(/Historias completadas\s*0\/\d+ · 0%/);
    await expect(reset.locator('li.story-progress-item').filter({ hasText: STORY_MARIA })).toContainText('Pendiente');
  });
});
