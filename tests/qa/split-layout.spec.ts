import { test, expect, type Page } from '@playwright/test';

async function assertRegions(page: Page, primary: string, secondary: string, equalWidths = true) {
    const left = page.locator(primary);
    const right = page.locator(secondary);
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();
    // A resize can finish between two protocol round trips; sample both regions
    // in one browser task and wait for the requested side-by-side layout.
    const readBounds = () => page.evaluate(([primary, secondary]) => [
        document.querySelector(primary)!.getBoundingClientRect().toJSON(),
        document.querySelector(secondary)!.getBoundingClientRect().toJSON(),
    ], [primary, secondary]);
    await expect.poll(async () => {
        const [a, b] = await readBounds();
        return (!equalWidths || Math.abs(a.width - b.width) <= 1) && a.right <= b.left;
    }).toBe(true);
    const [a, b] = await readBounds();
    if (equalWidths) expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
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

async function assertTopToolbar(page: Page) {
    const toolbar = page.locator('.gameplay-stage__toolbar');
    const stage = page.locator('.gameplay-stage');
    await expect(toolbar.getByRole('button', { name: 'Open Guide' })).toBeInViewport();
    const [bar, content] = await Promise.all([toolbar.boundingBox(), stage.boundingBox()]);
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(content!.y + 1);
    expect(bar!.y).toBeCloseTo(12, 0);
}

for (const variant of ['3x3', '2x3']) {
    for (const [width, height] of [[667, 375], [812, 375], [844, 390], [1024, 768], [1440, 900]]) {
        test(`equal gameplay regions contain controls through resize ${variant} ${width}x${height}`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height });
            await page.addInitScript(() => localStorage.setItem('sudoku_lang', 'en'));
            await page.routeWebSocket(/.*/, socket => socket.close());
            await page.goto('/');
            await page.getByText(variant === '2x3' ? '2×3 (6×6)' : '3×3 (9×9)', { exact: true }).click();
            await page.locator('#start-game-btn').click();
            await page.keyboard.press('Escape');
            await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__side');
            await assertTopToolbar(page);
            await page.screenshot({ path: testInfo.outputPath('landscape-toolbar.png') });
            if (width === 667 && variant === '3x3') {
                const stage = page.locator('.gameplay-stage');
                await stage.evaluate(element => { element.scrollTop = element.scrollHeight; });
                expect(await stage.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
                await assertTopToolbar(page);
            }
            await page.locator('#game-help-btn').click();
            await expect(page.getByRole('dialog')).toBeVisible();
            await assertTopToolbar(page);
            await page.screenshot({ path: testInfo.outputPath('landscape-guide-toolbar.png') });
            await page.keyboard.press('Escape');
            const board = await page.getByRole('grid').innerText();
            await page.setViewportSize({ width: height, height: width });
            const toolbar = page.locator('.gameplay-stage__toolbar');
            await expect(toolbar.getByRole('button', { name: 'Open Guide' })).toBeInViewport();
            await expect.poll(async () => (await toolbar.boundingBox())!.y).toBeGreaterThan(width - 80);
            await page.setViewportSize({ width, height });
            await assertTopToolbar(page);
            await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__side');
            expect(await page.getByRole('grid').innerText()).toBe(board);
        });
    }
}

test('setup, settings, watch and legal keep artwork left and all content right', async ({ page }) => {
    await page.setViewportSize({ width: 812, height: 375 });
    await page.addInitScript(() => localStorage.setItem('sudoku_lang', 'en'));
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__content', false);
    await page.locator('#nav-settings').click();
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__content', false);
    await page.locator('#nav-watch').click();
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__content', false);
    await page.locator('#nav-play').click();
    await page.locator('#privacy-link').click();
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__content', false);
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
    const artwork = (await page.locator('.landscape-artwork').boundingBox())!;
    expect(artwork).toEqual({ x: 0, y: 0, width: 550, height: 800 });
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__content', false);
    await page.locator('#nav-settings').click();
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__content', false);
    await page.locator('#settings-guide-btn').click();
    const dialog = (await page.getByRole('dialog').boundingBox())!;
    expect(dialog.x).toBeGreaterThanOrEqual(580);
    await page.keyboard.press('Escape');
    await page.locator('#nav-watch').click();
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__content', false);
    await page.locator('#nav-play').click();
    await page.locator('#privacy-link').click();
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__content', false);
    await page.locator('#legal-back-btn').click();
    await page.locator('#start-game-btn').click();
    await page.keyboard.press('Escape');
    await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__side');
    const board = (await page.locator('.gameplay-stage__board').boundingBox())!;
    const controls = (await page.locator('.gameplay-stage__side').boundingBox())!;
    expect(board.x + board.width).toBeLessThanOrEqual(550);
    expect(controls.x).toBeGreaterThanOrEqual(580);
});

for (const variant of ['3x3', '2x3']) {
    for (const insetSide of ['left', 'right']) {
        test(`Duo gameplay stays on its own side of the fold with a ${insetSide} safe area (${variant})`, async ({ page, context }, testInfo) => {
            await page.setViewportSize({ width: 951, height: 669 });
            const cdp = await context.newCDPSession(page);
            await cdp.send('Emulation.setSafeAreaInsetsOverride', {
                insets: { top: 0, bottom: 21, left: insetSide === 'left' ? 62 : 0, right: insetSide === 'right' ? 62 : 0 },
            });
            await page.addInitScript(() => localStorage.setItem('sudoku_lang', 'en'));
            await page.routeWebSocket(/.*/, socket => socket.close());
            await page.goto('/');
            await page.getByText(variant === '2x3' ? '2×3 (6×6)' : '3×3 (9×9)', { exact: true }).click();
            await page.locator('#start-game-btn').click();
            await page.keyboard.press('Escape');
            await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__side');
            const left = (await page.locator('.gameplay-stage__board').boundingBox())!;
            await assertTopToolbar(page);
            const right = (await page.locator('.gameplay-stage__side').boundingBox())!;
            expect(left.x + left.width).toBeLessThanOrEqual(951 / 2);
            expect(right.x).toBeGreaterThanOrEqual(951 / 2);
            await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__status > .status-banner');
            expect(Math.abs((left.x + left.width + right.x) / 2 - 951 / 2)).toBeLessThanOrEqual(1);
            const puzzle = await page.getByRole('grid').innerText();
            await page.setViewportSize({ width: 466, height: 678 });
            await page.setViewportSize({ width: 951, height: 669 });
            await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__side');
            expect(await page.getByRole('grid').innerText()).toBe(puzzle);
            await testInfo.attach('duo-gameplay', { body: await page.screenshot(), contentType: 'image/png' });
        });
    }
}

for (const language of ['en', 'de']) {
    const cases: Array<[number, string]> = [[320, 'system-ui'], [320, 'Arial'], [320, 'Verdana'], [360, 'system-ui'], [390, 'system-ui'], [466, 'system-ui']];
    for (const [width, font] of cases) {
        test(`compact join legends stay on one line and align (${language}, ${width}px, ${font})`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height: 678 });
            await page.addInitScript(language => localStorage.setItem('sudoku_lang', language), language);
            await page.routeWebSocket(/.*/, socket => socket.close());
            await page.goto('/');
            await page.addStyleTag({ content: `html { font-family: ${font}, sans-serif; }` });
            await page.locator('#nav-settings').click();
            const fields = page.locator('.settings-fieldset').filter({ has: page.locator('input[name^="sudoku-joins-"]') });
            await expect(fields).toHaveCount(2);
            const measurements = await fields.evaluateAll(elements => elements.map(element => {
                const legend = element.querySelector('.settings-fieldset__legend-inner > span')!;
                const text = document.createRange();
                text.selectNodeContents(legend);
                const rects = Array.from(text.getClientRects());
                const bounds = element.getBoundingClientRect();
                return { lines: rects.length, within: rects.every(rect => rect.left >= bounds.left && rect.right <= bounds.right),
                    optionsY: element.querySelector('[role="radiogroup"]')!.getBoundingClientRect().y };
            }));
            expect(measurements.map(value => value.lines)).toEqual([1, 1]);
            expect(measurements.every(value => value.within)).toBe(true);
            expect(Math.abs(measurements[0].optionsY - measurements[1].optionsY)).toBeLessThanOrEqual(1);
            await testInfo.attach('compact-join-settings', { body: await page.locator('#settings-panel').screenshot(), contentType: 'image/png' });
        });
    }
}
