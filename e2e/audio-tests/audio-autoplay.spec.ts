import { expect, test } from '@playwright/test';
import { currentMedia, openAudioLesson, serveAudio } from '../helpers/audio-fixture';

// Los snapshots de trace evalúan JavaScript y activarían el documento antes del intento.
test.use({ trace: 'off' });
let server: Awaited<ReturnType<typeof serveAudio>>;
test.beforeAll(async () => { server = await serveAudio(); });
test.afterAll(async () => { await server.close(); });

test('el navegador rechaza autoplay sin gesto y permite recuperar con teclado', async ({ page }) => {
  const { mutations } = await openAudioLesson(page, server.origin, { withoutActivation: true });
  // Evitar evaluaciones de Playwright antes del intento: Chromium las ejecuta con userGesture=true.
  const cdp = await page.context().newCDPSession(page);
  const activation = await cdp.send('Runtime.evaluate', {
    expression: `new Promise(resolve => {
      const observer = new MutationObserver(attempt);
      function attempt() {
        const button = document.querySelector('.audio-player .transport button');
        if (!button) return;
        observer.disconnect();
        const active = navigator.userActivation.hasBeenActive;
        button.click(); resolve(active);
      }
      observer.observe(document, { childList: true, subtree: true }); attempt();
    })`,
    userGesture: false, awaitPromise: true, returnByValue: true,
  });
  await cdp.detach();
  expect(activation.result.value).toBe(false);
  await expect(page.getByRole('alert')).toContainText('El navegador interrumpió o bloqueó el audio');
  expect((await currentMedia(page)).paused).toBe(true);
  const play = page.getByRole('button', { name: 'Reproducir audio', exact: true });
  await play.focus(); await play.press('Space');
  await expect(page.locator('.audio-player .status')).toHaveText('Reproduciendo');
  await expect(page.locator('.audio-error')).toHaveCount(0);
  expect((await currentMedia(page)).paused).toBe(false);
  expect(mutations).toEqual([]);
});
