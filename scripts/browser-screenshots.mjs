#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { localScreenshotBroker, prepareScreenshotPath, screenshotBootstrap, screenshotScenes } from './screenshots/scenes.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const usage = 'Usage: npm run browser:screenshots -- [--size 880x640] [--lang en|de] [--out <folder>] [--ws-url <local-broker-url>]';

async function main() {
    const { values } = parseArgs({
        options: {
            help: { type: 'boolean', short: 'h' },
            size: { type: 'string', default: '880x640' },
            lang: { type: 'string', default: 'en' },
            out: { type: 'string' },
            'ws-url': { type: 'string' },
        },
    });
    if (values.help) {
        console.log(usage);
        return;
    }

    const size = values.size.match(/^([1-9]\d*)x([1-9]\d*)$/i);
    const width = Number(size?.[1]);
    const height = Number(size?.[2]);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !['en', 'de'].includes(values.lang)) {
        throw new Error(usage);
    }
    const wsUrl = localScreenshotBroker(values['ws-url']);
    const output = path.resolve(values.out ?? path.join(root, 'artifacts/browser-screenshots'));
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sudoku-browser-screenshots-'));
    let browser;
    let server;
    try {
        process.env.VITE_ITCH_BUILD = 'true';
        const config = { root, mode: 'itch', build: { outDir: directory }, logLevel: 'warn' };
        await build(config);
        server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
        const { port } = server.httpServer.address();

        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
        await page.addInitScript({ content: screenshotBootstrap(values.lang, wsUrl) });
        await page.addInitScript({ path: prepareScreenshotPath });
        await page.goto(`http://127.0.0.1:${port}/`);
        fs.mkdirSync(output, { recursive: true });
        const outputDir = fs.mkdtempSync(path.join(output, `${width}x${height}-${values.lang}-`));

        for (const scene of screenshotScenes) {
            const result = await page.evaluate((current) => window.prepareScreenshot(current), scene);
            if (result !== 'ready') throw new Error(`${scene.screen} (${scene.theme}): ${result}`);
            const filename = path.join(outputDir, `${scene.screen}-${scene.theme}.png`);
            await page.screenshot({ path: filename, animations: 'disabled' });
            console.log(filename);
        }
    } finally {
        await browser?.close();
        await server?.close();
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
