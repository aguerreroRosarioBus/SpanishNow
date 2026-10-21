import { expect, test } from '@playwright/test';
import { closeTutorialIfOpen, openComposer } from '../helpers/composer';

/** Audio de keyframe con la subida a Cloudinary interceptada: no sale ninguna petición real. */
test('subir y quitar el audio de un keyframe (backend interceptado)', async ({ page }) => {
  const AUDIO_URL = 'https://example.invalid/test.mp3';
  const calls: string[] = [];
  await page.route('**/api/lesson-plans/story/*/draft/blocks/*/audio', async route => {
    const request = route.request();
    const blockKey = /blocks\/([^/]+)\/audio/.exec(request.url())![1];
    calls.push(request.method());
    if (request.method() === 'POST') {
      expect(request.headers()['content-type']).toContain('multipart/form-data');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ blockKey, audioUrl: AUDIO_URL }) });
    } else if (request.method() === 'DELETE') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ blockKey, audioUrl: null }) });
    } else await route.continue();
  });

  const dialog = await openComposer(page);
  await closeTutorialIfOpen(page);
  const keyframe = dialog.locator('section[data-phase="during"] article.block-card').filter({ has: page.locator('textarea') }).first();
  await expect(keyframe.locator('audio')).toHaveCount(0);

  await keyframe.locator('input[type="file"]').setInputFiles({ name: 'test.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('ID3-fake-audio') });
  const player = keyframe.locator('audio');
  await expect(player).toHaveAttribute('src', AUDIO_URL);
  await expect(keyframe.getByRole('button', { name: 'Quitar audio' })).toBeVisible();
  await expect(keyframe.getByText('Elige otro archivo para reemplazar el audio.')).toBeVisible();

  await keyframe.getByRole('button', { name: 'Quitar audio' }).click();
  await expect(player).toHaveCount(0);
  await expect(keyframe.getByText('Sube un archivo de audio (opcional).')).toBeVisible();
  expect(calls).toEqual(['POST', 'DELETE']);
});
