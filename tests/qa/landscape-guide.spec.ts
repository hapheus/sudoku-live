import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const variant of ['3x3', '2x3']) {
    for (const [width, height] of [[844, 390], [844, 600], [951, 669], [1280, 800]]) {
        test(`guide replaces the right gameplay pane ${variant} ${width}x${height}`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height });
            await page.addInitScript(() => localStorage.setItem('sudoku_lang', 'en'));
            await page.routeWebSocket(/.*/, socket => socket.close());
            await page.goto('/');
            await page.getByText(variant === '2x3' ? '2×3 (6×6)' : '3×3 (9×9)', { exact: true }).click();
            await page.locator('#start-game-btn').click();
            const board = await page.getByRole('grid').innerText();
            const opener = page.locator('#game-help-btn');
            await opener.click();
            const guide = page.getByRole('dialog');
            await expect(guide).toBeVisible();
            await expect(guide).not.toHaveAttribute('aria-modal', 'true');
            await expect(page.locator('.dialog-backdrop')).toHaveCount(0);
            await expect(page.locator('.gameplay-stage__side')).toHaveCount(0);
            await expect(page.locator('.gameplay-stage__status > .status-banner')).toHaveCount(0);
            const left = (await page.locator('.gameplay-stage__board').boundingBox())!;
            const right = (await page.locator('.gameplay-stage__guide').boundingBox())!;
            expect(Math.abs(left.width - right.width)).toBeLessThanOrEqual(1);
            expect(left.x + left.width).toBeLessThanOrEqual(width / 2);
            expect(right.x).toBeGreaterThanOrEqual(width / 2);
            expect(await page.getByRole('grid').innerText()).toBe(board);
            expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
            await testInfo.attach('landscape-guide', { body: await page.screenshot(), contentType: 'image/png' });
            await page.keyboard.press('Escape');
            await expect(guide).toHaveCount(0);
            await expect(opener).toBeFocused();
            await expect(page.locator('.player-controls')).toBeVisible();
            expect(await page.getByRole('grid').innerText()).toBe(board);
            await opener.click();
            await page.setViewportSize({ width: 390, height: 844 });
            await expect(page.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
            await expect(page.locator('.dialog-backdrop')).toBeVisible();
            await page.setViewportSize({ width, height });
            await expect(page.locator('.dialog-backdrop')).toHaveCount(0);
            await expect(page.getByRole('dialog')).toHaveCount(1);
            await page.getByRole('button', { name: 'Close', exact: true }).click();
            await expect(page.locator('.player-controls')).toBeVisible();
            expect(await page.getByRole('grid').innerText()).toBe(board);
        });
    }
}

test('landscape navigation stays right and artwork selection survives navigation and rotation', async ({ page }) => {
    await page.setViewportSize({ width: 951, height: 669 });
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
    await expect(page.locator('.landscape-artwork img')).toBeVisible();
    expect(await page.locator('.landscape-artwork').boundingBox()).toEqual({ x: 0, y: 0, width: 951 / 2, height: 669 });
    await expect(page.locator('.landscape-artwork img')).toHaveCSS('object-fit', 'cover');
    const images = await page.locator('.landscape-artwork img').evaluateAll(elements => elements.map(element => element.getAttribute('src')));
    for (const tab of ['#nav-settings', '#nav-watch', '#nav-play']) {
        await page.locator(tab).click();
        const navigation = (await page.locator('.bottom-nav').boundingBox())!;
        expect(navigation.x).toBeGreaterThanOrEqual(951 / 2);
        const content = (await page.locator('.landscape-screen__content').boundingBox())!;
        expect(content.x).toBeGreaterThanOrEqual(951 / 2);
        expect(await page.locator('.landscape-screen__content').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        await expect.poll(() => page.locator('.landscape-artwork img').evaluateAll(elements => elements.map(element => element.getAttribute('src')))).toEqual(images);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.landscape-artwork')).toBeHidden();
    await page.setViewportSize({ width: 1000, height: 1200 });
    await expect(page.locator('.landscape-artwork')).toBeHidden();
    await page.setViewportSize({ width: 951, height: 669 });
    await expect(page.locator('.landscape-artwork img')).toBeVisible();
    await expect.poll(() => page.locator('.landscape-artwork img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await expect.poll(() => page.locator('.landscape-artwork img').evaluateAll(elements => elements.map(element => element.getAttribute('src')))).toEqual(images);
});

for (const [width, height] of [[844, 390], [951, 669], [1280, 800]]) {
    test(`New Puzzle notices stay at the top of the right gameplay pane ${width}x${height}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        await page.addInitScript(() => localStorage.setItem('sudoku_lang', 'en'));
        await page.routeWebSocket(/.*/, socket => socket.close());
        await page.goto('/');
        await page.locator('#start-game-btn').click();
        await page.locator('.sudoku-cell:not(.sudoku-cell--given)').first().click();
        await page.keyboard.press('1');
        const puzzle = await page.getByRole('grid').innerText();
        const board = (await page.locator('.gameplay-stage__board').boundingBox())!;
        const boardDocumentY = board.y + await page.evaluate(() => scrollY);
        await page.getByRole('button', { name: 'New Puzzle', exact: true }).click();
        const notice = page.getByRole('alertdialog');
        await expect(notice).toBeVisible();
        const bounds = (await notice.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(width / 2);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(bounds.y).toBeLessThanOrEqual(board.y + 1);
        expect(await page.locator('.gameplay-stage__board').boundingBox()).toEqual(board);
        expect(await page.getByRole('grid').innerText()).toBe(puzzle);
        await expect(page.locator('.dialog-backdrop')).toHaveCount(0);
        await testInfo.attach('right-game-notice', { body: await page.screenshot(), contentType: 'image/png' });
        await page.keyboard.press('Escape');
        await expect(notice).toHaveCount(0);
        expect(await page.getByRole('grid').innerText()).toBe(puzzle);
        await page.getByRole('button', { name: 'Notes', exact: true }).click();
        await page.getByRole('button', { name: 'Fill Candidates', exact: true }).click();
        const feedback = page.locator('#action-feedback');
        await expect(feedback).toBeVisible();
        const feedbackBounds = (await feedback.boundingBox())!;
        expect(feedbackBounds.x).toBeGreaterThanOrEqual(width / 2);
        const currentBoard = (await page.locator('.gameplay-stage__board').boundingBox())!;
        expect(feedbackBounds.y).toBeLessThanOrEqual(currentBoard.y + 1);
        // Clicking the lower controls can scroll a compact viewport; the board's
        // document position must remain unchanged by the feedback itself.
        expect({ ...currentBoard, y: currentBoard.y + await page.evaluate(() => scrollY) })
            .toEqual({ ...board, y: boardDocumentY });
    });
}

for (const [width, height] of [[844, 390], [951, 669], [1280, 800]]) {
    test(`Settings guide replaces the right pane and keeps artwork visible ${width}x${height}`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        await page.addInitScript(() => localStorage.setItem('sudoku_lang', 'en'));
        await page.routeWebSocket(/.*/, socket => socket.close());
        await page.goto('/');
        await page.locator('#nav-settings').click();
        const settings = page.locator('#settings-panel');
        const name = page.getByRole('textbox', { name: 'Player Name' });
        await name.fill('GuidePlayer');
        const opener = page.locator('#settings-guide-btn');
        await opener.click();
        const guide = page.getByRole('dialog');
        await expect(guide).toBeVisible();
        await expect(guide).not.toHaveAttribute('aria-modal', 'true');
        await expect(settings).toBeHidden();
        await expect(page.locator('.dialog-backdrop')).toHaveCount(0);
        await expect(page.locator('.landscape-artwork img')).toBeVisible();
        const bounds = (await guide.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(width / 2);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        const nav = (await page.locator('.bottom-nav').boundingBox())!;
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(nav.y);
        expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
        const screenshot = testInfo.outputPath('settings-guide-right.png');
        await page.screenshot({ path: screenshot });
        await testInfo.attach('settings-guide-right', { path: screenshot, contentType: 'image/png' });
        await page.keyboard.press('Escape');
        await expect(guide).toHaveCount(0);
        await expect(settings).toBeVisible();
        await expect(opener).toBeFocused();
        await expect(name).toHaveValue('GuidePlayer');
        await opener.click();
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
        await expect(page.locator('.dialog-backdrop')).toBeVisible();
        await page.setViewportSize({ width, height });
        await expect(page.getByRole('dialog')).toHaveCount(1);
        await expect(page.getByRole('dialog')).not.toHaveAttribute('aria-modal', 'true');
        await expect(page.locator('.dialog-backdrop')).toHaveCount(0);
        await expect(settings).toBeHidden();
        await page.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(settings).toBeVisible();
        await expect(opener).toBeFocused();
        await expect(name).toHaveValue('GuidePlayer');
        await opener.click();
        await page.locator('#nav-watch').click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.locator('.dialog-backdrop')).toHaveCount(0);
        await expect(page.locator('#watch-directory')).toBeVisible();
    });
}
