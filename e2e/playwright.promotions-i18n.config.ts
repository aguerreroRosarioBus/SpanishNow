import {defineConfig} from '@playwright/test';
import base from './playwright.i18n.config';
export default defineConfig({...base, testMatch: '14-i18n-promotions.spec.ts', outputDir: 'test-results/promotions-i18n'});
