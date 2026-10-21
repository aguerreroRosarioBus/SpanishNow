import { expect, Page } from '@playwright/test';

export async function login(page: Page, creds: { email: string; password: string }, landing: RegExp): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Contraseña').fill(creds.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(landing);
}
