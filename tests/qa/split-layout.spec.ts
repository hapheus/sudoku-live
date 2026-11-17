import { test, expect, type Page } from '@playwright/test';

async function assertRegions(page: Page, primary: string, secondary: string) {
    const left = page.locator(primary);
    const right = page.locator(secondary);
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();
    const a = (await left.boundingBox())!;
    const b = (await right.boundingBox())!;
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
    expect(a.x + a.width).toBeLessThanOrEqual(b.x);
    for (const region of [left, right]) {
        const overflow = await region.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            return Array.from(element.querySelectorAll('*')).filter(child => {
                const style = getComputedStyle(child);
                const rect = child.getBoundingClientRect();
                if (style.position === 'fixed' || style.clip === 'rect(0px, 0px, 0px, 0px)' || !rect.width) return false;
                return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
            }).map(child => child.className);
        });
        expect(overflow).toEqual([]);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const variant of ['3x3', '2x3']) {
    for (const [width, height] of [[667, 375], [812, 375], [844, 390], [1024, 768], [1440, 900]]) {
        test(`equal gameplay regions contain controls through resize ${variant} ${width}x${height}`, async ({ page }) => {
            await page.setViewportSize({ width, height });
            await page.addInitScript(() => localStorage.setItem('sudoku_lang', 'en'));
            await page.routeWebSocket(/.*/, socket => socket.close());
            await page.goto('/');
            await page.getByText(variant === '2x3' ? '2×3 (6×6)' : '3×3 (9×9)', { exact: true }).click();
            await page.locator('#start-game-btn').click();
            await page.keyboard.press('Escape');
            await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__side');
            await page.locator('#game-help-btn').click();
            await expect(page.getByRole('dialog')).toBeVisible();
            await page.keyboard.press('Escape');
            const board = await page.getByRole('grid').innerText();
            await page.setViewportSize({ width: height, height: width });
            await page.setViewportSize({ width, height });
            await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__side');
            expect(await page.getByRole('grid').innerText()).toBe(board);
        });
    }
}

test('setup, settings, watch and legal screens have explicit equal regions', async ({ page }) => {
    await page.setViewportSize({ width: 812, height: 375 });
    await page.addInitScript(() => localStorage.setItem('sudoku_lang', 'en'));
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
    await assertRegions(page, '#play-setup .split-region--primary', '#play-setup .split-region--secondary');
    await page.locator('#nav-settings').click();
    await assertRegions(page, '#settings-panel .split-region--primary', '#settings-panel .split-region--secondary');
    await page.locator('#nav-watch').click();
    await assertRegions(page, '#watch-directory .split-region--primary', '#watch-directory .split-region--secondary');
    await page.locator('#nav-play').click();
    await page.locator('#privacy-link').click();
    await assertRegions(page, '.legal-page__top-bar', '.legal-card');
});

test('emulated unequal display segments keep all screens and dialogs clear of the hinge', async ({ page, context }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1200, height: 800, deviceScaleFactor: 1, mobile: true,
        displayFeature: { orientation: 'vertical', offset: 550, maskLength: 30 },
    });
    await page.addInitScript(() => localStorage.setItem('sudoku_lang', 'en'));
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
    expect(await page.evaluate(() => matchMedia('(horizontal-viewport-segments: 2)').matches)).toBe(true);
    await assertRegions(page, '#play-setup .split-region--primary', '#play-setup .split-region--secondary');
    await page.locator('#nav-settings').click();
    await assertRegions(page, '#settings-panel .split-region--primary', '#settings-panel .split-region--secondary');
    await page.locator('#settings-guide-btn').click();
    const dialog = (await page.getByRole('dialog').boundingBox())!;
    expect(dialog.x).toBeGreaterThanOrEqual(580);
    await page.keyboard.press('Escape');
    await page.locator('#nav-watch').click();
    await assertRegions(page, '#watch-directory .split-region--primary', '#watch-directory .split-region--secondary');
    await page.locator('#nav-play').click();
    await page.locator('#privacy-link').click();
    await assertRegions(page, '.legal-page__top-bar', '.legal-card');
    await page.locator('#legal-back-btn').click();
    await page.locator('#start-game-btn').click();
    await page.keyboard.press('Escape');
    await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__side');
    const board = (await page.locator('.gameplay-stage__board').boundingBox())!;
    const controls = (await page.locator('.gameplay-stage__side').boundingBox())!;
    expect(board.x + board.width).toBeLessThanOrEqual(550);
    expect(controls.x).toBeGreaterThanOrEqual(580);
});
