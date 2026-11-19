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
        insets: { top: 0, bottom: angle === 0 ? 21 : 0,
            left: angle === 90 ? 62 : 0, right: angle === 270 ? 62 : 0 },
    });
}

async function assertGameLayout(page: Page, landscape: boolean) {
    const toolbar = page.locator('.gameplay-stage__toolbar');
    await expect(toolbar.locator('#game-help-btn')).toBeInViewport();
    await expect.poll(() => page.evaluate(landscape => {
        const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
        const board = rect('.gameplay-stage__board');
        const controls = rect('.gameplay-stage__controls');
        const toolbar = rect('.gameplay-stage__toolbar');
        const stage = rect('.gameplay-stage');
        return landscape
            ? board.width === controls.width && board.right <= innerWidth / 2 &&
                controls.left >= innerWidth / 2 && toolbar.bottom <= stage.top && Math.abs(toolbar.top - 12) < 1
            : board.height === controls.height && board.bottom <= controls.top &&
                Math.abs((board.bottom + controls.top) / 2 - innerHeight / 2) < 1 &&
                controls.bottom === toolbar.bottom &&
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
    { variant: '9×9', compact: false },
    { variant: '6×6', compact: true },
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

test('compact Duo landscape scales board digits, notes and hint badges to fit', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await rotate(cdp, 90, false);
    await page.addInitScript(() => localStorage.setItem('sudoku_lang', 'en'));
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
    await page.getByText('9×9', { exact: true }).click();
    await page.locator('#start-game-btn').click();
    const emptyCells = page.locator('.sudoku-cell:not(.sudoku-cell--given)');
    await emptyCells.first().click();
    await page.locator('#notes-btn').click();
    await page.keyboard.press('1');
    const board = page.getByRole('grid');

    // Add the badge markup here so this layout check can run without an online room.
    await emptyCells.nth(1).evaluate(cell => {
        const badge = document.createElement('span');
        badge.className = 'sudoku-cell__hint-badge';
        badge.textContent = '9';
        cell.append(badge);
    });
    const measure = () => board.evaluate(grid => {
        const digit = grid.querySelector<HTMLElement>('.sudoku-cell__digit')!;
        const note = [...grid.querySelectorAll<HTMLElement>('.sudoku-cell__note')]
            .find(element => element.textContent!.trim())!;
        const badge = grid.querySelector<HTMLElement>('.sudoku-cell__hint-badge')!;
        const cell = digit.parentElement!.getBoundingClientRect();
        const hintCell = badge.parentElement!.getBoundingClientRect();
        const hint = badge.getBoundingClientRect();
        return {
            digitSize: parseFloat(getComputedStyle(digit).fontSize),
            noteSize: parseFloat(getComputedStyle(note).fontSize),
            hintSize: hint.height,
            cellHeight: cell.height,
            noteHeight: note.getBoundingClientRect().height,
            hintFits: hint.top >= hintCell.top && hint.bottom <= hintCell.bottom &&
                hint.left >= hintCell.left && hint.right <= hintCell.right,
        };
    });
    const larger = await measure();
    for (const angle of [90, 270] as const) {
        await rotate(cdp, angle, true);
        await expect.poll(async () => {
            const compact = await measure();
            return compact.digitSize < larger.digitSize && compact.digitSize < compact.cellHeight &&
                compact.noteSize < larger.noteSize && compact.noteSize <= compact.noteHeight &&
                compact.hintSize < larger.hintSize && compact.hintFits;
        }).toBe(true);
    }
});

test('portrait gameplay panes remain exactly equal around an off-center hinge and asymmetric safe areas', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 467, height: 851, deviceScaleFactor: 1, mobile: true,
        displayFeature: { orientation: 'horizontal', offset: 404, maskLength: 31 },
    });
    await cdp.send('Emulation.setSafeAreaInsetsOverride', {
        insets: { top: 24, bottom: 11, left: 0, right: 0 },
    });
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
    expect(await page.evaluate(() => matchMedia('(vertical-viewport-segments: 2)').matches)).toBe(true);

    const artwork = page.locator('.landscape-artwork');
    async function assertHinge(first: string, second: string) {
        await expect.poll(() => page.evaluate(([first, second]) => {
            const upper = document.querySelector(first)!.getBoundingClientRect();
            const lower = document.querySelector(second)!.getBoundingClientRect();
            return upper.height === lower.height && upper.top >= 24 && lower.bottom <= innerHeight - 24 &&
                upper.bottom <= 404 && lower.top >= 435 &&
                Math.abs((upper.bottom + lower.top) / 2 - innerHeight / 2) < 1;
        }, [first, second])).toBe(true);
    }

    for (const tab of ['#nav-watch', '#nav-settings', '#nav-play']) {
        await page.locator(tab).click();
        await expect(artwork).toHaveCount(0);
    }
    await page.locator('#privacy-link').click();
    const content = page.locator('.landscape-screen__content');
    await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await content.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(artwork).toHaveCount(0);
    await page.locator('#legal-back-btn').click();
    await page.locator('#start-game-btn').click();
    await assertHinge('.gameplay-stage__board', '.gameplay-stage__controls');
    await page.locator('#notes-btn').click();
    await assertHinge('.gameplay-stage__board', '.gameplay-stage__controls');
});

test('navigation shows icons only when the localized tab labels no longer fit', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.addInitScript(() => localStorage.setItem('sudoku_lang', 'de'));
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');

    const tabs = ['Spielen', 'Zuschauen', 'Einstellungen'].map(name => page.getByRole('tab', { name, exact: true }));
    for (const tab of tabs) await expect(tab.locator('.bottom-nav__label')).toBeVisible();

    await page.setViewportSize({ width: 260, height: 700 });
    for (const tab of tabs) {
        await expect(tab.locator('.bottom-nav__label')).toBeHidden();
        await expect(tab.locator('svg')).toBeVisible();
    }
    await tabs[2].click();
    await expect(tabs[2]).toHaveAttribute('aria-selected', 'true');

    const language = page.locator('.settings-language select');
    await language.selectOption('en');
    await expect(page.getByRole('tab', { name: 'Settings' }).locator('.bottom-nav__label')).toBeVisible();
    await language.selectOption('de');
    await expect(tabs[2].locator('.bottom-nav__label')).toBeHidden();

    await page.setViewportSize({ width: 390, height: 700 });
    for (const tab of tabs) await expect(tab.locator('.bottom-nav__label')).toBeVisible();
});
