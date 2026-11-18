import { test, expect } from '@playwright/test';
import { createSudokuGame, serializeGameState } from '../../src/domain/sudoku-engine.js';

for (const autoAccept of [true, false]) {
    test(`two joined players and a spectator share Tic Tac Toe (${autoAccept ? 'auto' : 'confirmed'} join)`, async ({ browser, baseURL }) => {
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
        await host.addInitScript(({ snapshot, autoAccept }) => {
            localStorage.setItem('sudoku_solo_snapshot_v1', snapshot);
            localStorage.setItem('sudoku_joins_auto_accept', String(autoAccept));
            localStorage.setItem('sudoku_lang', 'en');
        }, { snapshot: JSON.stringify({ gameState: serializeGameState(game), roomId }), autoAccept });
        try {
            await host.goto(`${baseURL}/`);
            await host.getByRole('button', { name: 'Play', exact: true }).click();
            await expect(host.locator('[role="gridcell"]')).toHaveCount(81);
            const sudokuBoardBox = await host.locator('.sudoku-board').boundingBox();
            const originalBoard = await host.locator('[role="gridcell"]').allTextContents();
            await guest.goto(`${baseURL}/games/${roomId}?watch=1`);
            await expect(guest.locator('#connection-status')).toHaveText('Live');
            await guest.locator('#join-from-watch-btn').click();
            if (!autoAccept) {
                const admission = host.locator('#join-request-banner');
                await expect(admission).toBeVisible();
                expect((await admission.boundingBox())!.x).toBeGreaterThanOrEqual(await host.evaluate(() => innerWidth / 2));
                await host.getByRole('button', { name: 'Allow', exact: true }).click();
            }
            await expect(host.locator('#opponent-status')).toContainText('online', { ignoreCase: true });
            if (!autoAccept) {
                await guestContext.setOffline(true);
                await expect(guest.locator('#connection-status')).not.toHaveText('Live');
                await guestContext.setOffline(false);
                await expect(guest.locator('#connection-status')).toHaveText('Live');
                await expect(host.locator('#opponent-status')).toContainText('online', { ignoreCase: true });
            }
            await spectator.goto(`${baseURL}/games/${roomId}?watch=1`);
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
            await expect(host.locator('[role="gridcell"]')).toHaveCount(81);
            await expect(spectator.getByRole('heading', { name: 'Tic Tac Toe' })).toBeVisible();
            await expect(host.getByText("You are X. It's your turn.")).toBeVisible();
            const tttBoardBox = await host.locator('.tic-tac-toe__board').boundingBox();
            expect(Math.abs((tttBoardBox?.width ?? 0) - (sudokuBoardBox?.width ?? 0))).toBeLessThanOrEqual(1);
            expect(Math.abs((tttBoardBox?.height ?? 0) - (sudokuBoardBox?.height ?? 0))).toBeLessThanOrEqual(1);
            await expect(guest.getByText('You are O. Waiting for your opponent.')).toBeVisible();
            await lateViewer.goto(`${baseURL}/`);
            await lateViewer.locator('#nav-watch').click();
            await expect(lateViewer.locator('.live-game-card').filter({ has: lateViewer.locator(`[data-watch-id="${roomId}"]`) })).toContainText('Tic Tac Toe');
            await lateViewer.goto(`${baseURL}/games/${roomId}?watch=1`);
            await expect(lateViewer.getByRole('heading', { name: 'Tic Tac Toe' })).toBeVisible();
            for (const [page, label] of [[host, 'Row 1, column 1'], [guest, 'Row 2, column 1'], [host, 'Row 1, column 2'], [guest, 'Row 2, column 2'], [host, 'Row 1, column 3']] as const) {
                await page.getByRole('button', { name: label, exact: true }).click();
            }
            await expect(spectator.getByText('Player X wins!')).toBeVisible();
            await expect(spectator.getByText('Well, that settled nothing. Back to Sudoku!')).toBeVisible();
            await expect(spectator.locator('[role="gridcell"]')).toHaveCount(81);
            await expect.poll(() => host.locator('[role="gridcell"]').allTextContents()).toEqual(originalBoard);
            await hostContext.close();
            await guest.locator('#continue-solo-btn').click();
            await expect(guest.locator('.tic-tac-toe')).toHaveCount(0);
            await shift(guest, 0, '#shift-row-down-btn');
            const continuedBoard = await guest.locator('[role="gridcell"]').allTextContents();
            expect(continuedBoard).not.toEqual(originalBoard);
            await expect.poll(() => spectator.locator('[role="gridcell"]').allTextContents()).toEqual(continuedBoard);

        } finally {
            await Promise.all([hostContext.close(), guestContext.close(), spectatorContext.close(), lateContext.close()]);
        }
    });

}
