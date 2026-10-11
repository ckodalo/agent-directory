import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: '**/directory-ui.spec.js',
  use: { browserName: 'chromium', channel: 'msedge', headless: true },
  workers: 1
});
