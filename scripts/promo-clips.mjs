#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { build, preview } from 'vite';
import { launchPromoBrowser, recordPromoClip, startLocalCentrifugo } from './promo/recorder.mjs';
import { PROMO_SCENES } from './promo/scenes.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const usage = [
    'Usage: npm run promo:clips -- [options]',
    '  --only <ids>     Comma-separated scene IDs to record (default: all)',
    '  --lang <en|de>   UI language (default: en)',
    '  --music          Include app background music in addition to SFX (default: off)',
    '  --out <folder>   Output directory (default: artifacts/promo-clips)',
    '  --ws-url <url>   Optional loopback WebSocket URL instead of starting temporary Docker Centrifugo',
    '  --list           List available scene IDs and exit',
].join('\n');

async function main() {
    const { values } = parseArgs({
        options: {
            help: { type: 'boolean', short: 'h' },
            list: { type: 'boolean' },
            only: { type: 'string' },
            lang: { type: 'string', default: 'en' },
            music: { type: 'boolean', default: false },
            out: { type: 'string' },
            'ws-url': { type: 'string' },
        },
    });

    if (values.help) {
        console.log(usage);
        return;
    }

    if (values.list) {
        for (const scene of PROMO_SCENES) {
            console.log(`${scene.id.padEnd(24)} ${scene.title} (theme: ${scene.theme}${scene.requiresBroker ? ', multiplayer' : ''})`);
        }
        return;
    }

    if (!['en', 'de'].includes(values.lang)) {
        throw new Error(`Unsupported language "${values.lang}". Use "en" or "de".`);
    }

    const selectedIds = values.only
        ? new Set(values.only.split(',').map((item) => item.trim()).filter(Boolean))
        : null;

    const scenes = selectedIds
        ? PROMO_SCENES.filter((scene) => selectedIds.has(scene.id))
        : PROMO_SCENES;

    if (scenes.length === 0) {
        throw new Error('No matching scenes found. Run with --list to see valid scene IDs.');
    }

    if (selectedIds) {
        const known = new Set(PROMO_SCENES.map((scene) => scene.id));
        const unknown = [...selectedIds].filter((id) => !known.has(id));
        if (unknown.length > 0) {
            throw new Error(`Unknown scene ID(s): ${unknown.join(', ')}`);
        }
    }

    const outputDir = path.resolve(values.out ?? path.join(root, 'artifacts/promo-clips'));
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sudoku-promo-clips-'));
    const buildDir = path.join(tmpRoot, 'dist');
    const videoTmpDir = path.join(tmpRoot, 'work');
    fs.mkdirSync(videoTmpDir, { recursive: true });

    let broker = null;
    let server = null;
    let browser = null;

    try {
        let wsUrl = values['ws-url'];
        if (!wsUrl && scenes.some((scene) => scene.requiresBroker)) {
            console.log('Starting temporary Centrifugo broker on 127.0.0.1:18081...');
            broker = await startLocalCentrifugo({ root, port: 18081 });
            wsUrl = broker.wsUrl;
        }

        console.log('Building itch.io bundle for 880x640 promo capture...');
        process.env.VITE_ITCH_BUILD = 'true';
        const viteConfig = { root, mode: 'itch', build: { outDir: buildDir }, logLevel: 'warn' };
        await build(viteConfig);
        server = await preview({ ...viteConfig, preview: { host: '127.0.0.1', port: 0 } });
        const { port } = server.httpServer.address();
        const baseUrl = `http://127.0.0.1:${port}`;

        browser = await launchPromoBrowser();
        fs.mkdirSync(outputDir, { recursive: true });

        const results = [];
        for (const scene of scenes) {
            const prepared = scene.prepare ? scene.prepare() : {};
            const storage = {
                ...(typeof scene.storage === 'function' ? scene.storage() : scene.storage),
                ...(prepared.storage || {}),
            };
            const outPath = path.join(outputDir, `${scene.id}.mp4`);
            console.log(`Recording ${scene.id} (${scene.title})...`);
            const result = await recordPromoClip({
                browser,
                baseUrl,
                wsUrl,
                outPath,
                tmpDir: videoTmpDir,
                lang: values.lang,
                theme: scene.theme,
                musicEnabled: values.music,
                storage,
                extraInitScript: scene.extraInitScript || '',
                run: (ctx) => scene.run({ ...ctx, state: prepared }),
            });
            results.push(result);
            console.log(`  -> ${result.outPath} (${result.durationSeconds}s)`);
        }

        console.log(`\nDone! Generated ${results.length} clip(s) in ${outputDir}`);
    } finally {
        await browser?.close().catch(() => {});
        await server?.close().catch(() => {});
        broker?.stop();
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
});
