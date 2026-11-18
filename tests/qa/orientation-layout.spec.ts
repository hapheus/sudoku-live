import { mkdir, writeFile } from 'node:fs/promises';
import { test, expect, type CDPSession, type Page, type TestInfo } from '@playwright/test';

async function rotate(cdp: CDPSession, angle: 0 | 90 | 270, compact: boolean) {
    const [landscapeWidth, landscapeHeight] = compact ? [678, 466] : [951, 669];
    const [width, height] = angle === 0 ? [landscapeHeight, landscapeWidth] : [landscapeWidth, landscapeHeight];
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: true,
        screenOrientation: {
            angle, type: angle === 0 ? 'portraitPrimary' : angle === 90 ? 'landscapePrimary' : 'landscapeSecondary',
        },
    });
    await cdp.send('Emulation.setSafeAreaInsetsOverride', {
        insets: { top: angle === 0 ? 21 : 0, bottom: angle === 0 ? 21 : 0,
            left: angle === 90 ? 62 : 0, right: angle === 270 ? 62 : 0 },
    });
}

async function assertGameLayout(page: Page, landscape: boolean) {
    const toolbar = page.locator('.gameplay-stage__toolbar');
    await expect(toolbar.getByRole('button', { name: 'Open Guide' })).toBeInViewport();
    await expect.poll(() => page.evaluate(landscape => {
        const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const board = rect('.gameplay-stage__board');
        const controls = rect('.gameplay-stage__side, .gameplay-stage__guide');
        const toolbar = rect('.gameplay-stage__toolbar');
        const stage = rect('.gameplay-stage');
        return landscape
            ? Math.abs(board.width - controls.width) < 1 && board.right <= innerWidth / 2 &&
                controls.left >= innerWidth / 2 && toolbar.bottom <= stage.top && Math.abs(toolbar.top - 12) < 1
            : board.bottom <= controls.top && stage.bottom <= toolbar.top &&
                Math.abs(toolbar.bottom - (innerHeight - 21)) < 1;
    }, landscape)).toBe(true);
}

async function capture(cdp: CDPSession, testInfo: TestInfo, name: string) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const path = testInfo.outputPath(`${name}.png`);
    await mkdir(testInfo.outputDir, { recursive: true });
    await writeFile(path, Buffer.from(data, 'base64'));
    await testInfo.attach(name, { path, contentType: 'image/png' });
}

for (const { variant, compact } of [
    { variant: '3×3 (9×9)', compact: false },
    { variant: '2×3 (6×6)', compact: true },
]) {
    test(`${variant} follows the orientation on Duo-sized viewports with no device override`, async ({ page, context }, testInfo) => {
        const cdp = await context.newCDPSession(page);
        await rotate(cdp, 0, compact);
        await page.addInitScript(() => {
            localStorage.setItem('sudoku_lang', 'en');
            localStorage.setItem('sudoku_theme', 'dark');
        });
        await page.routeWebSocket(/.*/, socket => socket.close());
        await page.goto('/');
        await page.getByText(variant, { exact: true }).click();
        await page.locator('#start-game-btn').click();
        await page.locator('.sudoku-cell:not(.sudoku-cell--given)').first().click();
        await page.keyboard.press('1');
        const puzzle = await page.getByRole('grid').innerText();

        await assertGameLayout(page, false);
        await capture(cdp, testInfo, 'portrait-bottom-actions');
        for (const angle of [90, 270] as const) {
            await rotate(cdp, angle, compact);
            await assertGameLayout(page, true);
            await page.locator('#restart-btn').click();
            const notice = page.getByRole('alertdialog');
            await expect(notice).toBeVisible();
            await page.locator('#game-help-btn').click();
            await expect(page.getByRole('dialog')).toBeVisible();
            await expect(notice).toBeVisible();
            await assertGameLayout(page, true);
            await capture(cdp, testInfo, `landscape-top-actions-${angle}`);
            await page.getByRole('button', { name: 'Close', exact: true }).click();
            await notice.locator('.confirm-banner__btn--cancel').click();
            expect(await page.getByRole('grid').innerText()).toBe(puzzle);
        }
        await rotate(cdp, 0, compact);
        await assertGameLayout(page, false);
        expect(await page.getByRole('grid').innerText()).toBe(puzzle);
    });
}
