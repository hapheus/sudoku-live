import { test, expect, type Browser, type Page } from '@playwright/test';
import { createSudokuGame, serializeGameState } from '../../src/domain/sudoku-engine.js';

const solution = [
    1, 2, 3, 4, 5, 6,
    4, 5, 6, 1, 2, 3,
    2, 3, 1, 6, 4, 5,
    5, 6, 4, 2, 3, 1,
    3, 1, 2, 5, 6, 4,
    6, 4, 5, 3, 1, 2,
];

function createPlayers(browser: Browser) {
    return Promise.all(['HostPlayer', 'GuestPlayer', 'Viewer'].map(async name => {
        const context = await browser.newContext({ viewport: { width: 844, height: 390 } });
        await context.addInitScript((playerName) => {
            localStorage.setItem('sudoku_player_name', playerName);
            localStorage.setItem('sudoku_lang', 'en');
        }, name);
        return context;
    }));
}

async function openCoop(contexts: Awaited<ReturnType<typeof createPlayers>>, baseURL: string, holes = 3) {
    const [host, guest, viewer] = await Promise.all(contexts.map(context => context.newPage()));
    const roomId = `stats-${Date.now()}`;
    const game = createSudokuGame({
        variant: '2x3', difficulty: 'easy', solution, puzzle: solution.map((digit, index) => index < holes ? 0 : digit),
    });
    await host.addInitScript(snapshot => {
        localStorage.setItem('sudoku_solo_snapshot_v1', snapshot);
        localStorage.setItem('sudoku_variant', '2x3');
        localStorage.setItem('sudoku_difficulty', 'easy');
        localStorage.setItem('sudoku_joins_auto_accept', 'true');
    }, JSON.stringify({ gameState: serializeGameState(game), roomId }));

    await host.goto(`${baseURL}/`);
    await host.locator('#start-game-btn').click();
    const watchUrl = `${baseURL}/games/${roomId}?watch=1`;
    await guest.goto(watchUrl);
    await guest.locator('#join-from-watch-btn').click();
    await expect(guest.locator('.player-controls')).toBeVisible();
    return { host, guest, viewer, watchUrl };
}

test('Co-op success shows each player’s cells and hints on all screens', async ({ browser, baseURL }) => {
    test.skip(!process.env.CENTRIFUGO_E2E, 'Requires the local Centrifugo broker on port 8081');
    const contexts = await createPlayers(browser);
    try {
        const { host, guest, viewer, watchUrl } = await openCoop(contexts, baseURL!);
        await host.locator('[data-index="0"]').click();
        await host.locator('#hint-btn').click();
        await expect(host.locator('[data-index="0"]')).toHaveText('');
        await host.locator('#hint-btn').click();
        await expect(guest.locator('[data-index="0"]')).toHaveText('1');

        await guest.locator('[data-index="1"]').click();
        await guest.keyboard.press('2');
        await expect(host.locator('[data-index="1"]')).toHaveText('2');
        await guest.locator('#undo-btn').click();
        await expect(host.locator('[data-index="1"]')).toHaveText('');
        await guest.locator('[data-index="1"]').click();
        await guest.keyboard.press('2');

        // A spectator joining after the first hint receives the existing stats in a snapshot.
        await viewer.goto(watchUrl);
        await expect(viewer.locator('[data-index="1"]')).toHaveText('2');
        await viewer.locator('[data-index="2"]').click();
        await viewer.locator('[data-hint-digit="3"]').click();
        await guest.getByRole('region', { name: 'Spectator Hints' }).getByRole('button').click();

        const expectResults = async (page: Page) => {
            const table = page.getByRole('table', { name: 'Player contributions' });
            await expect(table).toBeVisible();
            const hostRow = table.getByRole('row', { name: /HostPlayer/ });
            const guestRow = table.getByRole('row', { name: /GuestPlayer/ });
            await expect(hostRow.getByRole('cell')).toHaveText(['1', '1']);
            await expect(guestRow.getByRole('cell')).toHaveText(['2', '1']);
            await expect(table.getByRole('row', { name: /Viewer/ })).toHaveCount(0);
        };
        await Promise.all([host, guest, viewer].map(expectResults));
        await viewer.reload();
        await expectResults(viewer);
    } finally {
        await Promise.all(contexts.map(context => context.close()));
    }
});

for (const ending of ['partner leaves', 'partner closes the tab', 'rematch window expires']) {
    test(`finished co-op clears waiting when ${ending}`, async ({ browser, baseURL }) => {
        test.skip(!process.env.CENTRIFUGO_E2E, 'Requires the local Centrifugo broker on port 8081');
        const contexts = await createPlayers(browser);
        try {
            const { host, guest } = await openCoop(contexts, baseURL!, 1);
            if (ending === 'rematch window expires') await host.clock.install();
            await guest.locator('[data-index="0"]').click();
            await guest.keyboard.press('1');
            const hostSummary = host.locator('#solve-summary');
            const guestSummary = guest.locator('#solve-summary');
            await expect(hostSummary).toBeVisible();
            await expect(guestSummary).toBeVisible();
            await guestSummary.getByRole('button', { name: 'Play Again' }).click();
            await expect(guestSummary.getByRole('button', { name: /Waiting for partner/i })).toBeDisabled();

            if (ending === 'partner leaves') {
                await hostSummary.locator('#solve-setup-btn').click();
                await expect(host.locator('#play-setup')).toBeVisible();
            } else if (ending === 'partner closes the tab') {
                await host.close();
            } else {
                await host.clock.fastForward(30_001);
                await expect(hostSummary).toBeVisible();
                await expect(hostSummary.getByRole('button', { name: 'Play Again' })).toBeEnabled();
            }
            await expect(guestSummary.getByRole('button', { name: 'Play Again' })).toBeEnabled();
            await expect(guestSummary.getByRole('table')).toBeVisible();
            await guestSummary.getByRole('button', { name: 'Play Again' }).click();
            await expect(guestSummary).toHaveCount(0);
            await expect(guest.locator('.player-controls')).toBeVisible();
            await expect(guest).toHaveURL(/\/$/);
        } finally {
            await Promise.all(contexts.map(context => context.close()));
        }
    });
}

test('accepting a co-op rematch keeps the room open', async ({ browser, baseURL }) => {
    test.skip(!process.env.CENTRIFUGO_E2E, 'Requires the local Centrifugo broker on port 8081');
    const contexts = await createPlayers(browser);
    try {
        const { host, guest } = await openCoop(contexts, baseURL!, 1);
        await host.clock.install();
        await guest.locator('[data-index="0"]').click();
        await guest.keyboard.press('1');
        await guest.locator('#solve-summary').getByRole('button', { name: 'Play Again' }).click();
        await host.locator('#solve-summary').getByRole('button', { name: 'Accept New Puzzle' }).click();
        await Promise.all([host, guest].map(page => expect(page.locator('#solve-summary')).toHaveCount(0)));
        await host.clock.fastForward(30_001);
        await expect(guest).toHaveURL(/\/games\/stats-/);
        await host.locator('#restart-btn').click();
        await expect(guest.getByRole('button', { name: 'Accept New Puzzle' })).toBeEnabled();
    } finally {
        await Promise.all(contexts.map(context => context.close()));
    }
});

test('a guest can cancel an active game and return to setup while the host keeps playing', async ({ browser, baseURL }) => {
    test.skip(!process.env.CENTRIFUGO_E2E, 'Requires the local Centrifugo broker on port 8081');
    const contexts = await createPlayers(browser);
    try {
        const { host, guest, viewer, watchUrl } = await openCoop(contexts, baseURL!);
        await viewer.goto(watchUrl);
        await expect(viewer.locator('#abort-game-btn')).toHaveCount(0);

        await guest.getByRole('button', { name: 'Cancel Game' }).click();
        await expect(guest.locator('#play-setup')).toBeVisible();
        await expect(guest).toHaveURL(/\/$/);
        await expect(guest.locator('#resume-game-btn')).toHaveCount(0);

        await host.locator('[data-index="0"]').click();
        await host.keyboard.press('1');
        await expect(viewer.locator('[data-index="0"]')).toHaveText('1');
    } finally {
        await Promise.all(contexts.map(context => context.close()));
    }
});
