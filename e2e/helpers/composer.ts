import { expect, Locator, Page } from '@playwright/test';
import { login } from './auth';
import { teacher } from './accounts';

export const STORY_MARIA = 'María en la Fiesta';
export const COURSE_TITLE = 'Español A1 - Completo';

export const composerDialog = (page: Page): Locator => page.getByRole('dialog', { name: /Compositor de lección/ });
export const tutorialDialog = (page: Page): Locator => page.getByRole('dialog', { name: /Cómo construir una lección/ });

/** Profesor: login -> gestión del curso -> compositor de la historia. Cierra el tutorial si se abre solo. */
export async function openComposer(page: Page, storyTitle = STORY_MARIA): Promise<Locator> {
  await login(page, teacher, /teacher\/dashboard/);
  await page.locator('app-course-card', { hasText: COURSE_TITLE }).getByRole('link', { name: /Gestionar contenido/i }).click();
  await expect(page).toHaveURL(/teacher\/course\/\d+\/manage/);
  await page.getByRole('button', { name: 'Expandir todo' }).click();
  await page.locator('app-story-card').filter({ hasText: storyTitle }).getByRole('button', { name: storyTitle }).click();
  const dialog = composerDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Cargando borrador')).toBeHidden();
  return dialog;
}

export async function closeTutorialIfOpen(page: Page): Promise<void> {
  const tutorial = tutorialDialog(page);
  if (await tutorial.isVisible()) {
    await tutorial.getByRole('button', { name: 'Cerrar tutorial' }).click();
    await expect(tutorial).toBeHidden();
  }
}

/** Ids de vocabulario (valor del select) de los bloques de expresión de una fase, en orden. */
export async function phaseSelectValues(dialog: Locator, phase: string): Promise<string[]> {
  const cards = dialog.locator(`section[data-phase="${phase}"] article.block-card`);
  const n = await cards.count();
  const selects = { nth: (i: number) => cards.nth(i).locator('select').first() };
  return Promise.all(Array.from({ length: n }, (_, i) => selects.nth(i).inputValue()));
}

/** Mueve el bloque `index` de una fase con los botones accesibles y espera a que el orden quede guardado. */
export async function moveBlock(dialog: Locator, phase: string, index: number, direction: 'abajo' | 'arriba'): Promise<void> {
  const card = dialog.locator(`section[data-phase="${phase}"] article.block-card`).nth(index);
  await card.getByRole('button', { name: new RegExp(`^Mover .* ${direction}$`) }).click();
  await expect(dialog.locator('main.timeline')).toHaveAttribute('aria-busy', 'false');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
}

export async function publish(dialog: Locator): Promise<number> {
  await dialog.getByRole('button', { name: 'Publicar revisión' }).click();
  const notice = dialog.getByRole('status').filter({ hasText: /Revisión \d+ publicada/ });
  await expect(notice).toBeVisible();
  return Number(/Revisión (\d+) publicada/.exec(await notice.innerText())![1]);
}
