import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertNoBotEntries, verifyBotExclusion, botExclusionPlugin } from '../scripts/bot-exclusion.mjs';

describe('local bot release boundary', () => {
    it('rejects bot runtime paths in archives and application imports', () => {
        expect(() => assertNoBotEntries(['index.html', 'assets/app.js'])).not.toThrow();
        for (const filename of ['tools/local-bot/src/main.mjs', '.build/bot.mjs', 'node_modules/playwright/index.js']) {
            expect(() => assertNoBotEntries([filename])).toThrow();
            expect(() => botExclusionPlugin().resolveId('../tools/local-bot/src/main.mjs')).toThrow();
        }
    });
    it('detects bot runtime embedded under an ordinary app asset name', () => {
        const dir = mkdtempSync(path.join(tmpdir(), 'sudoku-release-'));
        try {
            writeFileSync(path.join(dir, 'app.js'), 'console.log("SUDOKU_LOCAL_BOT_ONLY")');
            expect(() => verifyBotExclusion(dir)).toThrow(/Local bot runtime/);
            writeFileSync(path.join(dir, 'app.js'), 'console.log("app")');
            expect(verifyBotExclusion(dir)).toBe(1);
        } finally { rmSync(dir, { recursive: true, force: true }); }
    });
});
