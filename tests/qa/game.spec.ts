import { test, expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createSudokuGame, serializeGameState } from '../../src/domain/sudoku-engine.js';

const solution = [
    5,3,4,6,7,8,9,1,2, 6,7,2,1,9,5,3,4,8, 1,9,8,3,4,2,5,6,7,
    8,5,9,7,6,1,4,2,3, 4,2,6,8,5,3,7,9,1, 7,1,3,9,2,4,8,5,6,
    9,6,1,5,3,7,2,8,4, 2,8,7,4,1,9,6,3,5, 3,4,5,2,8,6,1,7,9,
];
const puzzle = solution.map((digit, index) => index % 3 === 0 || index % 7 === 0 ? digit : 0);
const viewports = [[360,640], [390,844], [768,1024], [1280,800], [1440,900], [844,390]];

async function openFixture(page: Page, theme = 'dark', almostSolved = false) {
    const game = createSudokuGame({
        difficulty: 'medium', solution,
        puzzle: almostSolved ? solution.map((digit, index) => index === 1 ? 0 : digit) : puzzle,
    });
    await page.addInitScript(({ snapshot, theme }) => {
        // Seed only once: reload must exercise the app's real persistence.
        if (!localStorage.getItem('sudoku_solo_snapshot_v1')) {
            localStorage.setItem('sudoku_solo_snapshot_v1', snapshot);
            localStorage.setItem('sudoku_theme', theme);
            localStorage.setItem('sudoku_lang', 'en');
            localStorage.setItem('sudoku_difficulty', 'medium');
            localStorage.setItem('sudoku_variant', '3x3');
        }
    }, { snapshot: JSON.stringify({ gameState: serializeGameState(game), roomId: 'qa-room' }), theme });
    // Local/offline coverage must never depend on a live Centrifugo server.
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
}

async function checkAccessibility(page: Page, testInfo: TestInfo, state: string) {
    const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    await testInfo.attach(`axe-${state}`, { body: JSON.stringify(violations, null, 2), contentType: 'application/json' });
    expect.soft(violations, `Accessibility: ${state}`).toEqual([]);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
    // Only the live elapsed-time text is masked; layout and other telemetry are checked.
    const options = { mask: [page.locator('#sudoku-timer')], fullPage: true };
    await page.screenshot({ ...options, path: testInfo.outputPath(`${name}.png`) });
    await expect.soft(page).toHaveScreenshot(`${name}.png`, options);
}

for (const theme of ['dark', 'light']) {
    for (const [width, height] of viewports) {
        test(`setup and gameplay ${theme} ${width}x${height}`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height });
            await openFixture(page, theme);
            await expect(page.getByRole('radio', { name: '3×3 (9×9)', exact: true })).toBeChecked();
            await expect(page.getByRole('tab', { name: 'Play', exact: true })).toHaveAttribute('aria-selected', 'true');
            await expect(page.getByRole('grid')).toHaveCount(0);
            await checkAccessibility(page, testInfo, 'setup');
            await capture(page, testInfo, `setup-${theme}-${width}x${height}`);

            // Traverse the actual setup controls, rather than assuming Play is first.
            const play = page.getByRole('button', { name: 'Play', exact: true });
            for (let step = 0; step < 12 && !(await play.evaluate(el => el === document.activeElement)); step++) {
                await page.keyboard.press('Tab');
            }
            await expect(play).toBeFocused();
            await page.keyboard.press('Enter');
            await expect(page.getByRole('gridcell').first()).toBeFocused();
            await page.keyboard.press('ArrowRight');
            await page.keyboard.press('3');
            await expect(page.getByRole('gridcell').nth(1)).toHaveText('3');
            await page.keyboard.press('ControlOrMeta+z');
            await expect(page.getByRole('gridcell').nth(1)).toHaveText('');
            await expect(page.getByRole('button', { name: 'Setup', exact: true })).toBeVisible();
            await expect(page.getByRole('button', { name: 'New Puzzle', exact: true })).toBeVisible();
            await expect(page.getByRole('radio')).toHaveCount(0);
            await expect(page.getByRole('tab')).toHaveCount(3);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await checkAccessibility(page, testInfo, 'game');
            await capture(page, testInfo, `game-${theme}-${width}x${height}`);
            await page.getByRole('button', { name: 'Notes', exact: true }).click();
            await expect(page.getByRole('button', { name: 'Notes On' })).toHaveAttribute('aria-pressed', 'true');
            await checkAccessibility(page, testInfo, 'notes');
            // Playwright checks hit testing: the fixed navigation must not block input.
            await page.getByRole('button', { name: /^Enter 9,/ }).click();
            await expect(page.getByRole('gridcell').nth(1)).toHaveText('9');
            const nav = await page.getByRole('navigation', { name: 'Primary Navigation' }).boundingBox();
            expect(nav).not.toBeNull();
            expect(nav!.y + nav!.height).toBeLessThanOrEqual(height + 1);
        });
    }
}

test('completion offers another game and reload restores actual progress', async ({ page }, testInfo) => {
    await openFixture(page, 'dark', true);
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('3');
    await expect(page.getByRole('heading', { name: 'Puzzle Solved', exact: true })).toBeVisible();
    await checkAccessibility(page, testInfo, 'completed');
    await page.getByRole('button', { name: 'Play Again', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Puzzle Solved', exact: true })).toHaveCount(0);
    const boardBeforeHint = await page.getByRole('gridcell').allTextContents();
    await page.getByRole('button', { name: 'Hint', exact: true }).click();
    expect(await page.getByRole('gridcell').allTextContents()).toEqual(boardBeforeHint);
    await page.getByRole('button', { name: 'Hint', exact: true }).click();
    const board = await page.getByRole('gridcell').allTextContents();
    expect(board).not.toEqual(boardBeforeHint);
    await page.reload();
    await page.getByRole('button', { name: 'Resume Current Game', exact: true }).click();
    expect(await page.getByRole('gridcell').allTextContents()).toEqual(board);
});

test('settings change theme and language persistently; zoom keeps controls reachable', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openFixture(page);
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await checkAccessibility(page, testInfo, 'settings-dark');
    await page.getByText('Light', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await checkAccessibility(page, testInfo, 'settings-light');
    await page.getByRole('button', { name: 'Open Guide', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Game Guide' })).toBeVisible();
    await checkAccessibility(page, testInfo, 'guide-light');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByText('Deutsch', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await page.getByRole('tab', { name: 'Einstellungen', exact: true }).click();
    await page.getByRole('button', { name: 'Anleitung öffnen', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Spielanleitung' })).toBeVisible();
    await page.getByRole('button', { name: 'Schließen', exact: true }).click();
    await page.getByText('English', { exact: true }).click();
    await page.getByRole('tab', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Notes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Notes On' })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('zoom-200.png'), fullPage: true });
});


test('setup selects and restores a 6 by 6 easy puzzle', async ({ page }, testInfo) => {
    await openFixture(page);
    await page.getByText('2×3 (6×6)', { exact: true }).click();
    await page.getByText('Easy', { exact: true }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('grid', { name: '6 by 6 Sudoku grid' })).toBeVisible();
    await expect(page.getByRole('gridcell')).toHaveCount(36);
    await checkAccessibility(page, testInfo, '6x6');
    const board = await page.getByRole('gridcell').allTextContents();
    await page.reload();
    await expect(page.getByRole('radio', { name: '2×3 (6×6)', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Easy', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    expect(await page.getByRole('gridcell').allTextContents()).toEqual(board);
});

test('web start screen exposes App Store Coming Soon badge, Privacy Policy, and Impressum cleanly', async ({ page }, testInfo) => {
    await openFixture(page);
    await expect(page.locator('#app-store-link')).toContainText('App Store');
    await expect(page.locator('#app-store-link')).toContainText('Coming Soon');
    await expect(page.locator('#app-store-link')).not.toHaveAttribute('href', /.+/);
    await expect(page.locator('#privacy-link')).toBeVisible();
    await expect(page.locator('#impressum-link')).toBeVisible();

    await page.locator('#privacy-link').click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.locator('#legal-privacy')).toBeVisible();
    await checkAccessibility(page, testInfo, 'privacy-page');

    await page.locator('#legal-switch-impressum').click();
    await expect(page).toHaveURL(/\/impressum$/);
    await expect(page.locator('#legal-impressum')).toBeVisible();
    await checkAccessibility(page, testInfo, 'impressum-page');

    await page.locator('#legal-back-btn').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#play-setup')).toBeVisible();
});

test('start screen music toggle defaults to Off (opt-in), syncs with Settings, and persists across reload', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFixture(page, 'dark');

    const setupMusicOff = page.locator('#setup-music-control input[value="false"]');
    const setupMusicOn = page.locator('#setup-music-control input[value="true"]');
    await expect(setupMusicOff).toBeChecked();
    await expect(setupMusicOn).not.toBeChecked();

    // Opt in on Start screen
    await page.locator('#setup-music-control label', { hasText: 'On' }).click();
    await expect(setupMusicOn).toBeChecked();

    // Verify synced in Settings and persists across reload
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    const settingsMusicGroup = page.getByRole('radiogroup', { name: 'Background Music' });
    await expect(settingsMusicGroup.locator('input[value="true"]')).toBeChecked();
    await expect(page.getByRole('slider', { name: 'Volume: Background Music' })).toBeEnabled();

    await page.reload();
    await expect(page.locator('#setup-music-control input[value="true"]')).toBeChecked();
});


