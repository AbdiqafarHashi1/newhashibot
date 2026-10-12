import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ownerPreview', testMatch: '**/*.spec.ts', timeout: 180000,
  workers: 1, retries: 0, reporter: [['list']],
  use: { actionTimeout: 10000, baseURL: 'http://127.0.0.1:4173', launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {} },
  projects: [
    { name: 'desktop', use: { viewport: { width:1440, height:1000 } } },
    { name: 'phone', use: { viewport: { width:390, height:844 }, isMobile:true, hasTouch:true } },
  ],
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4173', port:4173, reuseExistingServer: !process.env.CI },
});
