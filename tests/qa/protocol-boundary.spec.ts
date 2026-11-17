import { test, expect, type Page } from '@playwright/test';

test.describe('isolated broker publication contracts', () => {
    test.skip(!process.env.CENTRIFUGO_E2E, 'Requires the isolated local Centrifugo on port 8081');
    for (const cells of [36, 81]) {
        test(`validates live and history messages before dispatch (${cells} cells)`, async ({ browser }) => {
            const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
            const pages = await Promise.all(contexts.map((context) => context.newPage()));
            const [host, viewer, rogue, late] = pages;
            const room = `contract-${cells}-${Date.now()}`;
            const connect = async (page: Page, role: string) => {
                await page.goto('/');
                await page.evaluate(async ({ room, role }) => {
                    const modulePath = '/src/services/online-game-client.js';
                    const { OnlineGameClient } = await import(modulePath);
                    const state = (window as any).__protocol = { events: [], client: new OnlineGameClient({
                        wsConfig: { host: '127.0.0.1', port: 8081, scheme: 'http' },
                    }) };
                    state.client.joinGameChannel(room, { role, onEvent: (type: string, data: unknown) => state.events.push({ type, data }) });
                }, { room, role });
                await expect.poll(() => page.evaluate(() => (window as any).__protocol.client.getGameMembers()?.length || 0)).toBeGreaterThan(0);
            };
            try {
                await connect(host, 'host');
                await connect(viewer, 'spectator');
                await connect(rogue, 'spectator');
                await expect.poll(() => viewer.evaluate(() => (window as any).__protocol.client.getGameMembers()?.some((m: any) => m.role === 'host'))).toBe(true);
                const state = { board: Array(cells).fill(0), givens: Array(cells).fill(false) };
                await host.evaluate(({ state }) => (window as any).__protocol.client.broadcastGameEvent(
                    (window as any).__protocol.client.currentGameId, 'init', { gameState: state, eventId: 'valid-snapshot' },
                ), { state });
                await expect.poll(() => viewer.evaluate(() => (window as any).__protocol.events.some((e: any) => e.data.eventId === 'valid-snapshot'))).toBe(true);
                // Publish directly to exercise the receiving boundary, bypassing outgoing helpers.
                for (const [page, type, extra] of [
                    [rogue, 'cell-update', { index: 0, value: 1, role: 'host' }],
                    [rogue, 'join-response', { requestId: 'other', requesterId: 'other', accepted: true }],
                    [host, 'sync', { gameState: state, hints: [null], ticTacToe: { bad: true } }],
                ] as const) {
                    await page.evaluate(async ({ type, extra }) => {
                        const client = (window as any).__protocol.client;
                        await client.gameChannel.publish({ type, data: { ...extra, senderId: client.clientId, eventId: `invalid-${type}`, seq: 999_999 } });
                    }, { type, extra });
                }
                await host.evaluate(() => {
                    const client = (window as any).__protocol.client;
                    return client.broadcastGameEvent(client.currentGameId, 'cell-update', { index: 0, value: 2, eventId: 'valid-after-invalid' });
                });
                await expect.poll(() => viewer.evaluate(() => (window as any).__protocol.events.some((e: any) => e.data.eventId === 'valid-after-invalid'))).toBe(true);
                expect(await viewer.evaluate(() => (window as any).__protocol.events.filter((e: any) => e.data.eventId?.startsWith('invalid-')))).toEqual([]);
                await host.evaluate(() => {
                    const client = (window as any).__protocol.client;
                    return client.broadcastGameEvent(client.currentGameId, 'cell-update', { index: 1, value: null, notes: [1, 2], eventId: 'valid-note-only' });
                });
                await expect.poll(() => viewer.evaluate(() => (window as any).__protocol.events.find((e: any) => e.data.eventId === 'valid-note-only')?.data.notes)).toEqual([1, 2]);
                await connect(late, 'spectator');
                await expect.poll(() => late.evaluate(() => (window as any).__protocol.events.map((e: any) => e.data.eventId))).toContain('valid-after-invalid');
                expect(await late.evaluate(() => (window as any).__protocol.events.map((e: any) => e.data.eventId))).toEqual(['valid-snapshot', 'valid-after-invalid', 'valid-note-only']);
            } finally {
                await Promise.all(contexts.map((context) => context.close()));
            }
        });
    }
});
