const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function visible(selector) {
    for (let attempt = 0; attempt < 100; attempt++) {
        const node = document.querySelector(selector);
        if (node?.getBoundingClientRect().width) return node;
        await delay(100);
    }
    throw new Error(`Screen did not show ${selector}`);
}

window.prepareScreenshot = async ({ screen, theme }) => {
    try {
        document.querySelector('#back-to-setup-btn')?.click();
        (await visible('#nav-settings')).click();
        const themeSelect = await visible('#sudoku-theme');
        themeSelect.value = theme;
        themeSelect.dispatchEvent(new Event('change', { bubbles: true }));

        if (screen !== 'settings') {
            (await visible(screen === 'watch' ? '#nav-watch' : '#nav-play')).click();
        }
        if (screen === 'game') {
            (await visible('#resume-game-btn')).click();
            await visible('#sudoku-board .sudoku-cell');
        } else if (screen === 'setup') {
            await visible('#start-game-btn');
        } else if (screen === 'watch') {
            await visible('#watch-directory');
            if (window.screenshotConfig.liveWatch) {
                await visible('#live-games-list [data-watch-id]');
            }
        }

        for (let attempt = 0; document.documentElement.dataset.theme !== theme; attempt++) {
            if (attempt === 30) throw new Error(`Theme did not change to ${theme}`);
            await delay(100);
        }
        await Promise.all([...document.images]
            .filter((image) => image.getBoundingClientRect().width)
            .map((image) => image.decode().catch(() => {})));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return 'ready';
    } catch (error) {
        return error.message;
    }
};
