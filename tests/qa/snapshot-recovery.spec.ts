import { expect, test } from '@playwright/test';

test.describe('causal snapshot recovery on the isolated broker', () => {
    test.skip(!process.env.CENTRIFUGO_E2E, 'Requires the isolated local broker on port 8081');
    for (const cells of [36, 81]) {
        test(`recovers missed notes and rejects stale snapshots (${cells} cells)`, async ({ browser }) => {
            const hostContext = await browser.newContext();
            const viewerContext = await browser.newContext();
            const host = await hostContext.newPage();
            const viewer = await viewerContext.newPage();
            const room = `snapshot-${cells}-${Date.now()}`;
            try {
                for (const [page, role] of [[host, 'host'], [viewer, 'spectator']] as const) {
                    await page.goto('/');
                    await page.evaluate(async ({ room, role, cells }) => {
                        const clientPath = '/src/services/online-game-client.js';
                        const routerPath = '/src/services/remote-event-router.js';
                        const enginePath = '/src/domain/sudoku-engine.js';
                        const { OnlineGameClient } = await import(clientPath);
                        const { createRemoteEventRouter } = await import(routerPath);
                        const { hydrateGameState } = await import(enginePath);
                        const raw = {
                            board: Array(cells).fill(0), givens: Array(cells).fill(false),
                            notes: Array.from({ length: cells }, () => []), cellOwners: Array(cells).fill(null),
                            status: 'in_progress', elapsedSeconds: 0, variant: cells === 36 ? '2x3' : '3x3',
                        };
                        raw.board[1] = 1;
                        const stateRef = { current: { gameState: hydrateGameState(raw), myRole: role, isSpectating: role === 'spectator' } };
                        const noop = () => {};
                        const router = createRemoteEventRouter({ stateRef, setGameState: noop, setSelectedIndex: noop, persistSnapshotIfNeeded: noop, triggerFloatingReaction: noop });
                        const client = new OnlineGameClient({ wsConfig: { host: '127.0.0.1', port: 8081, scheme: 'http' } });
                        (window as any).__recovery = { client, stateRef, raw, events: [] };
                        client.joinGameChannel(room, { role, onEvent: (type: string, data: any) => {
                            (window as any).__recovery.events.push(data.eventId);
                            // Simulate a missed application patch; recovery must not rely on elapsed time.
                            if (type !== 'cell-update') router(type, data);
                        } });
                    }, { room, role, cells });
                    await expect.poll(() => page.evaluate(() => (window as any).__recovery.client.getGameMembers()?.length || 0)).toBeGreaterThan(0);
                }
                await expect.poll(() => host.evaluate(() => (window as any).__recovery.client.getGameMembers()?.length)).toBe(2);
                await host.evaluate(async () => {
                    const session = (window as any).__recovery;
                    const { client, raw } = session;
                    await client.broadcastGameEvent(client.currentGameId, 'init', { gameState: raw });
                    session.staleVector = client.stateRecovery.vector();
                    raw.notes[0] = [2, 3];
                    await client.broadcastGameEvent(client.currentGameId, 'cell-update', { index: 0, value: null, notes: [2, 3] });
                    client.sendGamePing({ gameState: raw });
                });
                await expect.poll(() => viewer.evaluate(() => (window as any).__recovery.stateRef.current.gameState.notes[0])).toEqual([2, 3]);
                await host.evaluate(async () => {
                    const { client, raw, staleVector } = (window as any).__recovery;
                    // Higher sender sequence, but a snapshot that predates the accepted note edit.
                    const stale = client.buildOutgoingEnvelope({ gameState: { ...raw, notes: raw.notes.map(() => []) } });
                    stale.stateVector = staleVector;
                    stale.eventId = 'stale-ping';
                    await client.gameChannel.publish({ type: 'ping', data: stale });
                    await client.broadcastGameEvent(client.currentGameId, 'reaction', { emoji: '🔥', eventId: 'delivery-barrier' });
                });
                await expect.poll(() => viewer.evaluate(() => (window as any).__recovery.events.includes('delivery-barrier'))).toBe(true);
                expect(await viewer.evaluate(() => (window as any).__recovery.events.includes('stale-ping'))).toBe(false);
                expect(await viewer.evaluate(() => (window as any).__recovery.stateRef.current.gameState.notes[0])).toEqual([2, 3]);
                await host.evaluate(async () => {
                    const { client, raw } = (window as any).__recovery;
                    raw.notes[0] = [];
                    raw.cellOwners[1] = 'host';
                    await client.broadcastGameEvent(client.currentGameId, 'cell-update', { index: 0, value: null, notes: [] });
                    await client.broadcastGameEvent(client.currentGameId, 'cell-update', { index: 1, value: 1, owner: 'host' });
                    client.sendGamePing({ gameState: raw });
                });
                await expect.poll(() => viewer.evaluate(() => ({
                    notes: (window as any).__recovery.stateRef.current.gameState.notes[0],
                    owner: (window as any).__recovery.stateRef.current.gameState.cellOwners[1],
                    elapsed: (window as any).__recovery.stateRef.current.gameState.elapsedSeconds,
                }))).toEqual({ notes: [], owner: 'host', elapsed: 0 });
            } finally {
                await hostContext.close();
                await viewerContext.close();
            }
        });
    }
});
