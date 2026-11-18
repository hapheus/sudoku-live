import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
    ...base,
    testMatch: process.env.SYNC_ALL ? base.testMatch : '**/sync-convergence.spec.ts',
    outputDir: './test-results/sync-convergence',
    use: { ...base.use, baseURL: 'http://127.0.0.1:5182' },
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 5182',
        url: 'http://127.0.0.1:5182',
        reuseExistingServer: false,
    },
});
