import { test, expect, type Page } from '@playwright/test';
import { createSudokuGame, serializeGameState } from '../../src/domain/sudoku-engine.js';

const minuteBefore = (hour: number) => new Date(Date.UTC(2026, 10, 17, 23 + hour) - 1000);
const cells = (page: Page) => page.getByRole('gridcell').allTextContents();
const ghost = (page: Page) => page.locator('.night-ghost');

async function seedSolo(page: Page, variant = '3x3', roomId = 'qa-night-ghost', muted = false) {
    const game = createSudokuGame({ variant });
    await page.addInitScript(({ snapshot, variant, muted }) => {
        if (!localStorage.getItem('sudoku_solo_snapshot_v1')) {
            localStorage.setItem('sudoku_solo_snapshot_v1', snapshot);
            localStorage.setItem('sudoku_variant', variant);
        }
        localStorage.setItem('sudoku_joins_auto_accept', 'true');
        localStorage.setItem('sudoku_lang', 'en');
        if (muted) localStorage.setItem('sudoku_sound_enabled', 'false');
        const original = AudioContext.prototype.createOscillator;
        const pitches: number[] = [];
        Object.defineProperty(window, 'qaGhostPitches', { value: pitches });
        AudioContext.prototype.createOscillator = function () {
            const oscillator = original.call(this);
            const set = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
            oscillator.frequency.setValueAtTime = (frequency, time) => {
                pitches.push(frequency);
                return set(frequency, time);
            };
            return oscillator;
        };
    }, { snapshot: JSON.stringify({ gameState: serializeGameState(game), roomId }), variant, muted });
}

async function pauseAt(page: Page, date: Date) {
    await page.clock.install({ time: new Date(date.getTime() - 10_000) });
    await page.clock.pauseAt(date);
}

async function play(page: Page) {
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('grid')).toBeVisible();
}

for (const hour of [0, 1, 2, 3]) {
    test(`night ghost at 0${hour}:00`, async ({ page }, testInfo) => {
        const fullMotion = hour === 0;
        await pauseAt(page, minuteBefore(hour));
        await page.emulateMedia({ reducedMotion: fullMotion ? 'no-preference' : 'reduce' });
        await page.setViewportSize({ width: 390, height: 844 });
        await seedSolo(page, hour % 2 ? '2x3' : '3x3', undefined, !fullMotion);
        await page.routeWebSocket(/.*/, socket => socket.close());
        await page.goto('/');
        await play(page);
        const before = await cells(page);
        await expect(ghost(page)).toHaveCount(0);
        await page.clock.runFor(1000);
        await expect(ghost(page)).toHaveAttribute('data-phase', 'enter');
        await expect(ghost(page).locator('.night-ghost__flight')).toHaveCSS('animation-name', fullMotion ? 'night-ghost-enter' : 'none');
        await expect(ghost(page).locator('.night-ghost-slab')).toHaveCount(2);
        await page.clock.runFor(540);
        await expect(ghost(page)).toHaveAttribute('data-phase', 'hover');
        if (fullMotion) await page.screenshot({ path: testInfo.outputPath('night-ghost-hover.png') });
        await page.clock.runFor(400);
        await expect(ghost(page)).toHaveAttribute('data-phase', 'swap');
        await expect(ghost(page).locator('.night-ghost-slab').first()).toHaveCSS('animation-name', fullMotion ? 'night-ghost-swap' : 'none');
        await expect(page.locator('#game-announcements')).toHaveText(/A ghost swapped two/);
        if (fullMotion) {
            const slabs = ghost(page).locator('.night-ghost-slab');
            await slabs.evaluateAll(elements => elements.forEach(element => {
                for (const animation of element.getAnimations()) {
                    animation.pause();
                    animation.currentTime = 210;
                }
            }));
            await expect(slabs.first()).not.toHaveCSS('transform', 'none');
            await page.screenshot({ path: testInfo.outputPath('night-ghost-swap.png') });
        }
        await page.clock.runFor(620);
        await expect(ghost(page)).toHaveAttribute('data-phase', 'grin');
        if (fullMotion) await page.screenshot({ path: testInfo.outputPath('night-ghost-grin.png') });
        await page.clock.runFor(370);
        await expect(ghost(page)).toHaveAttribute('data-phase', 'exit');
        await page.clock.runFor(560);
        await expect(ghost(page)).toHaveCount(0);
        const after = await cells(page);
        expect(after).not.toEqual(before);
        if (fullMotion) {
            await expect.poll(() => page.evaluate(() => Reflect.get(window, 'qaGhostPitches'))).toEqual(expect.arrayContaining([294, 660, 110]));
        } else {
            expect(await page.evaluate(() => Reflect.get(window, 'qaGhostPitches'))).toEqual([]);
        }
        await page.clock.runFor(60_000);
        await expect(ghost(page)).toHaveCount(0);
        expect(await cells(page)).toEqual(after);
    });
}

test('an inactive slot is skipped and a repeated local hour stays claimed after reload', async ({ page }) => {
    await pauseAt(page, new Date('2026-10-25T01:59:59+02:00'));
    await seedSolo(page);
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
    await play(page);
    await page.clock.runFor(1000);
    await expect(ghost(page)).toHaveAttribute('data-phase', 'enter');
    const after = await cells(page);

    // Autumn clock change repeats 02:00 with a different UTC offset, after a reload.
    await page.clock.setSystemTime(new Date('2026-10-25T02:59:59+02:00'));
    await page.reload();
    await play(page);
    await page.clock.runFor(1000);
    await expect(ghost(page)).toHaveCount(0);
    expect(await cells(page)).toEqual(after);

    await page.clock.setSystemTime(new Date('2026-10-25T02:59:59+01:00'));
    await page.reload();
    await page.clock.runFor(1000);
    await play(page);
    await page.clock.runFor(2500);
    await expect(ghost(page)).toHaveCount(0);
    expect(await cells(page)).toEqual(after);
});

for (const variant of ['2x3', '3x3']) {
    test(`host, guest and spectator converge on one ghost swap on ${variant}`, async ({ browser, baseURL }) => {
        test.skip(!process.env.CENTRIFUGO_E2E, 'Requires the local Centrifugo broker on port 8081');
        const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext({ timezoneId: 'Europe/Vienna' })));
        try {
            const [host, guest, spectator] = await Promise.all(contexts.map(context => context.newPage()));
            const room = `ghost-${variant}-${Date.now()}`;
            const nearMidnight = new Date(minuteBefore(0).getTime() - 90_000);
            await Promise.all([host, guest, spectator].map(page => page.clock.install({ time: nearMidnight })));
            await seedSolo(host, variant, room);
            await host.goto(`${baseURL}/`);
            await play(host);
            const before = await cells(host);
            await guest.goto(`${baseURL}/games/${room}?watch=1`);
            await expect(guest.locator('#connection-status')).toHaveText('Live');
            await guest.locator('#join-from-watch-btn').click();
            await expect(host.locator('#opponent-status')).toContainText('online', { ignoreCase: true });
            await spectator.goto(`${baseURL}/games/${room}?watch=1`);
            await expect(spectator.locator('#connection-status')).toHaveText('Live');
            await expect.poll(() => cells(spectator)).toEqual(before);
            await expect.poll(() => cells(guest)).toEqual(before);
            await host.clock.pauseAt(minuteBefore(0));
            await Promise.all([guest, spectator].map(page => page.clock.setSystemTime(minuteBefore(0))));
            await host.clock.runFor(1000);
            await expect(ghost(host)).toBeVisible();
            await expect(ghost(guest)).toBeVisible();
            await expect(ghost(spectator)).toBeVisible();
            const after = await cells(host);
            expect(after).not.toEqual(before);
            await expect.poll(() => cells(guest)).toEqual(after);
            await expect.poll(() => cells(spectator)).toEqual(after);
            await host.clock.runFor(2490);
            await expect(ghost(host)).toHaveCount(0);
            await spectator.reload();
            await expect.poll(() => cells(spectator)).toEqual(after);
            await expect(ghost(spectator)).toHaveCount(0);
        } finally {
            await Promise.all(contexts.map(context => context.close()));
        }
    });
}
