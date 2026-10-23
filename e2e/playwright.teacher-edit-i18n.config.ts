import {defineConfig} from '@playwright/test';
import base from './playwright.i18n.config';
export default defineConfig({...base, testMatch: '15-i18n-teacher-edit.spec.ts', outputDir: 'test-results/teacher-edit-i18n'});
