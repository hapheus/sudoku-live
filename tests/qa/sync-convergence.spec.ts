import { test, expect } from '@playwright/test';

test.describe('isolated broker convergence', () => {
    test.skip(!process.env.SYNC_E2E, 'Requires the dedicated isolated broker on port 17881');
    for (const cells of [36, 81]) {
        test(`concurrent edits, snapshots, rematches and exhausted history (${cells})`, async ({ page }) => {
            await page.goto('/');
            await page.evaluate(async cells => {
                const clientModule = '/src/services/online-game-client.js';
                const routerModule = '/src/services/remote-event-router.js';
                const engineModule = '/src/domain/sudoku-engine.js';
                const { OnlineGameClient } = await import(clientModule);
                const { createRemoteEventRouter } = await import(routerModule);
                const { hydrateGameState, applyRemoteCellPatch, serializeGameState } = await import(engineModule);
                const shiftsModule = '/src/domain/sudoku-shifts.js';
                const { shiftRow, shiftCol } = await import(shiftsModule);
                const room = `convergence-${cells}-${Date.now()}`;
                const raw = { variant: cells === 36 ? '2x3' : '3x3', board: Array(cells).fill(0),
                    givens: Array(cells).fill(false), notes: Array.from({ length: cells }, () => []),
                    cellOwners: Array(cells).fill(null), status: 'in_progress', elapsedSeconds: 0 };
                const connect = (role: string, index: number) => {
                    const client = new OnlineGameClient({ wsConfig: { host: '127.0.0.1', port: 17881, scheme: 'http' } });
                    const accept = client.acceptPublication.bind(client);
                    client.acceptPublication = (publication: any, ...args: any[]) => client.dropPeerEdits && publication.data?.type === 'cell-update' ? false : accept(publication, ...args);
                    client.clientId = `test-player-${index}-${Date.now()}`;
                    const stateRef = { current: { gameState: hydrateGameState(raw), mode: 'online', myRole: role, isSpectating: role === 'spectator' } };
                    const context = new Proxy({ stateRef, onlineClientRef: { current: client } }, {
                        get: (target: any, key: string) => key in target ? target[key] : () => {},
                    });
                    const router = createRemoteEventRouter(context);
                    const peer = { client, stateRef, events: [], published: [] };
                    client.joinGameChannel(room, { role, joinPolicy: 'auto', onEvent: (type: string, data: any) => {
                        peer.events.push(data.eventId); router(type, data);
                    } });
                    const publish = client.gameChannel.publish.bind(client.gameChannel);
                    client.gameChannel.publish = (packet: any) => { peer.published.push(packet); return publish(packet); };
                    peer.dispatch = (type: string, data: any) => { peer.events.push(data.eventId); router(type, data); };
                    return peer;
                };
                const peers = ['host', 'guest', 'spectator'].map(connect);
                (window as any).__convergence = { peers, raw, hydrateGameState, applyRemoteCellPatch, connect, shiftRow, shiftCol, serializeGameState, room,
                    send: async (index: number, type: string, data: any) => {
                        const peer = peers[index];
                        if (type === 'cell-update') peer.stateRef.current.gameState = applyRemoteCellPatch(peer.stateRef.current.gameState, data);
                        if (data.gameState) peer.stateRef.current.gameState = hydrateGameState(data.gameState);
                        await peer.client.broadcastGameEvent(room, type, data);
                    } };
            }, cells);
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.map((p: any) => p.client.getGameMembers()?.length))).toEqual([3, 3, 3]);
            await page.evaluate(async () => { const s = (window as any).__convergence; await s.send(0, 'init', { gameState: s.raw }); });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers[1].client.stateRecovery.vector())).not.toEqual({});
            await page.evaluate(async () => { const s = (window as any).__convergence;
                await s.send(0, 'new-puzzle-accept', { gameState: s.raw, eventId: 'seed-generation' }); });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.map((p: any) => p.client.stateRecovery.generation()))).toEqual(['seed-generation', 'seed-generation', 'seed-generation']);
            await page.evaluate(async () => {
                const s = (window as any).__convergence;
                await Promise.all([s.send(0, 'cell-update', { index: 0, value: 1, owner: 'host', eventId: 'host-edit' }),
                    s.send(1, 'cell-update', { index: 0, value: 2, owner: 'guest', eventId: 'guest-edit' })]);
            });
            const winner = await page.evaluate(() => {
                const packets = (window as any).__convergence.peers.flatMap((p: any) => p.published)
                    .filter((p: any) => ['host-edit', 'guest-edit'].includes(p.data.eventId));
                packets.sort((a: any, b: any) => a.data.stateClock - b.data.stateClock || (a.data.stateActor > b.data.stateActor ? 1 : -1));
                return packets.at(-1).data.value;
            });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.map((p: any) => p.stateRef.current.gameState.board[0]))).toEqual([winner, winner, winner]);
            await page.evaluate(async () => {
                const s = (window as any).__convergence;
                const first = s.serializeGameState(s.shiftRow(s.peers[0].stateRef.current.gameState, 0, 1));
                const second = s.serializeGameState(s.shiftCol(s.peers[1].stateRef.current.gameState, 0, -1));
                await Promise.all([s.send(0, 'sync', { gameState: first, eventId: 'host-sync' }),
                    s.send(1, 'sync', { gameState: second, eventId: 'guest-sync' })]);
            });
            await expect.poll(() => page.evaluate(() => new Set((window as any).__convergence.peers.map((p: any) => JSON.stringify(p.stateRef.current.gameState.board))).size)).toBe(1);
            await page.evaluate(async () => {
                const s = (window as any).__convergence;
                await Promise.all([s.send(0, 'cell-update', { index: 7, value: 2, notes: [], owner: 'host' }),
                    s.send(1, 'cell-update', { index: 7, value: null, notes: [1, 3] })]);
            });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.map((p: any) => ({
                value: p.stateRef.current.gameState.board[7], notes: p.stateRef.current.gameState.notes[7],
            })))).toEqual([{ value: 2, notes: [] }, { value: 2, notes: [] }, { value: 2, notes: [] }]);
            await page.evaluate(async () => {
                const s = (window as any).__convergence;
                const left = structuredClone(s.raw); left.board[0] = 1;
                const right = structuredClone(s.raw); right.board[0] = 2;
                await Promise.all([s.send(0, 'new-puzzle-accept', { gameState: left, eventId: 'concurrent-rematch-host' }),
                    s.send(1, 'new-puzzle-accept', { gameState: right, eventId: 'concurrent-rematch-guest' })]);
            });
            await expect.poll(() => page.evaluate(() => new Set((window as any).__convergence.peers.map((p: any) => p.client.stateRecovery.generation())).size)).toBe(1);
            await expect.poll(() => page.evaluate(() => new Set((window as any).__convergence.peers.map((p: any) => JSON.stringify(p.stateRef.current.gameState.board))).size)).toBe(1);
            await page.evaluate(async () => { const s = (window as any).__convergence;
                await s.send(0, 'cell-update', { index: 8, value: null, notes: [1, 2] });
            });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.map((p: any) => p.stateRef.current.gameState.notes[8]))).toEqual([[1, 2], [1, 2], [1, 2]]);
            await page.evaluate(async () => { const s = (window as any).__convergence; await s.send(1, 'cell-update', { index: 8, value: null, notes: [] }); });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.map((p: any) => p.stateRef.current.gameState.notes[8]))).toEqual([[], [], []]);
            await page.evaluate(async () => { const s = (window as any).__convergence; await s.send(0, 'cell-update', { index: 9, value: 1, notes: [], owner: 'host' }); });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.map((p: any) => p.stateRef.current.gameState.cellOwners[9]))).toEqual(['host', 'host', 'host']);
            await page.evaluate(async () => { const s = (window as any).__convergence; await s.send(1, 'cell-update', { index: 9, value: 1, notes: [], owner: 'guest' }); });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.map((p: any) => p.stateRef.current.gameState.cellOwners[9]))).toEqual(['guest', 'guest', 'guest']);
            // Lose both directions of delta delivery, then exhaust the actual broker history.
            await page.evaluate(async () => { const s = (window as any).__convergence;
                s.peers[0].client.dropPeerEdits = true; s.peers[1].client.dropPeerEdits = true;
                await Promise.all([s.send(0, 'cell-update', { index: 10, value: 3, notes: [], owner: 'host', eventId: 'partition-host' }),
                    s.send(1, 'cell-update', { index: 11, value: 4, notes: [], owner: 'guest', eventId: 'partition-guest' })]);
                s.peers[0].client.suspend(); s.peers[1].client.suspend();
                for (let i = 0; i < 30; i++) await s.send(2, 'reaction', { emoji: '🔥' });
                const history = await s.peers[2].client.gameChannel.history({ limit: 25 });
                if (history.publications.some((p: any) => ['partition-host', 'partition-guest'].includes(p.data.data?.eventId))) throw new Error('History did not exhaust');
                s.peers[0].client.dropPeerEdits = false; s.peers[1].client.dropPeerEdits = false;
                s.peers[0].client.resume(); s.peers[1].client.resume();
            });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.map((p: any) => p.client.getGameMembers()?.length))).toEqual([3, 3, 3]);
            await page.evaluate(() => { const p = (window as any).__convergence.peers[0]; p.client.sendGamePing({ gameState: p.stateRef.current.gameState }); });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers[1].stateRef.current.gameState.board[10])).toBe(3);
            await page.evaluate(() => { const p = (window as any).__convergence.peers[1]; p.client.sendGamePing({ gameState: p.stateRef.current.gameState }); });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.map((p: any) => [p.stateRef.current.gameState.board[10], p.stateRef.current.gameState.board[11]]))).toEqual([[3, 4], [3, 4], [3, 4]]);
            // A rejected publication is retried with its original ID after real resubscription.
            await page.evaluate(async () => { const s = (window as any).__convergence; const host = s.peers[0];
                const publish = host.client.gameChannel.publish.bind(host.client.gameChannel); let failed = false;
                host.client.gameChannel.publish = (packet: any) => {
                    if (!failed && packet.data.eventId === 'queued-edit') { failed = true; return Promise.reject(new Error('Injected lost publish')); }
                    return publish(packet);
                };
                await s.send(0, 'cell-update', { index: 12, value: 5, notes: [], owner: 'host', eventId: 'queued-edit' });
                if (host.client.pendingMutations.size !== 1) throw new Error('Edit was not queued');
                host.client.suspend(); host.client.resume();
            });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.map((p: any) => p.stateRef.current.gameState.board[12]))).toEqual([5, 5, 5]);
            expect(await page.evaluate(() => (window as any).__convergence.peers[2].events.filter((id: string) => id === 'queued-edit').length)).toBe(1);
            // Suspend a viewer long enough to evict the rematch from the 25-entry history.
            await page.evaluate(() => (window as any).__convergence.peers[2].client.suspend());
            await page.evaluate(async () => {
                const s = (window as any).__convergence;
                await s.send(0, 'new-puzzle-accept', { gameState: s.raw, eventId: 'fresh-generation' });
                await s.send(0, 'cell-update', { index: 1, value: 4, notes: [], owner: 'host' });
                for (let i = 0; i < 30; i++) await s.send(0, 'reaction', { emoji: '🔥' });
            });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers[1].client.stateRecovery.generation())).toBe('fresh-generation');
            await page.evaluate(() => (window as any).__convergence.peers[2].client.resume());
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers[2].client.getGameMembers()?.length)).toBe(3);
            await page.evaluate(() => { const p = (window as any).__convergence.peers[0]; p.client.sendGamePing({ gameState: p.stateRef.current.gameState }); });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.map((p: any) => p.client.stateRecovery.generation()))).toEqual(['fresh-generation', 'fresh-generation', 'fresh-generation']);
            await expect.poll(() => page.evaluate(() => new Set((window as any).__convergence.peers.map((p: any) => JSON.stringify(p.stateRef.current.gameState.board))).size)).toBe(1);
            await page.evaluate(() => { const s = (window as any).__convergence; s.peers.push(s.connect('spectator', 3)); });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers[3].client.getGameMembers()?.length)).toBe(4);
            await page.evaluate(() => { const p = (window as any).__convergence.peers[0]; p.client.sendGamePing({ gameState: p.stateRef.current.gameState }); });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.map((p: any) => p.stateRef.current.gameState.board[1]))).toEqual([4, 4, 4, 4]);
            await page.evaluate(async () => { const s = (window as any).__convergence; const host = s.peers[0];
                const original = host.published.find((p: any) => p.data.eventId === 'seed-generation').data;
                const stale = { ...original, eventId: 'delayed-old-snapshot', seq: ++host.client.seqCounter };
                await host.client.gameChannel.publish({ type: 'sync', data: stale });
                const staleEdit = host.client.buildOutgoingEnvelope({ index: 15, value: 6, notes: [], owner: 'host', eventId: 'delayed-old-edit' });
                staleEdit.puzzleGeneration = 'seed-generation'; staleEdit.puzzleRevision = original.puzzleRevision;
                await host.client.gameChannel.publish({ type: 'cell-update', data: staleEdit });
                await s.send(0, 'reaction', { emoji: '🔥', eventId: 'after-stale-generation' });
            });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.slice(1).every((p: any) => p.events.includes('after-stale-generation')))).toBe(true);
            expect(await page.evaluate(() => (window as any).__convergence.peers.map((p: any) => [p.stateRef.current.gameState.board[1], p.stateRef.current.gameState.board[15]]))).toEqual([[4, 0], [4, 0], [4, 0], [4, 0]]);
            await page.evaluate(() => (window as any).__convergence.peers[0].client.disconnect());
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers[1].client.getGameMembers()?.length)).toBe(3);
            await page.evaluate(() => { const s = (window as any).__convergence; const guest = s.peers[1];
                guest.stateRef.current.myRole = 'host'; guest.stateRef.current.mode = 'solo';
                guest.client.joinGameChannel(s.room, { role: 'host', gameMode: 'solo', joinPolicy: 'auto', onEvent: guest.dispatch }); });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers[2].client.getGameMembers()?.some((p: any) => p.role === 'host'))).toBe(true);
            await page.evaluate(async () => { const s = (window as any).__convergence; await s.send(1, 'cell-update', { index: 2, value: 5, notes: [], owner: 'host' }); });
            await expect.poll(() => page.evaluate(() => (window as any).__convergence.peers.slice(1).map((p: any) => p.stateRef.current.gameState.board[2]))).toEqual([5, 5, 5]);
            await page.evaluate(() => (window as any).__convergence.peers.forEach((p: any) => p.client.disconnect()));
        });
    }
});
