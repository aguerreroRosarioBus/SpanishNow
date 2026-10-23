import { expect, test } from '@playwright/test';
import { currentMedia, openAudioLesson, serveAudio } from '../helpers/audio-fixture';

let server: Awaited<ReturnType<typeof serveAudio>>;
test.beforeAll(async () => { server = await serveAudio(); });
test.afterAll(async () => { await server.close(); });

test('selector global traduce audio activo y conserva medio, borrador A/B y progreso', async ({ page }) => {
  const { mutations, unknown, lesson } = await openAudioLesson(page, server.origin, { full: true });
  await expect(page.getByRole('slider')).toBeEnabled();
  await page.getByText('Repetir fragmento A–B', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Inicio A (segundos)' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Fin B (segundos)' }).fill('11');
  await page.getByRole('button', { name: 'Activar repetición', exact: true }).click();
  await page.getByRole('button', { name: 'Reproducir audio', exact: true }).click();
  await expect.poll(async () => (await currentMedia(page)).time).toBeGreaterThan(1.5);
  const before = await currentMedia(page);
  await page.getByRole('combobox', { name: 'Idioma' }).selectOption('en');
  await expect(page.getByRole('button', { name: 'Pause audio', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Full story', exact: true})).toBeVisible();
  await expect(page.getByRole('progressbar', {name: 'Course progress'})).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Audio position in seconds' })).toBeEnabled();
  await expect(page.getByRole('spinbutton', { name: 'Start A (seconds)' })).toHaveValue('1');
  await expect(page.getByRole('spinbutton', { name: 'End B (seconds)' })).toHaveValue('11');
  const after = await currentMedia(page);
  expect(after.count).toBe(before.count);
  expect(after.src).toBe(before.src);
  expect(after.paused).toBe(false);
  expect(after.time).toBeGreaterThanOrEqual(before.time);
  expect(lesson.progress.narrativeCompleted).toBe(false);
  await expect(page.locator('.story-text')).toContainText('María llega a la fiesta.');
  expect(mutations).toEqual(['/api/me/preferences']);
  expect(unknown).toEqual([]);
});


test('selector conserva respuesta de comprensión escrita, bloque y progreso', async ({page}) => {
  const {mutations, unknown, lesson} = await openAudioLesson(page, server.origin);
  (lesson.blocks as unknown[]).push({blockKey: 'q1', position: 3, type: 'question', phase: 'during', active: true, questionId: 9, question: {questionText: '¿Dónde está María?', answerType: 'open_ended'}});
  lesson.progress.lastBlockKey = 'q1';
  await page.reload();
  await page.getByRole('textbox', {name: 'Tu respuesta', exact: true}).fill('Respuesta humana original');
  const before = [...mutations];
  await page.locator('app-language-selector select').selectOption('en');
  await expect(page.getByRole('heading', {name: 'Comprehension question'})).toBeVisible();
  await expect(page.getByRole('textbox', {name: 'Your answer', exact: true})).toHaveValue('Respuesta humana original');
  await expect(page.getByText('¿Dónde está María?', {exact: true})).toBeVisible();
  expect(lesson.progress.lastBlockKey).toBe('q1');
  expect(lesson.progress.narrativeCompleted).toBe(false);
  expect(mutations.slice(before.length)).toEqual(['/api/me/preferences']);
  expect(unknown).toEqual([]);
});
