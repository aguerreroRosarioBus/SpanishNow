import {defineConfig} from '@playwright/test';
import base from './playwright.i18n.config';
export default defineConfig({...base, testMatch: '11-i18n-activities.spec.ts', outputDir: 'test-results/activities-i18n'});
