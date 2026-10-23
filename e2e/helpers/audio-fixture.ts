import { createServer, Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

/** WAV PCM real, sin codecs externos, para comprobar metadata/seek además del MP3 versionado. */
function wav(): Buffer {
  const sampleRate = 8000, samples = sampleRate * 12;
  const body = Buffer.alloc(44 + samples * 2);
  body.write('RIFF'); body.writeUInt32LE(body.length - 8, 4); body.write('WAVEfmt ', 8);
  body.writeUInt32LE(16, 16); body.writeUInt16LE(1, 20); body.writeUInt16LE(1, 22);
  body.writeUInt32LE(sampleRate, 24); body.writeUInt32LE(sampleRate * 2, 28);
  body.writeUInt16LE(2, 32); body.writeUInt16LE(16, 34); body.write('data', 36);
  body.writeUInt32LE(samples * 2, 40);
  return body;
}

/** Servidor exclusivo del test: HTTP real con CORS y Range, sin interceptar HTMLMediaElement. */
export async function serveAudio(): Promise<{ origin: string; close: () => Promise<void> }> {
  const files = { mp3: readFileSync(resolve(__dirname, '../fixtures/audio-controls.mp3')), wav: wav() };
  const server: Server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Range, Content-Length');
    res.setHeader('Accept-Ranges', 'bytes');
    const extension = req.url?.endsWith('.wav') ? 'wav' : 'mp3';
    const file = files[extension];
    res.setHeader('Content-Type', extension === 'wav' ? 'audio/wav' : 'audio/mpeg');
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(range[2] ? Number(range[2]) : file.length - 1, file.length - 1);
      if (start > end || start >= file.length) { res.writeHead(416, { 'Content-Range': `bytes */${file.length}` }); res.end(); return; }
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${file.length}`, 'Content-Length': end - start + 1 });
      res.end(req.method === 'HEAD' ? undefined : file.subarray(start, end + 1));
    } else {
      res.writeHead(200, { 'Content-Length': file.length }); res.end(req.method === 'HEAD' ? undefined : file);
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve, reject) => {
    server.closeAllConnections(); server.close(error => error ? reject(error) : resolve());
  }) };
}

export async function openAudioLesson(page: Page, origin: string, options: { full?: boolean; unavailable?: boolean; mediaGate?: Promise<void>; withoutActivation?: boolean } = {}) {
  const mutations: string[] = [];
  const unknown: string[] = [];
  let preferences = { locale: null as 'en' | 'es' | null, timeZone: null, timeZoneConfirmedAt: null };
  const lesson = {
    id: 1, storyId: 100, revision: 1, status: 'published',
    story: { id: 100, title: 'Historia de prueba de audio', fullStoryText: 'María llega a la fiesta.',
      audioSlowUrl: `${origin}/slow.mp3`, audioNormalUrl: `${origin}/normal.wav` },
    blocks: [
      { blockKey: 'k1', position: 0, type: 'keyframe', phase: 'during', active: true, text: 'María llega a la fiesta.',
        audioUrl: `${origin}/frame.mp3`, tooltips: [{ startOffset: 0, endOffset: 5, selectedText: 'María', tooltipContent: 'Nombre propio' }] },
      { blockKey: 'k2', position: 1, type: 'keyframe', phase: 'during', active: true, text: 'Otro fragmento.', audioUrl: `${origin}/other.wav` },
      { blockKey: 'f1', position: 2, type: 'full_story', phase: 'after', active: true },
    ],
    progress: { id: 11, lastBlockKey: options.full ? 'f1' : 'k1', narrativeCompleted: false, answers: [], reinforcements: [] },
  };
  if (options.unavailable) lesson.story.audioSlowUrl = '';
  await page.addInitScript(() => {
    localStorage.setItem('token', 'token-ficticio-w03');
    localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Alumno ficticio', email: 'audio@example.invalid', role: 'student', permissions: [] }));
    const NativeAudio = window.Audio;
    (window as any).__lessonMedia = [];
    window.Audio = new Proxy(NativeAudio, { construct(target, args) {
      const media = Reflect.construct(target, args);
      (window as any).__lessonMedia.push(media);
      return media;
    } });
  });
  // Bloqueo de red ajena al servidor frontend, fixtures de medios y API simulada.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/')) {
      if (route.request().method() !== 'GET') mutations.push(url.pathname);
      let body: unknown;
      if (url.pathname === '/api/auth/me') body = { user: { id: 1, name: 'Alumno ficticio', role: 'student' } };
      else if (url.pathname === '/api/me/preferences') {
        if (route.request().method() === 'PATCH') preferences = { ...preferences, ...route.request().postDataJSON() };
        body = preferences;
      }
      else if (url.pathname === '/api/features') body = {chat: false};
      else if (url.pathname === '/api/conversations/unread') body = {messages: 0, conversations: 0};
      else if (url.pathname === '/api/enrollments/my-courses') body = [{ id: 1, courseId: 1, studentId: 1, lessonProgress: [] }];
      else if (url.pathname === '/api/enrollments/1/progress') body = { stories: [], quizzes: [], certificate: null };
      else if (url.pathname === '/api/courses/1') body = { id: 1, title: 'Curso ficticio', units: [{ id: 1, title: 'Unidad', order: 1,
        stories: [{ id: 100, title: 'Historia de prueba de audio', order: 1 }] }] };
      else if (url.pathname === '/api/lesson-plans/story/100') body = lesson;
      else if (url.pathname.endsWith('/current-block')) {
        lesson.progress.lastBlockKey = route.request().postDataJSON().blockKey;
        body = { lastBlockKey: lesson.progress.lastBlockKey, narrativeCompleted: false, revision: 1 };
      } else if (url.pathname.includes('comments')) body = { rows: [], total: 0 };
      else if (url.pathname.includes('tooltips') || url.pathname === '/api/vocabulary/unit/1') body = [];
      else { unknown.push(url.pathname); body = {}; }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    } else if (url.origin === origin) {
      await options.mediaGate;
      await route.continue();
    } else if (url.hostname === 'localhost' && url.port === '4303') await route.continue();
    else await route.abort();
  });
  if (options.withoutActivation) {
    // page.goto/locator evalúan utilidades con userGesture=true; CDP conserva un documento sin activación.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.enable');
    const loaded = new Promise<void>(resolve => { cdp.once('Page.loadEventFired', () => resolve()); });
    await cdp.send('Page.navigate', { url: 'http://localhost:4303/student/course/1/play' });
    await loaded;
    await cdp.detach();
  } else {
    await page.goto('/student/course/1/play', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Historia de prueba de audio' }).waitFor();
  }
  return { mutations, unknown, lesson };
}

export async function currentMedia(page: Page): Promise<{ time: number; duration: number; paused: boolean; src: string; count: number }> {
  return page.evaluate(() => {
    const list: HTMLAudioElement[] = (window as any).__lessonMedia;
    const media = list.at(-1)!;
    return { time: media.currentTime, duration: media.duration, paused: media.paused, src: media.getAttribute('src') || '', count: list.length };
  });
}
