#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const ANDROID_DIR = path.join(REPO_ROOT, 'android');

/**
 * Resolve ANDROID_HOME from env or standard macOS/Linux SDK locations.
 * @param {NodeJS.ProcessEnv} baseEnv
 * @returns {string | null}
 */
function resolveAndroidHome(baseEnv) {
    const candidates = [
        baseEnv.ANDROID_HOME,
        baseEnv.ANDROID_SDK_ROOT,
        path.join(os.homedir(), 'Library', 'Android', 'sdk'),
        path.join(os.homedir(), 'Android', 'Sdk'),
    ].filter(Boolean);

    return candidates.find((dir) => fs.existsSync(dir)) || null;
}

function main() {
    const args = process.argv.slice(2);
    const isRelease = args.includes('--release');
    const noSync = args.includes('--no-sync');
    const showHelp = args.includes('--help') || args.includes('-h');

    if (showHelp) {
        console.log([
            'Usage: npm run android:build [-- --no-sync]',
            '       npm run android:release [-- --no-sync]',
        ].join('\n'));
        return;
    }

    const env = { ...process.env };
    const androidHome = resolveAndroidHome(env);
    if (androidHome) {
        env.ANDROID_HOME = androidHome;
        env.ANDROID_SDK_ROOT = androidHome;
        const platformTools = path.join(androidHome, 'platform-tools');
        if (fs.existsSync(platformTools) && !String(env.PATH || '').includes(platformTools)) {
            env.PATH = `${platformTools}${path.delimiter}${env.PATH || ''}`;
        }
    }

    if (!noSync) {
        execFileSync('npm', ['run', 'cap:sync:android'], {
            cwd: REPO_ROOT,
            env,
            stdio: 'inherit',
        });
    }

    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    const gradleTask = isRelease ? 'bundleRelease' : 'assembleDebug';

    execFileSync(gradlew, [gradleTask], {
        cwd: ANDROID_DIR,
        env,
        stdio: 'inherit',
    });

    const artifactPath = isRelease
        ? 'android/app/build/outputs/bundle/release/app-release.aab'
        : 'android/app/build/outputs/apk/debug/app-debug.apk';
    console.log(`\nAndroid build ready: ${artifactPath}`);
}

main();
