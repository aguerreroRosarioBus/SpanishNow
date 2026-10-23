import { defineConfig } from '@playwright/test';
import base from './playwright.i18n.config';
export default defineConfig({ ...base, testMatch: '09-i18n-public.spec.ts', outputDir: 'test-results/public-i18n' });
