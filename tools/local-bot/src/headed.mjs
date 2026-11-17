export async function createHeadedView(config, { headless = false } = {}) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext();
    // Set before the app boots; use the same backend as the worker, including production WSS.
    await context.addInitScript(wsUrl => {
      Object.defineProperty(window, '__APP_CONFIG__', {
        configurable: false, get: () => ({ wsUrl }), set: () => {},
      });
    }, config.wsUrl);
    const pages = new Map();
    return {
      async update(sessions) {
        for (const [id, page] of pages) {
          if (!sessions.some(session => session.id === id)) { await page.close(); pages.delete(id); }
        }
        for (const session of sessions) {
          if (pages.has(session.id)) continue;
          const page = await context.newPage();
          pages.set(session.id, page);
          const target = new URL(config.appUrl);
          target.searchParams.set('game', session.id);
          target.searchParams.set('watch', '1');
          const response = await page.goto(target.href);
          if (!response?.ok()) throw new Error('Headed app URL failed to load');
          await page.locator('.sudoku-board').waitFor({ timeout: 20_000 });
        }
      },
      close: () => browser.close(),
      onClose: callback => browser.on('disconnected', callback),
    };
  } catch (error) { await browser.close(); throw error; }
}
