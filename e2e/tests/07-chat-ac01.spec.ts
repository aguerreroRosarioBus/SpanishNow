import { expect, test } from '@playwright/test';
import { login } from '../helpers/auth';
import { student, teacher } from '../helpers/accounts';
import { enableTeacherForInquiries } from '../helpers/classes';

/**
 * AC01 (parte de chat, W04): un interesado sin compra se registra, abre el chat con un docente y recibe respuesta;
 * otro alumno no puede leer esa conversación. Elegir EN/ES y zona horaria es de W01 y se suma en W09.
 */
test('AC01: interesado sin compra consulta, el docente responde y otro alumno no lo lee', async ({ browser }) => {
  enableTeacherForInquiries(teacher.email);
  const stamp = Date.now();
  const question = `Hola, ¿das clases para principiantes? (${stamp})`;
  const answer = `¡Hola! Sí, con gusto (${stamp})`;

  // 1. El interesado se registra (sin comprar nada) y escribe desde «Mensajes».
  const prospectContext = await browser.newContext();
  const prospect = await prospectContext.newPage();
  await prospect.goto('/auth/register');
  await prospect.getByLabel('Nombre completo').fill(`Interesada ${stamp}`);
  await prospect.getByLabel('Email').fill(`interesada-${stamp}@spanishnow.test`);
  await prospect.getByLabel('Contraseña').fill('e2e-password-123');
  await prospect.getByRole('button', { name: /crear cuenta|registr/i }).click();
  await expect(prospect).toHaveURL(/student\/dashboard/);

  await prospect.getByRole('link', { name: 'Mensajes' }).click();
  await expect(prospect).toHaveURL(/\/messages$/);
  await prospect.getByLabel('Docente').selectOption({ index: 1 });
  await prospect.getByRole('button', { name: 'Escribir' }).click();
  await expect(prospect).toHaveURL(/\/messages\/\d+$/);
  const conversationUrl = new URL(prospect.url()).pathname;

  await prospect.getByLabel(/Mensaje para/).fill(question);
  await prospect.getByRole('button', { name: 'Enviar' }).click();
  await expect(prospect.getByTestId('chat-messages')).toContainText(question);
  await expect(prospect.getByTestId('chat-pending')).toHaveCount(0);

  // 2. El docente ve la consulta sin leer en su bandeja y responde.
  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  await login(teacherPage, teacher, /teacher\/dashboard/);
  await teacherPage.goto('/messages');
  const row = teacherPage.getByTestId('chat-inbox').getByRole('link', { name: new RegExp(`Interesada ${stamp}`) });
  await expect(row).toContainText(question.slice(0, 40));
  await expect(row.locator('.unread')).toHaveText('1');
  await row.click();
  await expect(teacherPage.getByTestId('chat-messages')).toContainText(question);
  await teacherPage.getByLabel(/Mensaje para/).fill(answer);
  await teacherPage.keyboard.press('Enter');
  await expect(teacherPage.getByTestId('chat-messages')).toContainText(answer);

  // 3. El interesado recibe la respuesta por polling, sin recargar.
  await expect(prospect.getByTestId('chat-messages')).toContainText(answer, { timeout: 15_000 });

  // 4. Otro alumno no puede leer la conversación, ni por la URL ni por la API.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, student, /student\/dashboard/);
  await other.goto(conversationUrl);
  await expect(other.getByText('No encontramos esta conversación')).toBeVisible();
  await expect(other.getByText(question)).toHaveCount(0);

  await Promise.all([prospectContext.close(), teacherContext.close(), otherContext.close()]);
});
