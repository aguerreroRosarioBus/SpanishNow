import { defineConfig } from '@playwright/test';
import base from './playwright.i18n.config';

export default defineConfig({ ...base, testMatch: '08-i18n-student.spec.ts' });
