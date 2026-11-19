import { test, expect } from '@playwright/test';

test('denied storage getters preserve startup, offline play and Settings', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        for (const property of ['localStorage', 'sessionStorage']) {
            Object.defineProperty(window, property, {
                configurable: true,
                get() { throw new DOMException('Access denied', 'SecurityError'); },
            });
        }
    });
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
    await page.locator('#start-game-btn').click();
    await page.keyboard.press('Escape');
    const index = await page.getByRole('gridcell').filter({ hasText: /^$/ }).first().getAttribute('data-index');
    const blank = page.locator(`[role=gridcell][data-index="${index}"]`);
    await blank.click();
    await page.keyboard.press('1');
    await expect(blank).toHaveText('1');
    await page.locator('#back-to-setup-btn').click();
    await page.locator('#nav-settings').click();
    await expect(page.locator('#settings-panel')).toBeVisible();
    await page.locator('#player-name-input').fill('OfflinePlayer');
    await page.locator('#nav-play').click();
    await page.locator('#resume-game-btn').click();
    await expect(blank).toHaveText('1');
    await expect(page.getByRole('grid')).toBeVisible();
    expect(errors).toEqual([]);
});
