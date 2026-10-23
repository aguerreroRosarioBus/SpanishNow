import {defineConfig} from '@playwright/test';
import base from './playwright.i18n.config';
export default defineConfig({...base, testMatch: '12-i18n-comments.spec.ts', outputDir: 'test-results/comments-i18n'});
