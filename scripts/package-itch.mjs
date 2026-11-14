#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const DIST_ITCH_DIR = path.join(REPO_ROOT, 'dist-itch');
const ZIP_PATH = path.join(REPO_ROOT, 'sudoku-shift-itch.zip');
const DEFAULT_WS_URL = 'wss://sudoku-ws.fraha.dev/connection/websocket';

/**
 * Validate that built index.html uses relative paths compatible with itch.io CDN iframes.
 * @param {string} html
 * @returns {string[]}
 */
export function validateItchIndexHtml(html) {
    const errors = [];
    if (typeof html !== 'string' || html.trim() === '') {
        errors.push('dist-itch/index.html is empty.');
        return errors;
    }

    const absoluteAssetAttr = /\b(?:src|href)=["']\/(?!\/)/g;
    const matches = html.match(absoluteAssetAttr);
    if (matches && matches.length > 0) {
        errors.push(
            `Found ${matches.length} root-absolute asset reference(s) in index.html; itch.io requires relative "./" paths.`
        );
    }

    return errors;
}

/**
 * Validate ZIP archive entries against itch.io HTML5 requirements.
 * @param {string[]} entries
 * @returns {string[]}
 */
export function validateItchZipEntries(entries) {
    const errors = [];
    const normalized = entries
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '' && !entry.endsWith('/'));

    if (!normalized.includes('index.html')) {
        errors.push('Missing index.html at the root of the ZIP archive.');
    }

    const dsStore = normalized.filter((entry) => path.basename(entry) === '.DS_Store');
    if (dsStore.length > 0) {
        errors.push(`Found ${dsStore.length} .DS_Store file(s) inside ZIP archive.`);
    }

    const sourcemaps = normalized.filter((entry) => entry.endsWith('.map'));
    if (sourcemaps.length > 0) {
        errors.push(`Found ${sourcemaps.length} .map sourcemap file(s) inside ZIP archive.`);
    }

    if (normalized.length > 1000) {
        errors.push(`ZIP archive contains ${normalized.length} files (itch.io limit is 1000 files).`);
    }

    return errors;
}

function removeJunkFiles(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            removeJunkFiles(fullPath);
        } else if (entry.name === '.DS_Store' || entry.name.endsWith('.map')) {
            fs.rmSync(fullPath, { force: true });
        }
    }
}

function listZipEntries(zipPath) {
    const output = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
    return output.split(/\r?\n/).filter(Boolean);
}

export function verifyItchPackage() {
    const indexPath = path.join(DIST_ITCH_DIR, 'index.html');
    if (!fs.existsSync(indexPath)) {
        throw new Error(`Missing ${indexPath}. Run "npm run build:itch" first.`);
    }
    if (!fs.existsSync(ZIP_PATH)) {
        throw new Error(`Missing ${ZIP_PATH}. Run "npm run build:itch" first.`);
    }

    const html = fs.readFileSync(indexPath, 'utf8');
    const entries = listZipEntries(ZIP_PATH);
    const errors = [
        ...validateItchIndexHtml(html),
        ...validateItchZipEntries(entries),
    ];

    if (errors.length > 0) {
        throw new Error(`itch.io package verification failed:\n- ${errors.join('\n- ')}`);
    }

    const stats = fs.statSync(ZIP_PATH);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(
        `Verified ${path.basename(ZIP_PATH)}: ${entries.length} files, ${sizeMb} MB, root index.html with relative paths.`
    );
}

export function buildItchPackage() {
    const env = {
        ...process.env,
        VITE_ITCH_BUILD: 'true',
        VITE_WS_URL: process.env.VITE_WS_URL || DEFAULT_WS_URL,
    };

    execFileSync('npx', ['vite', 'build', '--mode', 'itch'], {
        cwd: REPO_ROOT,
        env,
        stdio: 'inherit',
    });

    removeJunkFiles(DIST_ITCH_DIR);
    fs.rmSync(ZIP_PATH, { force: true });

    execFileSync('zip', ['-rq', ZIP_PATH, '.', '-x', '*.DS_Store'], {
        cwd: DIST_ITCH_DIR,
        stdio: 'inherit',
    });

    verifyItchPackage();
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
    const verifyOnly = process.argv.includes('--verify-only');
    if (verifyOnly) {
        verifyItchPackage();
    } else {
        buildItchPackage();
    }
}
