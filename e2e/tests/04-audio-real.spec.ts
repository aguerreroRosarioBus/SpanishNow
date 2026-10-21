import { expect, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { closeTutorialIfOpen, openComposer } from '../helpers/composer';

/**
 * Subida REAL a Cloudinary (consume cuota). Solo corre con E2E_REAL_CLOUDINARY=1 y credenciales válidas en backend/.env.
 * Genera un .mp3 corto con ffmpeg si existe; si no, usa e2e/fixtures/tone.mp3 si está presente.
 */
test.skip(process.env.E2E_REAL_CLOUDINARY !== '1', 'Define E2E_REAL_CLOUDINARY=1 para subir audio real a Cloudinary');

function shortMp3(): string {
  const fixture = path.resolve(__dirname, '../fixtures/tone.mp3');
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-audio-')), 'tone.mp3');
  try {
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-q:a', '9', out], { stdio: 'ignore' });
    return out;
  } catch {
    if (fs.existsSync(fixture)) return fixture;
    throw new Error('Falta ffmpeg y no existe e2e/fixtures/tone.mp3');
  }
}

test('subir y quitar audio real de un keyframe', async ({ page }) => {
  const dialog = await openComposer(page);
  await closeTutorialIfOpen(page);
  const keyframe = dialog.locator('section[data-phase="during"] article.block-card').filter({ has: page.locator('textarea') }).first();
  await keyframe.locator('input[type="file"]').setInputFiles(shortMp3());
  await expect(keyframe.locator('audio')).toHaveAttribute('src', /^https:\/\/res\.cloudinary\.com\//, { timeout: 60_000 });
  await keyframe.getByRole('button', { name: 'Quitar audio' }).click();
  await expect(keyframe.locator('audio')).toHaveCount(0);
});
