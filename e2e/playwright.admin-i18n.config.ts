import { defineConfig } from '@playwright/test';
import base from './playwright.i18n.config';
export default defineConfig({...base, testMatch: '10-i18n-admin.spec.ts', outputDir: 'test-results/admin-i18n'});
