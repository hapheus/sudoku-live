import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { expect, test, type CDPSession, type Page, type TestInfo } from '@playwright/test';

const boardPane = '.gameplay-stage__board';
const lowerPane = '.gameplay-stage__lower';

async function openApp(page: Page, nativeDuo: boolean, language = 'en') {
    await page.addInitScript(({ nativeDuo, language }) => {
        Object.assign(window, { sudokuShiftDuo: nativeDuo });
        localStorage.setItem('sudoku_lang', language);
        localStorage.setItem('sudoku_theme', 'dark');
    }, { nativeDuo, language });
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
}

async function rotate(cdp: CDPSession, angle: 0 | 90 | 270, nativeDuo: boolean, outer = false) {
    const [width, height] = angle === 0 ? [466, 678] : outer ? [678, 466] : [951, 669];
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: true,
        screenOrientation: {
            angle, type: angle === 0 ? 'portraitPrimary' : angle === 90 ? 'landscapePrimary' : 'landscapeSecondary',
        },
        ...(!nativeDuo && angle !== 0 ? { displayFeature: { orientation: 'horizontal', offset: 323, maskLength: 21 } } : {}),
    });
    await cdp.send('Emulation.setSafeAreaInsetsOverride', {
        insets: { top: angle === 90 ? 21 : 0, bottom: angle === 270 ? 21 : 0,
            left: angle === 90 ? 62 : 0, right: angle === 270 ? 62 : 0 },
    });
}

async function assertPanes(page: Page, first: string, second: string, hinge: boolean) {
    await expect.poll(async () => page.evaluate(([first, second, hinge]) => {
        const top = document.querySelector(first)?.getBoundingClientRect();
        const bottom = document.querySelector(second)?.getBoundingClientRect();
        if (!document.querySelector('[data-stacked-layout]') || !top || !bottom) return null;
        return {
            equalHeights: Math.abs(top.height - bottom.height) < 1,
            centered: Math.abs((top.bottom + bottom.top - innerHeight) / 2) < 1,
            clearOfHinge: top.bottom <= (hinge ? 323 : innerHeight / 2) &&
                bottom.top >= (hinge ? 344 : innerHeight / 2),
            clearOfSafeAreas: top.top >= 21 && bottom.bottom <= innerHeight - 21,
        };
    }, [first, second, hinge] as const)).toEqual({
        equalHeights: true, centered: true, clearOfHinge: true, clearOfSafeAreas: true,
    });
}

async function assertGameplayFits(page: Page, hinge: boolean) {
    await assertPanes(page, boardPane, lowerPane, hinge);
    const readGeometry = () => page.evaluate(([boardPane, lowerPane]) => {
        const board = document.querySelector(boardPane)!;
        const lower = document.querySelector(lowerPane)!;
        const overflow = [board, lower].flatMap(pane => {
            const bounds = pane.getBoundingClientRect();
            return [...pane.querySelectorAll('*')].filter(child => {
                const rect = child.getBoundingClientRect();
                const style = getComputedStyle(child);
                if (!rect.width || style.visibility === 'hidden' || child.closest('.sudoku-board__artwork, .sr-only')) return false;
                return rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1 ||
                    rect.left < bounds.left - 1 || rect.right > bounds.right + 1 ||
                    (/(auto|scroll)/.test(style.overflow) &&
                        (child.scrollHeight > child.clientHeight + 1 || child.scrollWidth > child.clientWidth + 1));
            }).map(child => [(child.id || child.getAttribute('class') || child.tagName), child.getBoundingClientRect().toJSON()]);
        });
        const grid = document.querySelector('#sudoku-board')!.getBoundingClientRect();
        const style = getComputedStyle(board);
        const padding = parseFloat(style.paddingTop);
        const axes = document.querySelector('.board-col-axes')!.getBoundingClientRect().height;
        const root = document.documentElement;
        return {
            overflow, square: Math.abs(grid.height - grid.width),
            unusedHeight: board.clientHeight - 2 * padding - axes - parseFloat(style.fontSize) * 0.2 - grid.height,
            pageScroll: [root.scrollWidth - innerWidth, root.scrollHeight - innerHeight],
        };
    }, [boardPane, lowerPane]);
    await expect.poll(async () => (await readGeometry()).overflow).toEqual([]);
    const geometry = await readGeometry();
    expect(geometry.square).toBeLessThan(1);
    expect(Math.abs(geometry.unusedHeight)).toBeLessThan(1);
    expect(geometry.pageScroll).toEqual([0, 0]);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
    const path = testInfo.outputPath(`${name}.png`);
    await mkdir(dirname(path), { recursive: true });

    const cdp = await page.context().newCDPSession(page);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await cdp.detach();
    await writeFile(path, Buffer.from(data, 'base64'));
    await testInfo.attach(name, { path, contentType: 'image/png' });
}

for (const { variant, nativeDuo, outer, language } of [
    { variant: '3×3 (9×9)', nativeDuo: false, outer: false, language: 'en' },
    { variant: '2×3 (6×6)', nativeDuo: true, outer: false, language: 'de' },
    { variant: '3×3 (9×9)', nativeDuo: true, outer: true, language: 'de' },
]) {
    test(`Duo ${variant} fits controls, guide and notices through both rotations (native=${nativeDuo}, outer=${outer})`, async ({ page, context }, testInfo) => {
        const cdp = await context.newCDPSession(page);
        await rotate(cdp, 90, nativeDuo, outer);
        await openApp(page, nativeDuo, language);
        await page.getByText(variant, { exact: true }).click();
        await page.locator('#start-game-btn').click();

        const cell = page.locator('.sudoku-cell:not(.sudoku-cell--given)').first();
        await cell.click();
        await page.locator('.numpad-btn:not(:disabled)').first().click();
        await page.locator('#notes-btn').click();
        await expect(page.locator('#auto-notes-btn')).toBeVisible();
        const puzzle = await page.getByRole('grid').innerText();

        for (const angle of [90, 270] as const) {
            if (angle === 270) {
                await rotate(cdp, 0, nativeDuo, outer);
                await expect(page.locator('#sudoku-app')).not.toHaveAttribute('data-stacked-layout', 'true');
                await rotate(cdp, angle, nativeDuo, outer);
            }
            await expect(page.locator('#notes-btn')).toHaveAttribute('aria-pressed', 'true');
            expect(await page.getByRole('grid').innerText()).toBe(puzzle);
            await assertGameplayFits(page, !nativeDuo);

            await page.locator('#restart-btn').click();
            const notice = page.getByRole('alertdialog');
            await expect(notice).toBeVisible();
            await assertGameplayFits(page, !nativeDuo);
            await capture(page, testInfo, `controls-and-notice-${angle}`);
            await page.locator('#game-help-btn').click();
            await expect(page.getByRole('dialog')).toBeVisible();
            await expect(notice).toBeVisible();
            await assertGameplayFits(page, !nativeDuo);
            await capture(page, testInfo, `guide-and-notice-${angle}`);
            await page.locator('#help-dialog .dialog-card__close').click();
            await notice.locator('.confirm-banner__btn--cancel').click();
            expect(await page.getByRole('grid').innerText()).toBe(puzzle);
        }
    });
}

test('Duo setup, settings, Watch and legal pages keep navigation and scrolling below the artwork', async ({ page, context }, testInfo) => {
    const cdp = await context.newCDPSession(page);
    await rotate(cdp, 270, false);
    await openApp(page, false);

    async function checkScreen() {
        await assertPanes(page, '.landscape-artwork', '.landscape-screen__pane', true);
        const nav = await page.locator('.bottom-nav').boundingBox();
        const content = await page.locator('.landscape-screen__content').boundingBox();
        const pane = await page.locator('.landscape-screen__pane').boundingBox();
        expect(nav!.y).toBeGreaterThanOrEqual(344);
        expect(nav!.y).toBeCloseTo(content!.y + content!.height, 0);
        expect(nav!.x).toBeCloseTo(pane!.x, 0);
        expect(nav!.width).toBeCloseTo(pane!.width, 0);
        expect(content!.width).toBeCloseTo(pane!.width, 0);
        expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(669);
    }

    await checkScreen();
    await capture(page, testInfo, 'setup');
    await page.locator('#nav-settings').click();
    await checkScreen();
    const content = page.locator('.landscape-screen__content');
    expect(await content.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await content.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await page.locator('#settings-guide-btn').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await checkScreen();
    await capture(page, testInfo, 'settings-guide');
    await page.keyboard.press('Escape');
    await page.locator('#nav-watch').click();
    await checkScreen();
    await page.locator('#nav-play').click();
    await page.locator('#privacy-link').click();
    await checkScreen();
    await capture(page, testInfo, 'privacy');
});
