import { defineConfig } from '@playwright/test';

export default defineConfig({
    workers: 1,
    preserveOutput: 'always',
    testDir: './tests/qa',
    testMatch: '**/*.spec.ts',
    snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
    use: {
        baseURL: 'http://127.0.0.1:5178',
        browserName: 'chromium',
        channel: 'chromium',
        // Match headless rendering: native scrollbars otherwise consume 15px in headed mode.
        launchOptions: { args: ['--hide-scrollbars'] },
        reducedMotion: 'reduce',
        locale: 'en-US',
        timezoneId: 'Europe/Vienna',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 5178',
        url: 'http://127.0.0.1:5178',
        reuseExistingServer: !process.env.CI,
    },
});
