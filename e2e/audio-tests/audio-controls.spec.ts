import { expect, test } from '@playwright/test';
import { currentMedia, openAudioLesson, serveAudio } from '../helpers/audio-fixture';

let server: Awaited<ReturnType<typeof serveAudio>>;
test.beforeAll(async () => { server = await serveAudio(); });
test.afterAll(async () => { await server.close(); });

// Audio real local (MP3 + WAV), cuenta y API ficticias; sin backend, pagos ni servicios externos.
test('seek con teclado, saltos y fin no completan la narrativa', async ({ page, request }) => {
  const { mutations, unknown, lesson } = await openAudioLesson(page, server.origin);
  const slider = page.getByRole('slider', { name: 'Posición del audio en segundos' });
  await expect(slider).toBeEnabled();
  await expect(slider).toHaveAttribute('max', /^12/);
  await slider.focus(); await slider.press('ArrowRight');
  await expect.poll(async () => (await currentMedia(page)).time).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Avanzar 10 segundos' }).click();
  await expect.poll(async () => (await currentMedia(page)).time).toBeGreaterThan(10);
  await page.getByRole('button', { name: 'Retroceder 10 segundos' }).click();
  await expect.poll(async () => (await currentMedia(page)).time).toBeLessThan(1);
  await page.getByRole('button', { name: 'Reproducir audio', exact: true }).click();
  await expect.poll(async () => (await currentMedia(page)).paused).toBe(false);
  await page.getByRole('button', { name: 'Pausar audio', exact: true }).click();
  await slider.focus(); await slider.press('End');
  await page.getByRole('button', { name: 'Reproducir audio', exact: true }).click();
  await expect(page.locator('.audio-player .status')).toHaveText('Audio finalizado');
  expect(mutations).toEqual([]); expect(unknown).toEqual([]);
  expect(lesson.progress.narrativeCompleted).toBe(false);
  await expect(page.locator('.story-text')).toContainText('María llega');
  await page.locator('.tooltip-highlight').click();
  await expect(page.locator('.tooltip-popover')).toContainText('Nombre propio');
  const range = await request.get(`${server.origin}/frame.mp3`, { headers: { Range: 'bytes=0-31', Origin: 'http://localhost:4303' } });
  expect(range.status()).toBe(206); expect(range.headers()['content-range']).toMatch(/^bytes 0-31\//);
  expect(range.headers()['access-control-allow-origin']).toBe('*'); expect((await range.body()).length).toBe(32);
});

test('A/B con campos y repetición real; cambiar lento/normal reinicia y conserva progreso', async ({ page }) => {
  const { mutations, unknown } = await openAudioLesson(page, server.origin, { full: true });
  await expect(page.getByRole('slider')).toBeEnabled();
  await page.getByText('Repetir fragmento A–B', { exact: true }).click();
  await page.getByRole('button', { name: 'Activar repetición', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('0 ≤ A < B');
  await page.getByRole('spinbutton', { name: 'Inicio A (segundos)' }).fill('1');
  await page.getByRole('spinbutton', { name: 'Fin B (segundos)' }).fill('2');
  await page.getByRole('button', { name: 'Activar repetición', exact: true }).click();
  await expect(page.getByText('Repetición A–B activa', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reproducir audio', exact: true }).click();
  await expect.poll(async () => (await currentMedia(page)).time).toBeGreaterThan(1.7);
  await expect.poll(async () => (await currentMedia(page)).time).toBeLessThan(1.4);
  await page.getByRole('button', { name: 'Salir de repetición', exact: true }).click();
  await page.getByRole('button', { name: 'Normal', exact: true }).click();
  await expect.poll(async () => (await currentMedia(page)).src).toContain('normal.wav');
  await expect.poll(async () => (await currentMedia(page)).paused).toBe(false);
  expect((await currentMedia(page)).time).toBeLessThan(1);
  await expect(page.getByRole('slider')).toBeEnabled();
  await expect(page.getByText('Repetición A–B activa', { exact: true })).toHaveCount(0);
  expect(mutations).toEqual([]); expect(unknown).toEqual([]);
  await expect(page.getByRole('button', { name: 'Completar lectura', exact: true })).toBeEnabled();
});

test('al navegar entre bloques y cerrar libera los medios anteriores', async ({ page }) => {
  const { mutations } = await openAudioLesson(page, server.origin);
  await expect(page.getByRole('slider')).toBeEnabled();
  await page.getByRole('button', { name: 'Reproducir audio', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect.poll(async () => (await currentMedia(page)).src).toContain('other.wav');
  expect(await page.evaluate(() => {
    const first = (window as any).__lessonMedia[0] as HTMLAudioElement;
    return { paused: first.paused, src: first.getAttribute('src') };
  })).toEqual({ paused: true, src: null });
  await page.getByRole('button', { name: 'Reproducir audio', exact: true }).click();
  await page.locator('app-player-sidebar').getByRole('link', { name: 'Mis cursos', exact: true }).click();
  await expect.poll(async () => (await currentMedia(page)).src).toBe('');
  expect((await currentMedia(page)).paused).toBe(true);
  expect(mutations).toEqual(['/api/lesson-plans/progress/11/current-block']);
});

test('error de red recuperable y ausencia de grabación no producen progreso', async ({ page }) => {
  const { mutations } = await openAudioLesson(page, server.origin, { full: true, unavailable: true });
  await expect(page.getByText('Audio no disponible para este contenido.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Normal', exact: true }).click();
  await expect(page.getByRole('slider')).toBeEnabled();
  // Interrupción de carga real: la próxima fuente falla, luego se habilita su recuperación.
  await page.route(`${server.origin}/normal.wav`, route => route.abort());
  await page.evaluate(() => { const media = (window as any).__lessonMedia.at(-1) as HTMLAudioElement; media.load(); });
  await expect(page.getByRole('button', { name: 'Reintentar audio', exact: true })).toBeVisible();
  await expect(page.getByRole('slider')).toBeDisabled();
  await page.unroute(`${server.origin}/normal.wav`);
  await page.getByRole('button', { name: 'Reintentar audio', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pausar audio', exact: true })).toBeVisible();
  await expect(page.getByRole('slider')).toBeEnabled();
  expect(mutations).toEqual([]);
});

test('controles táctiles a 390px con foco visible y sin desborde', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openAudioLesson(page, server.origin, { full: true });
  await expect(page.getByRole('slider')).toBeEnabled();
  const play = page.getByRole('button', { name: 'Reproducir audio', exact: true });
  await play.focus();
  expect(await play.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  const box = await play.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
  if (test.info().project.use.hasTouch) await play.tap(); else await play.click();
  await page.getByRole('button', { name: 'Avanzar 10 segundos' }).click();
  await expect.poll(async () => (await currentMedia(page)).time).toBeGreaterThan(9);
  await page.getByText('Repetir fragmento A–B', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('audio-390.png'), fullPage: true });
});
