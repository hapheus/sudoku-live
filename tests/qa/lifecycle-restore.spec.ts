import { writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { createSudokuGame, serializeGameState } from '../../src/domain/sudoku-engine.js';

test.use({ launchOptions: { ignoreDefaultArgs: ['--disable-back-forward-cache'], args: ['--hide-scrollbars'] } });

test('restores active gameplay after cached page transitions and browser history navigation', async ({ page, browser }, testInfo) => {
    test.skip(!process.env.CENTRIFUGO_E2E, 'Requires the isolated local broker on port 8081');
    let opened = 0;
    let closed = 0;
    page.on('websocket', socket => {
        if (new URL(socket.url()).port !== '8081') return;
        opened++;
        socket.on('close', () => closed++);
    });
    const game = createSudokuGame({ difficulty: 'easy', variant: '2x3' });
    const roomId = `lifecycle-${Date.now()}`;
    await page.addInitScript(({ snapshot }) => {
        if (!localStorage.getItem('sudoku_solo_snapshot_v1')) {
            localStorage.setItem('sudoku_solo_snapshot_v1', snapshot);
            localStorage.setItem('sudoku_lang', 'en');
            localStorage.setItem('sudoku_variant', '2x3');
        }
        (window as any).__lifecycle = [];
        for (const type of ['pagehide', 'pageshow']) {
            window.addEventListener(type, event => {
                (window as any).__lifecycle.push({ type, persisted: (event as PageTransitionEvent).persisted });
            });
        }
    }, { snapshot: JSON.stringify({ gameState: serializeGameState(game), roomId }) });
    await page.goto('/');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const observer = await browser.newPage();
    try {
        await observer.goto('/');
        await observer.evaluate(async (roomId) => {
            const path = '/src/services/online-game-client.js';
            const { OnlineGameClient } = await import(path);
            const client = new OnlineGameClient({ wsConfig: { host: '127.0.0.1', port: 8081, scheme: 'http' } });
            (window as any).__observed = { client, events: [] };
            client.joinGameChannel(roomId, { role: 'spectator', onEvent: (type: string, data: any) => {
                (window as any).__observed.events.push({ type, data });
            } });
        }, roomId);
        await expect.poll(() => observer.evaluate(() => (window as any).__observed.client.getGameMembers()?.some((member: any) => member.role === 'host'))).toBe(true);
        const index = game.board.findIndex(value => value === 0);
        const cell = page.getByRole('gridcell').nth(index);
        await cell.click();
        await page.keyboard.press(String(game.solution[index]));
        const board = await page.getByRole('gridcell').allTextContents();
        await expect.poll(() => opened).toBe(1);
        for (let cycle = 0; cycle < 2; cycle++) {
            await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
            await expect.poll(() => closed).toBe(cycle + 1);
            await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
            await expect.poll(() => opened).toBe(cycle + 2);
            expect(await page.getByRole('gridcell').allTextContents()).toEqual(board);
        }
        // Let the supported periodic snapshot persist before testing a real navigation.
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('sudoku_solo_snapshot_v1')!).gameState.board), { timeout: 8000 }).toEqual(
            game.board.map((value, i) => i === index ? game.solution[index] : value),
        );
        await page.goto('/docs/README.md');
        await page.goBack({ waitUntil: 'commit' });
        const events = await page.evaluate(() => (window as any).__lifecycle);
        const evidencePath = testInfo.outputPath('browser-page-transitions.json');
        await writeFile(evidencePath, JSON.stringify({ events, sockets: { opened, closed }, userAgent: await page.evaluate(() => navigator.userAgent) }, null, 2));
        await testInfo.attach('browser-page-transitions', { path: evidencePath, contentType: 'application/json' });
        const restored = events.at(-1)?.type === 'pageshow' && events.at(-1)?.persisted;
        if (!restored) {
            // A non-cached history return remounts the app and restores the saved game at Setup.
            const play = page.getByRole('button', { name: 'Play', exact: true });
            if (await play.isVisible()) await play.click();
        }
        await expect.poll(() => page.getByRole('gridcell').allTextContents()).toEqual(board);
        if (restored) await expect(cell).toBeFocused();
        const nextIndex = game.board.findIndex((value, i) => value === 0 && i !== index);
        await page.getByRole('gridcell').nth(nextIndex).click();
        await page.keyboard.press(String(game.solution[nextIndex]));
        await expect.poll(() => observer.evaluate(({ index, value }) => (window as any).__observed.events.some(
            (event: any) => event.type === 'cell-update' && event.data.index === index && event.data.value === value,
        ), { index: nextIndex, value: game.solution[nextIndex] })).toBe(true);
    } finally {
        await observer.close();
    }
});
