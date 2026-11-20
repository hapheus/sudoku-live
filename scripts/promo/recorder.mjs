import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { promoAudioInitScript } from './audio-capture.js';

export const PROMO_VIEWPORT = { width: 880, height: 640 };

export function bootstrapScript({ lang = 'en', theme = 'light', wsUrl, musicEnabled = false, storage = {} }) {
    const settings = {
        sudoku_lang: lang,
        sudoku_theme: theme,
        sudoku_variant: '3x3',
        sudoku_player_name: 'RiverPuzzle',
        sudoku_sound_enabled: 'true',
        sudoku_sound_volume: '0.85',
        sudoku_music_enabled: musicEnabled ? 'true' : 'false',
        sudoku_music_volume: '0.35',
        ...storage,
    };
    const config = { wsUrl: wsUrl ?? 'ws://127.0.0.1:1/connection/websocket' };
    return `
window.__APP_CONFIG__ = ${JSON.stringify(config)};
for (const [key, value] of Object.entries(${JSON.stringify(settings)})) {
    if (value === null || value === undefined) {
        localStorage.removeItem(key);
    } else {
        localStorage.setItem(key, String(value));
    }
}
`;
}

export async function startLocalCentrifugo({ root, port = 18081, containerName = 'sudoku-promo-centrifugo' }) {
    const configPath = path.join(root, 'docker/centrifugo/config.json');
    spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
    execFileSync(
        'docker',
        [
            'run',
            '-d',
            '--rm',
            '--name',
            containerName,
            '-p',
            `127.0.0.1:${port}:8080`,
            '-v',
            `${configPath}:/centrifugo/config.json:ro`,
            '-e',
            'CENTRIFUGO_CLIENT_ALLOWED_ORIGINS=*',
            'centrifugo/centrifugo:v6',
            'centrifugo',
            '-c',
            '/centrifugo/config.json',
        ],
        { stdio: 'pipe' },
    );

    const healthUrl = `http://127.0.0.1:${port}/health`;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(healthUrl);
            if (response.ok) {
                return {
                    wsUrl: `ws://127.0.0.1:${port}/connection/websocket`,
                    stop() {
                        spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
                    },
                };
            }
        } catch {
            // Wait for Centrifugo to come up.
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    spawnSync('docker', ['rm', '-f', containerName], { stdio: 'ignore' });
    throw new Error(`Centrifugo failed to become healthy on ${healthUrl}`);
}

export async function launchPromoBrowser() {
    return chromium.launch({
        headless: true,
        args: [
            '--autoplay-policy=no-user-gesture-required',
            '--hide-scrollbars',
        ],
    });
}

function probeDurationSeconds(filePath) {
    const output = execFileSync(
        'ffprobe',
        [
            '-v',
            'error',
            '-show_entries',
            'format=duration',
            '-of',
            'default=noprint_wrappers=1:nokey=1',
            filePath,
        ],
        { encoding: 'utf8' },
    ).trim();
    const duration = Number.parseFloat(output);
    if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error(`Invalid media duration from ffprobe for ${filePath}: ${output}`);
    }
    return duration;
}

export async function recordPromoClip({
    browser,
    baseUrl,
    wsUrl,
    outPath,
    tmpDir,
    lang = 'en',
    theme = 'light',
    musicEnabled = false,
    storage = {},
    extraInitScript = '',
    run,
}) {
    const clipTmpDir = fs.mkdtempSync(path.join(tmpDir, `${path.basename(outPath, '.mp4')}-`));
    const videoDir = path.join(clipTmpDir, 'video');
    fs.mkdirSync(videoDir, { recursive: true });

    const extraContexts = [];
    const context = await browser.newContext({
        viewport: PROMO_VIEWPORT,
        deviceScaleFactor: 1,
        locale: lang === 'de' ? 'de-DE' : 'en-US',
        timezoneId: 'Europe/Vienna',
        reducedMotion: 'no-preference',
        recordVideo: {
            dir: videoDir,
            size: PROMO_VIEWPORT,
        },
    });

    await context.addInitScript({
        content: [
            bootstrapScript({ lang, theme, wsUrl, musicEnabled, storage }),
            promoAudioInitScript(),
            extraInitScript,
        ].filter(Boolean).join('\n'),
    });

    const page = await context.newPage();
    const video = page.video();
    let clipStartedAt = null;
    let clipStoppedAt = null;
    let audioResult = { base64: '', mimeType: 'audio/webm' };

    const createPeerPage = async ({ name = 'PeerPlayer', theme: peerTheme = theme, storage: peerStorage = {} } = {}) => {
        const peerCtx = await browser.newContext({
            viewport: PROMO_VIEWPORT,
            deviceScaleFactor: 1,
            locale: lang === 'de' ? 'de-DE' : 'en-US',
            timezoneId: 'Europe/Vienna',
            reducedMotion: 'no-preference',
        });
        extraContexts.push(peerCtx);
        await peerCtx.addInitScript({
            content: bootstrapScript({
                lang,
                theme: peerTheme,
                wsUrl,
                musicEnabled: false,
                storage: {
                    sudoku_player_name: name,
                    sudoku_sound_enabled: 'false',
                    ...peerStorage,
                },
            }),
        });
        return peerCtx.newPage();
    };

    const startRecording = async () => {
        // Ensure at least one paint frame before marking start.
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.evaluate(() => window.__promoAudio.start());
        clipStartedAt = Date.now();
    };

    const stopRecording = async () => {
        if (clipStartedAt === null) {
            throw new Error('stopRecording called before startRecording');
        }
        clipStoppedAt = Date.now();
        audioResult = await page.evaluate(() => window.__promoAudio.stop());
        // Allow Playwright video recorder to capture final frames cleanly.
        await page.waitForTimeout(160);
    };

    try {
        await run({
            page,
            context,
            baseUrl,
            createPeerPage,
            startRecording,
            stopRecording,
        });

        if (clipStartedAt !== null && clipStoppedAt === null) {
            await stopRecording();
        }
    } finally {
        for (const peerCtx of extraContexts) {
            await peerCtx.close().catch(() => {});
        }
        await context.close().catch(() => {});
    }

    const pageClosedAt = Date.now();
    const rawVideoPath = await video.path();
    const audioPath = path.join(clipTmpDir, 'audio.webm');
    fs.writeFileSync(audioPath, Buffer.from(audioResult.base64, 'base64'));

    const videoDuration = probeDurationSeconds(rawVideoPath);
    const clipDuration = Math.max(0.5, (clipStoppedAt - clipStartedAt) / 1000);
    const tailFromEnd = (pageClosedAt - clipStartedAt) / 1000;
    const trimStart = Math.max(0, videoDuration - tailFromEnd);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    execFileSync(
        'ffmpeg',
        [
            '-y',
            '-i',
            rawVideoPath,
            '-i',
            audioPath,
            '-filter_complex',
            `[0:v]trim=start=${trimStart.toFixed(3)}:duration=${clipDuration.toFixed(3)},setpts=PTS-STARTPTS,fps=30,format=yuv420p[v];[1:a]atrim=0:${clipDuration.toFixed(3)},asetpts=PTS-STARTPTS[a]`,
            '-map',
            '[v]',
            '-map',
            '[a]',
            '-c:v',
            'libx264',
            '-preset',
            'medium',
            '-crf',
            '18',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            '-movflags',
            '+faststart',
            '-shortest',
            outPath,
        ],
        { stdio: 'pipe' },
    );

    fs.rmSync(clipTmpDir, { recursive: true, force: true });
    return {
        outPath,
        durationSeconds: Number(clipDuration.toFixed(2)),
    };
}
