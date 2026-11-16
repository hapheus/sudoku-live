import { test, expect } from '@playwright/test';
import { createSudokuGame, serializeGameState } from '../../src/domain/sudoku-engine.js';

test('two joined players and a spectator share the Tic Tac Toe easter egg', async ({ browser }) => {
    test.skip(!process.env.CENTRIFUGO_E2E, 'Requires a local Centrifugo server on port 8081');
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const spectatorContext = await browser.newContext();
    const lateContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    const spectator = await spectatorContext.newPage();
    const lateViewer = await lateContext.newPage();
    const roomId = `ttt-${Date.now()}`;
    const game = createSudokuGame({ difficulty: 'medium', variant: '3x3' });
    await host.addInitScript(({ snapshot }) => {
        localStorage.setItem('sudoku_solo_snapshot_v1', snapshot);
        localStorage.setItem('sudoku_joins_auto_accept', 'true');
        localStorage.setItem('sudoku_lang', 'en');
    }, { snapshot: JSON.stringify({ gameState: serializeGameState(game), roomId }) });
    try {
        await host.goto('http://127.0.0.1:5178/');
        await host.getByRole('button', { name: 'Play', exact: true }).click();
        await expect(host.locator('[role="gridcell"]')).toHaveCount(81);
        const originalBoard = await host.locator('[role="gridcell"]').allTextContents();
        await guest.goto(`http://127.0.0.1:5178/games/${roomId}?watch=1`);
        await expect(guest.locator('#connection-status')).toHaveText('Live');
        await guest.locator('#join-from-watch-btn').click();
        await expect(host.locator('#opponent-status')).toContainText('online', { ignoreCase: true });
        await spectator.goto(`http://127.0.0.1:5178/games/${roomId}?watch=1`);
        await expect(spectator.locator('#connection-status')).toHaveText('Live');
        const shift = async (page, index, button) => {
            await page.locator(`[role="gridcell"][data-index="${index}"]`).click();
            await page.locator(button).click();
        };
        await shift(host, 0, '#shift-row-down-btn');
        await shift(guest, 9, '#shift-row-up-btn');
        await shift(host, 0, '#shift-row-down-btn');
        await shift(guest, 9, '#shift-row-up-btn');
        await expect(host.getByText("You undo me. I undo you. Let's settle this.")).toBeVisible();
        await expect(spectator.getByRole('heading', { name: 'Tic Tac Toe' })).toBeVisible();
        await expect(host.getByText("You are X. It's your turn.")).toBeVisible();
        await expect(guest.getByText('You are O. Waiting for your opponent.')).toBeVisible();
        await lateViewer.goto('http://127.0.0.1:5178/');
        await lateViewer.locator('#nav-watch').click();
        await expect(lateViewer.locator('.live-game-card').filter({ hasText: roomId.slice(0, 8) })).toContainText('Tic Tac Toe');
        await lateViewer.goto(`http://127.0.0.1:5178/games/${roomId}?watch=1`);
        await expect(lateViewer.getByRole('heading', { name: 'Tic Tac Toe' })).toBeVisible();
        for (const [page, label] of [[host, 'Row 1, column 1'], [guest, 'Row 2, column 1'], [host, 'Row 1, column 2'], [guest, 'Row 2, column 2'], [host, 'Row 1, column 3']] as const) {
            await page.getByRole('button', { name: label, exact: true }).click();
        }
        await expect(spectator.getByText('Player X wins!')).toBeVisible();
        await expect(spectator.getByText('Well, that settled nothing. Back to Sudoku!')).toBeVisible();
        await expect(spectator.locator('[role="gridcell"]')).toHaveCount(81);
        await expect.poll(() => host.locator('[role="gridcell"]').allTextContents()).toEqual(originalBoard);
    } finally {
        await Promise.all([hostContext.close(), guestContext.close(), spectatorContext.close(), lateContext.close()]);
    }
});
