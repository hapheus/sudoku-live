import { describe, it, expect } from 'vitest';
import {
    validateItchIndexHtml,
    validateItchZipEntries,
} from '../scripts/package-itch.mjs';

describe('itch.io package verification', () => {
    it('accepts valid index.html with relative asset paths', () => {
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <link rel="icon" href="./favicon.ico">
                <script src="./env-config.js"></script>
                <script type="module" crossorigin src="./assets/index-abc123.js"></script>
                <link rel="stylesheet" crossorigin href="./assets/index-abc123.css">
            </head>
            <body><div id="root"></div></body>
            </html>
        `;

        expect(validateItchIndexHtml(html)).toEqual([]);
    });

    it('rejects index.html containing root-absolute asset paths', () => {
        const html = `
            <script type="module" src="/assets/index-abc123.js"></script>
            <link rel="stylesheet" href="/assets/index-abc123.css">
        `;

        const errors = validateItchIndexHtml(html);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.join(' ')).toContain('absolute');
    });

    it('accepts valid zip entries with index.html at archive root', () => {
        const entries = [
            'index.html',
            'env-config.js',
            'assets/index-abc123.js',
            'assets/index-abc123.css',
        ];

        expect(validateItchZipEntries(entries)).toEqual([]);
    });

    it('rejects zip entries when index.html is nested inside a subdirectory', () => {
        const entries = [
            'dist-itch/index.html',
            'dist-itch/assets/index-abc123.js',
        ];

        const errors = validateItchZipEntries(entries);
        expect(errors).toContain('Missing index.html at the root of the ZIP archive.');
    });

    it('rejects zip entries containing .DS_Store or sourcemap files', () => {
        const entries = [
            'index.html',
            '.DS_Store',
            'assets/index-abc123.js.map',
        ];

        const errors = validateItchZipEntries(entries);
        expect(errors.some((e) => e.includes('.DS_Store'))).toBe(true);
        expect(errors.some((e) => e.includes('.map'))).toBe(true);
    });
});
