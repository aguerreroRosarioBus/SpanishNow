import {test, expect} from '@playwright/test';
for (const activity of ['flashcard', 'matching', 'listen-repeat']) {
  test(`${activity}: idioma conserva progreso y contenido original sin recargar`, async ({page}) => {
    const user = {id: 41, name: 'Alumno ficticio', email: 'alumno@example.test', role: 'student', permissions: []};
    let loads = 0;
    let prefs = {locale: 'es', timeZone: 'America/Argentina/Cordoba', timeZoneConfirmedAt: '2026-10-22T12:00:00Z'};
    await page.addInitScript(account => { localStorage.setItem('user', JSON.stringify(account)); localStorage.setItem('token', 'ficticio'); localStorage.setItem('spanishnow.locale','es'); }, user);
    await page.route(/https:\/\//, r => r.abort());
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname; const json = (body: unknown) => route.fulfill({json: body});
      if (path === '/api/auth/me') return json({user});
      if (path === '/api/me/preferences') { if (route.request().method() === 'PATCH') prefs = {...prefs,...route.request().postDataJSON()}; return json(prefs); }
      if (path.includes('/vocabulary/unit/')) {loads++;return json([{id: 1, word: 'palabra original', translation: 'original word'}, {id: 2, word: 'segunda palabra', translation: 'second word'}]);}
      if (path.includes('/repetition-activities/story/')) {loads++;return json([{id: 1, phrase: 'Frase original', audioUrl: null}, {id: 2, phrase: 'Otra frase original', audioUrl: null}]);}
      return json([]);
    });
    await page.goto(`/student/${activity}/1`);
    if (activity === 'flashcard') {
      await page.locator('.flashcard-container').click();
      await expect(page.locator('.flashcard')).toHaveClass(/flipped/);
      await page.locator('app-language-selector select').selectOption('en');
      await expect(page.getByRole('heading', {name: 'Vocabulary flashcards', exact: true})).toBeVisible();
      await expect(page.locator('.flashcard')).toHaveClass(/flipped/);
      await expect(page.locator('.flashcard')).toContainText('palabra original');
    } else if (activity === 'matching') {
      await page.getByRole('button', {name: 'palabra original', exact: true}).click();
      await page.locator('app-language-selector select').selectOption('en');
      await expect(page.getByRole('heading', {name: 'Match the words', exact: true})).toBeVisible();
      await expect(page.getByRole('button', {name: 'palabra original', exact: true})).toHaveClass(/selected/);
      await page.getByRole('button', {name: 'original word', exact: true}).click();
      await expect(page.getByRole('button', {name: 'palabra original', exact: true})).toBeDisabled();
    } else {
      await page.getByRole('button', {name: 'Calificar con 4 estrellas', exact: true}).click();
      await page.locator('app-language-selector select').selectOption('en');
      await expect(page.getByRole('heading', {name: 'Listen and repeat', exact: true})).toBeVisible();
      await expect(page.getByRole('button', {name: 'Rate 4 stars', exact: true})).toHaveClass(/active/);
      await expect(page.getByRole('heading', {name: 'Frase original', exact: true})).toBeVisible();
    }
    expect(loads).toBe(1);
  });
}
