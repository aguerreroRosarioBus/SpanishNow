import {defineConfig} from '@playwright/test';
import base from './playwright.i18n.config';
export default defineConfig({...base, testMatch: '13-i18n-commerce.spec.ts', outputDir: 'test-results/commerce-i18n'});
