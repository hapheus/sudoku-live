import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openApp(page: Page, theme = 'dark') {
    await page.addInitScript(({ theme }) => {
        localStorage.setItem('sudoku_theme', theme);
        localStorage.setItem('sudoku_lang', 'en');
        localStorage.setItem('sudoku_player_name', 'LayoutPlayer');
    }, { theme });
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
}

test('player name validates hyphens and underscores without browser pattern errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    await openApp(page);
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Player Name' });
    await input.fill('Nova-Player_7');
    expect(await input.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
    await input.fill('Invalid!');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(await input.evaluate((element: HTMLInputElement) => element.validity.patternMismatch)).toBe(true);
    expect(errors.filter(error => /pattern|regular expression|SyntaxError/i.test(error))).toEqual([]);
});

const viewports = [[360, 640], [390, 844], [768, 1024], [1280, 800], [1440, 900], [812, 375]];
for (const theme of ['dark', 'light']) {
    for (const [width, height] of viewports) {
        test(`settings and shift hint remain usable (${theme} ${width}x${height})`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height });
            await openApp(page, theme);
            await page.getByRole('tab', { name: 'Settings', exact: true }).click();
            const panel = page.locator('#settings-panel');
            if (width > height && height <= 540) {
                const bounds = (await panel.boundingBox())!;
                expect(bounds.width).toBeGreaterThan(width * 0.3);
                expect(bounds.x + bounds.width).toBeLessThanOrEqual(width / 2);
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            const settingsAudit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
            expect(settingsAudit.violations).toEqual([]);
            await expect(panel).toHaveScreenshot(`issue47-settings-${theme}-${width}x${height}.png`, {
                mask: [page.locator('#player-tag-display')],
            });
            await page.getByRole('tab', { name: 'Play', exact: true }).click();
            await page.getByRole('button', { name: 'Play', exact: true }).click();
            await page.keyboard.press('Escape');
            const bar = page.locator('.shift-bar');
            await expect(bar.locator('.shift-bar__hint')).toBeVisible();
            await bar.scrollIntoViewIfNeeded();
            const { actionsBox, hintBox, buttons } = await bar.evaluate(element => {
                const actions = element.querySelector('.shift-bar__actions')!;
                return {
                    actionsBox: actions.getBoundingClientRect().toJSON(),
                    hintBox: element.querySelector('.shift-bar__label-group')!.getBoundingClientRect().toJSON(),
                    buttons: Array.from(actions.querySelectorAll('button'), button => button.getBoundingClientRect().toJSON()),
                };
            });
            expect(buttons).toHaveLength(4);
            for (const box of buttons) {
                expect(box.width).toBeGreaterThanOrEqual(44);
                expect(box.height).toBeGreaterThanOrEqual(44);
                expect(box.right).toBeLessThanOrEqual(actionsBox.right + 1);
            }
            expect(hintBox.right <= actionsBox.x + 1 || hintBox.bottom <= actionsBox.y + 1).toBe(true);
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
            expect(audit.violations).toEqual([]);
            await bar.scrollIntoViewIfNeeded();
            await expect(bar).toHaveScreenshot(`issue47-shift-${theme}-${width}x${height}.png`);
            await testInfo.attach('shift-hint', { body: await bar.screenshot(), contentType: 'image/png' });
        });
    }
}

test('settings keyboard flow remains reachable at 200% zoom', async ({ page }) => {
    await page.setViewportSize({ width: 812, height: 375 });
    await openApp(page);
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    const input = page.getByRole('textbox', { name: 'Player Name' });
    await input.focus();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Mini-Player_7');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Randomize player name' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(input).not.toHaveValue('Mini-Player_7');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
});
