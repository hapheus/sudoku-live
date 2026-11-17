import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createSudokuGame, serializeGameState } from '../../src/domain/sudoku-engine.js';
import catalog from '../../src/services/board-background-catalog.json' with { type: 'json' };

const representatives = {
    detailed: 'ce245fd4-17da-49e2-a79b-300bbac2b82d.webp',
    dark: 'b624e913-189e-47e2-a08d-b27cfaf80eb8.webp',
    gradient: '04774224-baba-4d8f-8017-7d7546715320.webp',
    featured: 'alpenpanorama_mit_see_im_sonnenuntergang.webp',
};

for (const theme of ['dark', 'light']) {
    for (const [kind, backgroundId] of Object.entries(representatives)) {
        test(`subtle gameplay artwork ${theme} ${kind}`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width: 768, height: 1024 });
            const solution = Array.from({ length: 36 }, (_, i) => (Math.floor(i / 6) * 3 + Math.floor(i / 12) + i % 6) % 6 + 1);
            const puzzle = solution.map((digit, i) => i % 3 === 0 ? digit : 0);
            const game = createSudokuGame({ variant: '2x3', difficulty: 'easy', puzzle, solution });
            const state = serializeGameState(game);
            for (let i = 0; i < 6; i++) state.board[i] = state.solution[i];
            const empty = state.board.findIndex(value => value === 0);
            state.notes[empty] = [1, 2, 3];
            await page.addInitScript(({ snapshot, theme }) => {
                if (!localStorage.getItem('sudoku_solo_snapshot_v1')) {
                    localStorage.setItem('sudoku_solo_snapshot_v1', snapshot);
                    localStorage.setItem('sudoku_theme', theme);
                    localStorage.setItem('sudoku_variant', '2x3');
                    localStorage.setItem('sudoku_lang', 'en');
                }
            }, { snapshot: JSON.stringify({ gameState: state, roomId: 'artwork-qa', boardBackgroundId: backgroundId }), theme });
            await page.routeWebSocket(/.*/, socket => socket.close());
            await page.goto('/');
            await page.locator('#resume-game-btn').click();
            await page.keyboard.press('Escape');
            const image = page.locator('.sudoku-board__artwork-img');
            await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
            await expect(image).toHaveCSS('opacity', '0.12');
            await expect(page.locator('.sudoku-cell--unit-revealed').first()).toBeVisible();
            await page.getByRole('gridcell').nth(empty).click();
            const geometry = await image.evaluate(el => ({ width: el.getBoundingClientRect().width, dpr: devicePixelRatio }));
            await testInfo.attach('geometry', { body: JSON.stringify(geometry), contentType: 'application/json' });
            await expect(page.locator('#sudoku-board')).toHaveScreenshot(`artwork-${theme}-${kind}.png`);
            expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations).toEqual([]);
            const board = await page.getByRole('grid').innerText();
            await page.reload();
            await page.locator('#resume-game-btn').click();
            await page.keyboard.press('Escape');
            expect(await page.getByRole('grid').innerText()).toBe(board);
            await expect(image).toHaveAttribute('src', new RegExp(backgroundId.replace('.webp', '')));
        });
    }
}

test('retired artwork survives saved-game restore and is persisted with its replacement', async ({ page }) => {
    const game = createSudokuGame({ variant: '3x3', difficulty: 'easy' });
    const edited = game.board.findIndex(value => value === 0);
    game.board[edited] = game.solution[edited];
    await page.addInitScript(snapshot => {
        if (!localStorage.getItem('sudoku_solo_snapshot_v1')) {
            localStorage.setItem('sudoku_solo_snapshot_v1', snapshot);
            localStorage.setItem('sudoku_lang', 'en');
        }
    }, JSON.stringify({ gameState: serializeGameState(game), roomId: 'retired-artwork', boardBackgroundId: catalog.retired[0] }));
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
    await page.locator('#resume-game-btn').click();
    await expect(page.getByRole('gridcell').nth(edited)).toHaveText(String(game.solution[edited]));
    const image = page.locator('.sudoku-board__artwork-img');
    await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sudoku_solo_snapshot_v1')!).boardBackgroundId)).toBeTruthy();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sudoku_solo_snapshot_v1')!).boardBackgroundId)).not.toBe(catalog.retired[0]);
    const replacement = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku_solo_snapshot_v1')!).boardBackgroundId);
    expect(catalog.selected).toContain(replacement);
    await page.reload();
    await page.locator('#resume-game-btn').click();
    await expect(page.getByRole('gridcell').nth(edited)).toHaveText(String(game.solution[edited]));
    await expect(image).toHaveAttribute('src', new RegExp(replacement.replace('.webp', '')));
});

test('artwork decodes within phone, tablet, desktop and emulated Duo layouts', async ({ browser }, testInfo) => {
    const results = [];
    for (const [width, height, dpr] of [[390, 844, 3], [844, 390, 3], [768, 1024, 2], [1024, 1366, 2], [1366, 1024, 2], [1440, 900, 1], [2560, 1440, 2], [899, 1400, 3], [1200, 800, 2]]) {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, reducedMotion: 'no-preference' });
        try {
            const page = await context.newPage();
            if (width === 1200) {
                const cdp = await context.newCDPSession(page);
                await cdp.send('Emulation.setDeviceMetricsOverride', {
                    width, height, deviceScaleFactor: dpr, mobile: true,
                    displayFeature: { orientation: 'vertical', offset: 550, maskLength: 30 },
                });
            }
            await page.routeWebSocket(/.*/, socket => socket.close());
            await page.goto('/');
            await page.locator('#start-game-btn').click();
            const image = page.locator('.sudoku-board__artwork-img');
            await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
            const geometry = await image.evaluate((el: HTMLImageElement) => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, dpr: devicePixelRatio, naturalWidth: el.naturalWidth }));
            results.push({ viewport: [width, height], ...geometry });
            expect(geometry.width, JSON.stringify(results)).toBeLessThanOrEqual(513);
            expect(geometry.naturalWidth).toBeLessThanOrEqual(1024);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        } finally {
            await context.close();
        }
    }
    await testInfo.attach('artwork-geometry', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
});

for (const theme of ['dark', 'light']) {
    test(`solved artwork retains the full image ${theme}`, async ({ page }) => {
        const solution = Array.from({ length: 36 }, (_, i) => (Math.floor(i / 6) * 3 + Math.floor(i / 12) + i % 6) % 6 + 1);
        const puzzle = solution.map((digit, i) => i < 2 ? 0 : digit);
        const state = serializeGameState(createSudokuGame({ variant: '2x3', difficulty: 'easy', puzzle, solution }));
        state.board[1] = solution[1];
        await page.addInitScript(({ snapshot, theme }) => {
            localStorage.setItem('sudoku_solo_snapshot_v1', snapshot);
            localStorage.setItem('sudoku_lang', 'en');
            localStorage.setItem('sudoku_theme', theme);
            localStorage.setItem('sudoku_variant', '2x3');
        }, { snapshot: JSON.stringify({ gameState: state, roomId: 'solved-artwork', boardBackgroundId: representatives.featured }), theme });
        await page.routeWebSocket(/.*/, socket => socket.close());
        await page.goto('/');
        await page.locator('#resume-game-btn').click();
        await page.getByRole('gridcell').first().click();
        await page.keyboard.press('1');
        await expect(page.locator('#sudoku-board')).toHaveClass(/sudoku-board--solved/);
        await expect(page.locator('.sudoku-board__artwork-img')).toHaveCSS('opacity', '1');
        await expect(page.locator('#sudoku-board')).toHaveScreenshot(`artwork-solved-${theme}.png`);
    });
}
