#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createSudokuGame, fillCandidateNotes, serializeGameState, setCellValue } from '../src/domain/sudoku-engine.js';
import { buildCleanXcodeEnv } from './ios-device.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const templates = path.join(root, 'scripts/ios-screenshots');
const bundleId = 'dev.fraha.sudoku.screenshots';
const defaultXcode = '/Applications/Xcode.app/Contents/Developer';
const env = buildCleanXcodeEnv({
    ...process.env,
    DEVELOPER_DIR: process.env.DEVELOPER_DIR || defaultXcode,
});
const usage = 'Usage: npm run ios:screenshots -- <simulator-udid> [--lang en|de] [--out <folder>] [--ws-url <local-broker-url>]';

function xcrun(args, options = {}) {
    return execFileSync('xcrun', args, { env, encoding: 'utf8', timeout: 60_000, ...options });
}

function seedPuzzle() {
    let game = createSudokuGame({ variant: '3x3', difficulty: 'hard' });
    const emptyCells = game.board.flatMap((value, index) => value ? [] : [index]);
    for (const [index, cell] of emptyCells.entries()) {
        if (index % 4 === 0) game = setCellValue(game, cell, game.solution[cell], { recordHistory: false });
    }
    return JSON.stringify({ gameState: serializeGameState(fillCandidateNotes(game)), roomId: randomUUID() });
}

function buildCaptureApp(directory, language, wsUrl) {
    const templateProject = path.join(root, 'ios/App');
    const iosProject = path.join(directory, 'ios/App');
    fs.mkdirSync(iosProject, { recursive: true });
    for (const folder of ['App', 'App.xcodeproj', 'CapApp-SPM']) {
        fs.cpSync(path.join(templateProject, folder), path.join(iosProject, folder), {
            recursive: true,
            filter: (source) => path.basename(source) !== 'public' && path.basename(source) !== 'xcuserdata',
        });
    }
    for (const file of ['package.json', 'capacitor.config.json']) {
        fs.copyFileSync(path.join(root, file), path.join(directory, file));
    }
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    execFileSync('npm', ['run', 'build', '--', '--outDir', path.join(directory, 'dist'), '--logLevel', 'warn'], {
        cwd: root, stdio: 'inherit',
    });
    execFileSync(process.execPath, [path.join(root, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'ios'], {
        cwd: directory, stdio: 'inherit',
    });

    const app = path.join(iosProject, 'App');
    const publicDir = path.join(app, 'public');
    const index = path.join(publicDir, 'index.html');
    const settings = {
        sudoku_lang: language,
        sudoku_theme: 'dark',
        sudoku_variant: '3x3',
        sudoku_player_name: 'RiverPuzzle',
        sudoku_solo_snapshot_v1: seedPuzzle(),
    };
    const config = {
        wsUrl: wsUrl ?? 'ws://127.0.0.1:1/connection/websocket',
    };
    const bootstrap = `<script>
window.__APP_CONFIG__ = ${JSON.stringify(config)};
window.screenshotConfig = { liveWatch: ${Boolean(wsUrl)} };
for (const [key, value] of Object.entries(${JSON.stringify(settings)})) localStorage.setItem(key, value);
</script>
<script src="/prepare-screenshot.js"></script>
`;
    const html = fs.readFileSync(index, 'utf8');
    fs.writeFileSync(index, html.replace('<script type="module"', `${bootstrap}<script type="module"`));
    fs.copyFileSync(path.join(templates, 'prepare.js'), path.join(publicDir, 'prepare-screenshot.js'));
    fs.copyFileSync(path.join(templates, 'SceneDelegate.swift'), path.join(app, 'SceneDelegate.swift'));

    xcrun(['xcodebuild', '-project', path.join(iosProject, 'App.xcodeproj'), '-scheme', 'App',
        '-configuration', 'Debug', '-destination', 'generic/platform=iOS Simulator',
        '-derivedDataPath', path.join(directory, 'build'), 'CODE_SIGNING_ALLOWED=NO',
        `PRODUCT_BUNDLE_IDENTIFIER=${bundleId}`, '-quiet'], {
        stdio: 'inherit', timeout: 600_000,
    });
    return path.join(directory, 'build/Build/Products/Debug-iphonesimulator/App.app');
}

async function prepare(documents, screen, theme) {
    const id = randomUUID();
    const requestPath = path.join(documents, 'screenshot-request.json');
    const nextRequest = `${requestPath}.tmp`;
    fs.writeFileSync(nextRequest, JSON.stringify({ id, screen, theme }));
    fs.renameSync(nextRequest, requestPath);
    const replyPath = path.join(documents, 'screenshot-ready.json');
    for (let attempt = 0; attempt < 160; attempt++) {
        await setTimeout(250);
        if (!fs.existsSync(replyPath)) continue;
        const reply = JSON.parse(fs.readFileSync(replyPath, 'utf8'));
        if (reply.id !== id) continue;
        if (reply.outcome !== 'ready') throw new Error(reply.outcome);
        return reply;
    }
    throw new Error(`The simulator did not render ${screen} (${theme}). Open or unlock it in Device Hub and retry.`);
}

function getDisplay(device, { width, height, landscape }) {
    const output = xcrun(['simctl', 'io', device, 'enumerate']);
    for (const block of output.split(/(?=^\s*Screen ID:)/m)) {
        const id = block.match(/Screen ID: (\d+)/)?.[1];
        const size = block.match(/Pixel Size: \{(\d+),\s*(\d+)\}/);
        if (!id || !size || !block.includes('Screen Type: Integrated')) continue;
        const [displayWidth, displayHeight] = size.slice(1).map(Number);
        const sameSize = (displayWidth === width && displayHeight === height)
            || (displayWidth === height && displayHeight === width);
        if (!sameSize) continue;
        return { id, orientation: landscape ? 'landscape' : 'portrait' };
    }
    throw new Error(`No integrated simulator display matches ${width} × ${height}.`);
}

async function main() {
    const { values, positionals } = parseArgs({
        allowPositionals: true,
        options: {
            help: { type: 'boolean', short: 'h' },
            lang: { type: 'string', default: 'en' },
            out: { type: 'string' },
            'ws-url': { type: 'string' },
        },
    });
    if (values.help) {
        console.log(usage);
        return;
    }
    if (positionals.length !== 1 || !['de', 'en'].includes(values.lang)) throw new Error(usage);
    const wsUrl = values['ws-url'] ? new URL(values['ws-url']) : null;
    if (wsUrl) {
        if (!['ws:', 'wss:'].includes(wsUrl.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(wsUrl.hostname)) {
            throw new Error('Use a loopback WebSocket URL for the private Watch demo.');
        }
    }

    const { devices } = JSON.parse(xcrun(['simctl', 'list', 'devices', 'available', '--json']));
    const device = Object.entries(devices)
        .filter(([runtime]) => runtime.includes('.iOS-'))
        .flatMap(([, entries]) => entries)
        .find(({ udid }) => udid.toLowerCase() === positionals[0].toLowerCase());
    if (!device) throw new Error('Choose an available iOS simulator UDID from npm run ios:devices.');
    const { udid, name, state } = device;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sudoku-screenshots-'));
    const out = path.resolve(values.out ?? path.join(root, 'ios/App/build/screenshots'));
    let appInstalled = false;
    try {
        if (state === 'Shutdown') xcrun(['simctl', 'boot', udid]);
        xcrun(['simctl', 'bootstatus', udid, '-b'], { stdio: 'inherit', timeout: 240_000 });
        const build = buildCaptureApp(directory, values.lang, wsUrl?.href);
        xcrun(['simctl', 'install', udid, build], { timeout: 240_000 });
        appInstalled = true;
        const data = xcrun(['simctl', 'get_app_container', udid, bundleId, 'data']).trim();
        const documents = path.join(data, 'Documents');
        fs.mkdirSync(documents, { recursive: true });
        for (const file of ['screenshot-request.json', 'screenshot-ready.json']) {
            fs.rmSync(path.join(documents, file), { force: true });
        }
        xcrun(['simctl', 'launch', '--terminate-running-process', udid, bundleId]);

        let expectedDisplay;
        let outputDir;
        for (const theme of ['dark', 'light']) {
            for (const screen of ['setup', 'game', 'settings', 'watch']) {
                const reply = await prepare(documents, screen, theme);
                const display = getDisplay(udid, reply);
                if (!expectedDisplay) {
                    expectedDisplay = display;
                    const prefix = `${name}-${display.id}-${display.orientation}-${values.lang}`.replace(/[^a-zA-Z0-9-]+/g, '-');
                    fs.mkdirSync(out, { recursive: true });
                    outputDir = fs.mkdtempSync(path.join(out, `${prefix}-`));
                } else if (display.id !== expectedDisplay.id || display.orientation !== expectedDisplay.orientation) {
                    throw new Error('The simulator display or orientation changed during capture. Run again for the new pose.');
                }
                const file = path.join(outputDir, `${screen}-${theme}.jpg`);
                xcrun(['simctl', 'io', udid, 'screenshot', `--display=${display.id}`, '--type=jpeg', '--mask=ignored', file]);
                const metadata = execFileSync('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
                const width = Number(metadata.match(/pixelWidth: (\d+)/)?.[1]);
                const height = Number(metadata.match(/pixelHeight: (\d+)/)?.[1]);
                const nativeSize = (width === reply.width && height === reply.height)
                    || (width === reply.height && height === reply.width);
                if (!nativeSize || (width > height) !== reply.landscape) {
                    fs.unlinkSync(file);
                    throw new Error('The screenshot does not match the reported display size and orientation.');
                }
                console.log(file);
            }
        }
    } finally {
        if (appInstalled) {
            try {
                xcrun(['simctl', 'terminate', udid, bundleId]);
            } catch {
                // The screenshot app may already have stopped.
            }
        }
        fs.rmSync(directory, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
