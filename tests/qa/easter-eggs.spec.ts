import { test, expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createSudokuGame, serializeGameState } from '../../src/domain/sudoku-engine.js';

const solution = [
    5,3,4,6,7,8,9,1,2, 6,7,2,1,9,5,3,4,8, 1,9,8,3,4,2,5,6,7,
    8,5,9,7,6,1,4,2,3, 4,2,6,8,5,3,7,9,1, 7,1,3,9,2,4,8,5,6,
    9,6,1,5,3,7,2,8,4, 2,8,7,4,1,9,6,3,5, 3,4,5,2,8,6,1,7,9,
];
const puzzle = solution.map((digit, index) => (index % 3 === 0 || index % 7 === 0 ? digit : 0));
const viewports = [
    [360, 640],
    [390, 844],
    [768, 1024],
    [1280, 800],
    [1440, 900],
    [844, 390],
] as const;

async function openGameplay(page: Page, theme: 'dark' | 'light' = 'dark') {
    const game = createSudokuGame({ difficulty: 'medium', solution, puzzle });
    await page.addInitScript(({ snapshot, themeName }) => {
        if (!localStorage.getItem('sudoku_solo_snapshot_v1')) {
            localStorage.setItem('sudoku_solo_snapshot_v1', snapshot);
            localStorage.setItem('sudoku_theme', themeName);
            localStorage.setItem('sudoku_lang', 'en');
            localStorage.setItem('sudoku_difficulty', 'medium');
            localStorage.setItem('sudoku_variant', '3x3');
        }
    }, { snapshot: JSON.stringify({ gameState: serializeGameState(game), roomId: 'qa-easter-room' }), themeName: theme });
    await page.routeWebSocket(/.*/, (socket) => socket.close());
    await page.goto('/');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('grid')).toBeVisible();
    await page.getByRole('gridcell').first().click();
}

async function enterKonamiArrows(page: Page) {
    const arrows = [
        '#shift-row-up-btn',
        '#shift-row-up-btn',
        '#shift-row-down-btn',
        '#shift-row-down-btn',
        '#shift-col-left-btn',
        '#shift-col-right-btn',
        '#shift-col-left-btn',
        '#shift-col-right-btn',
    ];
    for (const selector of arrows) {
        await page.locator(selector).click();
    }
}

async function checkAccessibility(page: Page, testInfo: TestInfo, state: string) {
    const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
    await testInfo.attach(`axe-${state}`, {
        body: JSON.stringify(violations, null, 2),
        contentType: 'application/json',
    });
    expect(violations, `Accessibility violations in ${state}`).toEqual([]);
}

test('Konami code A/B/C/D prompt resets on wrong button and activates 1981 Retro mode on B -> A', async ({ page }, testInfo) => {
    const currentYear = String(new Date().getFullYear());
    await page.setViewportSize({ width: 390, height: 844 });
    await openGameplay(page, 'dark');

    await enterKonamiArrows(page);
    await expect(page.locator('#konami-btn-a')).toBeVisible();
    await expect(page.locator('#konami-btn-b')).toBeVisible();
    await expect(page.locator('#konami-btn-c')).toBeVisible();
    await expect(page.locator('#konami-btn-d')).toBeVisible();

    // Wrong press (C) immediately restores shift arrows
    await page.locator('#konami-btn-c').click();
    await expect(page.locator('#shift-row-up-btn')).toBeVisible();
    await expect(page.locator('#konami-btn-a')).toHaveCount(0);

    // Complete full Konami sequence: arrows + B + A
    await enterKonamiArrows(page);
    await page.locator('#konami-btn-b').click();
    await page.locator('#konami-btn-a').click();

    await expect(page.locator('html')).toHaveAttribute('data-retro', 'true');
    await expect(page.locator('#shift-row-up-btn')).toHaveCount(0);
    await expect(page.locator('.sudoku-board__artwork')).toBeHidden();

    const exitBtn = page.getByRole('button', { name: `Back to ${currentYear}` });
    await expect(exitBtn).toBeVisible();
    const box = await exitBtn.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await checkAccessibility(page, testInfo, 'retro-dark-390x844');

    // Navigating away to Settings still keeps Back to <year> accessible
    await page.locator('#game-settings-btn').click();
    await expect(page.locator('#retro-global-exit-btn')).toBeVisible();
    await expect(page.locator('#retro-global-exit-btn')).toHaveText(`Back to ${currentYear}`);
    await page.getByRole('tab', { name: 'Play', exact: true }).click();

    // Keyboard activation to return to current year
    await exitBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).not.toHaveAttribute('data-retro', 'true');
    await expect(page.locator('#shift-row-up-btn')).toBeVisible();
});

for (const theme of ['dark', 'light'] as const) {
    for (const [width, height] of viewports) {
        test(`Retro mode layout and accessibility ${theme} ${width}x${height}`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height });
            await openGameplay(page, theme);
            await enterKonamiArrows(page);
            await page.locator('#konami-btn-b').click();
            await page.locator('#konami-btn-a').click();

            await expect(page.locator('html')).toHaveAttribute('data-retro', 'true');
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await checkAccessibility(page, testInfo, `retro-${theme}-${width}x${height}`);
            await page.screenshot({
                path: testInfo.outputPath(`retro-${theme}-${width}x${height}.png`),
                mask: [page.locator('#sudoku-timer')],
                fullPage: true,
            });
        });
    }
}
