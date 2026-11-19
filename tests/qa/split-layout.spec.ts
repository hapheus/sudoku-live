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
        return (!equalWidths || a.width === b.width) && a.right <= b.left;
    }).toBe(true);
    const [a, b] = await readBounds();
    if (equalWidths) expect(a.width).toBe(b.width);
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
    await expect(toolbar.locator('#game-help-btn')).toBeInViewport();
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
            await page.getByText(variant === '2x3' ? '6×6' : '9×9', { exact: true }).click();
            await page.locator('#start-game-btn').click();
            await page.keyboard.press('Escape');
            await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__controls');
            await assertTopToolbar(page);
            await page.screenshot({ path: testInfo.outputPath('landscape-toolbar.png') });
            if (width === 667 && variant === '3x3') {
                await page.setViewportSize({ width, height: 260 });
                const stage = page.locator('.gameplay-stage__controls-content');
                await expect.poll(() => stage.evaluate(element => {
                    element.scrollTop = element.scrollHeight;
                    return element.scrollTop;
                })).toBeGreaterThan(0);
                await assertTopToolbar(page);
                await page.setViewportSize({ width, height });
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
            await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__controls');
            expect(await page.getByRole('grid').innerText()).toBe(board);
        });
    }
}

test('cell tool labels fit individually and retain their accessible names', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await page.addInitScript(() => localStorage.setItem('sudoku_lang', 'de'));
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
    await page.locator('#start-game-btn').click();
    const toolbar = page.getByRole('toolbar', { name: 'Cell tools' });
    const buttons = toolbar.getByRole('button');
    const visibleLabels = () => buttons.evaluateAll(tools => tools.map(tool => {
        const content = tool.querySelector('.tool-btn__content')!;
        const bounds = content.getBoundingClientRect();
        const label = content.querySelector('span')!.getBoundingClientRect();
        const icon = content.querySelector('svg')!.getBoundingClientRect();
        const gap = parseFloat(getComputedStyle(content).columnGap);
        const fits = icon.width + gap + label.width <= bounds.width + 0.02;
        const visible = label.top < bounds.bottom;
        if (visible !== fits || icon.top < bounds.top || icon.bottom > bounds.bottom) {
            throw new Error(`Incorrect compact layout for ${tool.id}`);
        }
        return visible;
    }));

    for (const name of ['Zurück', 'Löschen', 'Notizen', 'Hinweis']) {
        await expect(toolbar.getByRole('button', { name, exact: true })).toBeVisible();
    }
    expect(await visibleLabels()).toEqual([false, false, false, false]);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(visibleLabels).toEqual([true, true, true, true]);
    await toolbar.getByRole('button', { name: 'Notizen', exact: true }).click();
    await expect(toolbar.getByRole('button', { name: 'Notizen an', exact: true })).toHaveAttribute('aria-pressed', 'true');

    await page.setViewportSize({ width: 320, height: 640 });
    await expect.poll(async () => {
        const labels = await visibleLabels();
        return labels.some(Boolean) && !labels[2];
    }).toBe(true);
});

test('setup, settings, watch and legal keep artwork left and all content right', async ({ page }) => {
    await page.setViewportSize({ width: 812, height: 375 });
    await page.addInitScript(() => localStorage.setItem('sudoku_lang', 'en'));
    await page.routeWebSocket(/.*/, socket => socket.close());
    await page.goto('/');
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__pane');
    await page.locator('#nav-settings').click();
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__pane');
    await page.locator('#nav-watch').click();
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__pane');
    await page.locator('#nav-play').click();
    await page.locator('#privacy-link').click();
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__pane');
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
    expect(artwork.x + artwork.width).toBeLessThanOrEqual(550);
    expect((await page.locator('.landscape-screen__pane').boundingBox())!.x).toBeGreaterThanOrEqual(580);
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__pane');
    await page.locator('#nav-settings').click();
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__pane');
    await page.locator('#settings-guide-btn').click();
    const dialog = (await page.getByRole('dialog').boundingBox())!;
    expect(dialog.x).toBeGreaterThanOrEqual(580);
    await page.keyboard.press('Escape');
    await page.locator('#nav-watch').click();
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__pane');
    await page.locator('#nav-play').click();
    await page.locator('#privacy-link').click();
    await assertRegions(page, '.landscape-artwork', '.landscape-screen__pane');
    await page.locator('#legal-back-btn').click();
    await page.locator('#start-game-btn').click();
    await page.keyboard.press('Escape');
    await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__controls');
    const board = (await page.locator('.gameplay-stage__board').boundingBox())!;
    const controls = (await page.locator('.gameplay-stage__controls').boundingBox())!;
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
            await page.getByText(variant === '2x3' ? '6×6' : '9×9', { exact: true }).click();
            await page.locator('#start-game-btn').click();
            await page.keyboard.press('Escape');
            await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__controls');
            const left = (await page.locator('.gameplay-stage__board').boundingBox())!;
            await assertTopToolbar(page);
            const right = (await page.locator('.gameplay-stage__controls').boundingBox())!;
            expect(left.x + left.width).toBeLessThanOrEqual(951 / 2);
            expect(right.x).toBeGreaterThanOrEqual(951 / 2);
            expect(Math.abs((left.x + left.width + right.x) / 2 - 951 / 2)).toBeLessThanOrEqual(1);
            const puzzle = await page.getByRole('grid').innerText();
            await page.setViewportSize({ width: 466, height: 678 });
            await page.setViewportSize({ width: 951, height: 669 });
            await assertRegions(page, '.gameplay-stage__board', '.gameplay-stage__controls');
            expect(await page.getByRole('grid').innerText()).toBe(puzzle);
            await testInfo.attach('duo-gameplay', { body: await page.screenshot(), contentType: 'image/png' });
        });
    }
}

for (const language of ['en', 'de']) {
    const cases: Array<[number, string]> = [[320, 'system-ui'], [320, 'Arial'], [320, 'Verdana'], [360, 'system-ui'], [390, 'system-ui'], [466, 'system-ui']];
    for (const [width, font] of cases) {
        test(`settings dropdowns fit compact widths (${language}, ${width}px, ${font})`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height: 678 });
            await page.addInitScript(language => localStorage.setItem('sudoku_lang', language), language);
            await page.routeWebSocket(/.*/, socket => socket.close());
            await page.goto('/');
            await page.addStyleTag({ content: `html { font-family: ${font}, sans-serif; }` });
            await page.locator('#nav-settings').click();
            const appearance = page.locator('#sudoku-theme');
            const joins = page.locator('#sudoku-join-policy');
            await expect(joins.locator('option')).toHaveText(language === 'en'
                ? ['Off', 'Allow', 'Auto-accept']
                : ['Aus', 'Erlauben', 'Automatisch annehmen']);
            for (const select of [appearance, joins]) {
                await expect(select).toBeVisible();
                expect(await select.evaluate(element => {
                    const bounds = element.getBoundingClientRect();
                    const group = element.parentElement!.getBoundingClientRect();
                    return bounds.left >= group.left && bounds.right <= group.right && bounds.height >= 44;
                })).toBe(true);
            }
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            await joins.selectOption('auto');
            await expect(joins).toHaveValue('auto');
            await testInfo.attach('compact-join-settings', { body: await page.locator('#settings-panel').screenshot(), contentType: 'image/png' });
        });
    }
}
