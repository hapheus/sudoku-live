import { defineConfig } from '@playwright/test';

export default defineConfig({
    workers: 1,
    preserveOutput: 'always',
    testDir: './tests/qa',
    testMatch: '**/*.spec.ts',
    snapshotPathTemplate: '{testDir}/baselines/{arg}{ext}',
    use: {
        baseURL: 'http://127.0.0.1:5178',
        headless: true,
        browserName: 'chromium',
        channel: 'chromium',
        // Keep screenshot geometry stable while leaving scrolling enabled.
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
