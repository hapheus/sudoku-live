#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const XCODE_DEVELOPER_DIR = '/Applications/Xcode.app/Contents/Developer';
const UDID_PATTERN = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}$|^[0-9A-Fa-f-]{24,}$/;

const NIX_POLLUTED_VARS = new Set([
    'SDKROOT',
    'CC',
    'CXX',
    'LD',
    'AR',
    'NM',
    'RANLIB',
    'STRIP',
    'CFLAGS',
    'CXXFLAGS',
    'LDFLAGS',
    'IN_NIX_SHELL',
]);

/**
 * Strip devenv/nix compiler & SDK overrides so xcodebuild uses Xcode.app's toolchain.
 * @param {NodeJS.ProcessEnv} baseEnv
 * @returns {NodeJS.ProcessEnv}
 */
function buildCleanXcodeEnv(baseEnv) {
    const env = { ...baseEnv };
    const isNix = Boolean(env.IN_NIX_SHELL) || (env.DEVELOPER_DIR || '').startsWith('/nix/store/');
    if (!isNix) {
        return env;
    }

    if (fs.existsSync(XCODE_DEVELOPER_DIR)) {
        env.DEVELOPER_DIR = XCODE_DEVELOPER_DIR;
    }

    for (const key of Object.keys(env)) {
        if (NIX_POLLUTED_VARS.has(key) || key.startsWith('NIX_')) {
            delete env[key];
        }
    }

    if (env.PATH) {
        env.PATH = env.PATH
            .split(path.delimiter)
            .filter((entry) => !(entry.startsWith('/nix/store/') && /clang-wrapper|cctools|binutils|llvm/.test(entry)))
            .join(path.delimiter);
    }

    return env;
}

/**
 * Resolve a physical Apple device name (e.g. "haPhone") to its UDID via devicectl.
 * @param {string} targetName
 * @param {NodeJS.ProcessEnv} env
 * @returns {string | null}
 */
function resolvePhysicalDeviceUdid(targetName, env) {
    let output = '';
    try {
        output = execFileSync('xcrun', ['devicectl', 'list', 'devices'], {
            env,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch {
        return null;
    }

    const wanted = targetName.toLowerCase();
    for (const line of output.split(/\r?\n/)) {
        if (!line.includes('(UDID)')) continue;
        const udidMatch = line.match(/([0-9A-Fa-f]{8}-[0-9A-Fa-f]{16}|[0-9A-Fa-f-]{24,})\s+\(UDID\)/);
        if (!udidMatch) continue;
        const namePart = line.split(/\s{2,}/)[0]?.trim().toLowerCase();
        if (namePart === wanted) {
            return udidMatch[1];
        }
    }
    return null;
}

function main() {
    const args = process.argv.slice(2);
    const cleanEnv = buildCleanXcodeEnv(process.env);

    if (args.includes('--list')) {
        execFileSync('xcrun', ['devicectl', 'list', 'devices'], {
            env: cleanEnv,
            stdio: 'inherit',
        });
        return;
    }

    const noSync = args.includes('--no-sync');
    const showHelp = args.includes('--help') || args.includes('-h');
    const target = args.find((arg) => !arg.startsWith('-'));

    if (showHelp || !target) {
        console.error([
            'Usage: npm run ios:device -- <device-name-or-udid> [--no-sync]',
            '       npm run ios:devices',
            '',
            'Examples:',
            '  npm run ios:devices',
            '  npm run ios:device -- haPhone',
            '  npm run ios:device -- haPhone --no-sync',
            '  npm run ios:device -- 00008130-001C55EC01E8001C',
        ].join('\n'));
        process.exit(showHelp ? 0 : 1);
    }

    const resolvedUdid = UDID_PATTERN.test(target)
        ? target
        : resolvePhysicalDeviceUdid(target, cleanEnv);

    if (!noSync) {
        execFileSync('npm', ['run', 'build'], {
            cwd: REPO_ROOT,
            env: process.env,
            stdio: 'inherit',
        });
    }

    const capArgs = ['cap', 'run', 'ios'];
    if (noSync) {
        capArgs.push('--no-sync');
    }
    if (resolvedUdid) {
        console.log(`Deploying to ${target} (${resolvedUdid})...`);
        capArgs.push('--target', resolvedUdid);
    } else {
        console.log(`Deploying to simulator/target "${target}"...`);
        capArgs.push('--target-name', target);
    }

    execFileSync('npx', capArgs, {
        cwd: REPO_ROOT,
        env: cleanEnv,
        stdio: 'inherit',
    });
}

main();
