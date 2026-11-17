import { test, expect, type Page } from '@playwright/test';

const stateOf = (page: Page) => page.evaluate(() => {
    const { client, events, warnings } = (window as any).__session;
    return {
        connected: client.client?.state,
        connection: client.serverClientId,
        members: client.getGameMembers(),
        features: [...client.negotiatedFeatures],
        events: events.map((event: any) => event.data.eventId),
        warnings,
    };
});

async function connect(page: Page, room: string, role: string, legacy = false) {
    await page.goto('/');
    await page.evaluate(async ({ room, role, legacy }) => {
        const path = '/src/services/online-game-client.js';
        const { OnlineGameClient } = await import(path);
        const session = (window as any).__session = {
            client: new OnlineGameClient({ wsConfig: { host: '127.0.0.1', port: 8081, scheme: 'http' } }),
            events: [], warnings: [],
        };
        if (legacy) session.client.protocolMeta = { protocolVersion: 1, minProtocolVersion: 1 };
        session.client.joinGameChannel(room, {
            role, joinPolicy: 'auto',
            onEvent: (type: string, data: unknown) => session.events.push({ type, data }),
            onIncompatibleClient: (compatibility: any) => session.warnings.push(compatibility.reason),
        });
    }, { room, role, legacy });
    await expect.poll(async () => (await stateOf(page)).members?.length || 0).toBeGreaterThan(0);
}

async function publish(page: Page, type: string, data: Record<string, unknown>) {
    await page.evaluate(async ({ type, data }) => {
        const client = (window as any).__session.client;
        await client.gameChannel.publish({ type, data: { senderId: client.clientId, ...data } });
    }, { type, data });
}

test.describe('local broker compatibility and resume', () => {
    test.skip(!process.env.CENTRIFUGO_E2E, 'Requires the isolated local broker on port 8081');
    test('excludes incompatible live/history mutations and renegotiates after player leave', async ({ browser }) => {
        const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext()));
        const [host, guest, viewer, late] = await Promise.all(contexts.map(context => context.newPage()));
        const room = `compatibility-${Date.now()}`;
        try {
            await connect(host, room, 'host');
            await connect(viewer, room, 'spectator', true);
            await expect.poll(async () => (await stateOf(host)).members?.length).toBe(2);
            expect((await stateOf(host)).features).toContain('tic-tac-toe');
            await connect(guest, room, 'guest', true);
            await expect.poll(async () => (await stateOf(host)).features).not.toContain('tic-tac-toe');
            await host.evaluate(async () => {
                const client = (window as any).__session.client;
                await client.broadcastGameEvent(client.currentGameId, 'fist-bump', { index: 0, eventId: 'blocked-feature' });
            });
            expect((await stateOf(viewer)).events).not.toContain('blocked-feature');
            await publish(guest, 'presence-announce', { id: await guest.evaluate(() => (window as any).__session.client.clientId),
                role: 'guest', protocolVersion: 99, minProtocolVersion: 99 });
            await expect.poll(async () => (await stateOf(host)).warnings).toContain('local-outdated');
            await publish(guest, 'cell-update', { index: 0, value: 1, eventId: 'incompatible-move' });
            await host.evaluate(async () => {
                const client = (window as any).__session.client;
                await client.broadcastGameEvent(client.currentGameId, 'cell-update', { index: 1, value: 2, eventId: 'compatible-move' });
            });
            await expect.poll(async () => (await stateOf(viewer)).events).toContain('compatible-move');
            expect((await stateOf(viewer)).events).not.toContain('incompatible-move');
            await connect(late, room, 'spectator');
            await expect.poll(async () => (await stateOf(late)).events).toContain('compatible-move');
            expect((await stateOf(late)).events).not.toContain('incompatible-move');
            // Fresh legacy presence reduces player capabilities again; leave must restore them.
            await publish(guest, 'presence-announce', { id: await guest.evaluate(() => (window as any).__session.client.clientId), role: 'guest' });
            await expect.poll(async () => (await stateOf(host)).features).not.toContain('shift');
            await contexts[1].close();
            await expect.poll(async () => (await stateOf(host)).features).toContain('shift');
        } finally {
            await Promise.all(contexts.map(context => context.close()));
        }
    });

    test('reuses room and lobby subscriptions over repeated transport suspension', async ({ browser }) => {
        const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
        const [host, viewer] = await Promise.all(contexts.map(context => context.newPage()));
        const room = `resume-${Date.now()}`;
        try {
            await connect(host, room, 'host');
            await connect(viewer, room, 'spectator');
            await host.evaluate(() => {
                const session = (window as any).__session;
                session.client.joinLobby({ gameId: session.client.currentGameId });
                session.room = session.client.gameChannel;
                session.lobby = session.client.lobbyChannel;
            });
            for (let cycle = 0; cycle < 3; cycle++) {
                const previous = (await stateOf(host)).connection;
                await host.evaluate(() => {
                    const client = (window as any).__session.client;
                    client.suspend(); client.suspend();
                });
                await expect.poll(async () => (await stateOf(host)).connected).toBe('disconnected');
                await host.evaluate(() => {
                    const client = (window as any).__session.client;
                    client.resume(); client.resume();
                });
                await expect.poll(async () => (await stateOf(host)).connected).toBe('connected');
                await expect.poll(async () => (await stateOf(host)).connection).not.toBe(previous);
                await expect.poll(async () => (await stateOf(viewer)).members?.filter((member: any) => member.role === 'host').length).toBe(1);
                const eventId = `after-resume-${cycle}`;
                await host.evaluate(async (eventId) => {
                    const client = (window as any).__session.client;
                    await client.broadcastGameEvent(client.currentGameId, 'cell-update', { index: 0, value: 1, eventId });
                }, eventId);
                await expect.poll(async () => (await stateOf(viewer)).events.filter((id: string) => id === eventId).length).toBe(1);
                expect(await host.evaluate(() => {
                    const session = (window as any).__session;
                    return session.client.gameChannel === session.room && session.client.lobbyChannel === session.lobby
                        && Object.keys(session.client.client.subscriptions()).length === 2;
                })).toBe(true);
            }
        } finally {
            await Promise.all(contexts.map(context => context.close()));
        }
    });
});
