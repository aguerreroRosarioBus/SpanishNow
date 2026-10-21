import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';
import { student } from '../helpers/accounts';

test('el alumno no recibe correctAnswer en GET /api/lesson-plans/story/:id', async ({ page }) => {
  await login(page, student, /student\/dashboard/);
  const responses: string[] = [];
  page.on('response', async r => {
    if (/\/api\/lesson-plans\/story\/\d+$/.test(r.url()) && r.request().method() === 'GET') responses.push(await r.text());
  });
  const first = page.waitForResponse(r => /\/api\/lesson-plans\/story\/1$/.test(r.url()) && r.request().method() === 'GET');
  // The first story is a video welcome, not a TPRS question lesson.
  await page.goto('/student/course/1/play?story=1');
  const response = await first;
  expect(response.ok()).toBe(true);
  const raw = await response.text();
  expect(raw).not.toContain('correctAnswer');

  // La lección sí trae las preguntas con sus opciones, solo sin la respuesta correcta.
  const lesson = JSON.parse(raw);
  const questions = lesson.blocks.filter((b: any) => b.type === 'question' && b.active);
  expect(questions.length).toBeGreaterThan(0);
  for (const q of questions) {
    expect(q.question?.questionText).toBeTruthy();
    expect(q.question).not.toHaveProperty('correctAnswer');
    expect(q).not.toHaveProperty('questionSnapshot');
  }
  expect(responses.join('')).not.toContain('correctAnswer');
});
