import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    OnlineGameClient,
    generateEventId,
    generateGameId,
    isValidGameId,
} from '../src/services/online-game-client.js';

describe('OnlineGameClient (Serverless Centrifugo)', () => {
    beforeEach(() => {
        sessionStorage.clear();
        delete window.__APP_CONFIG__;
        delete window.Capacitor;
    });

    it('suspends and restores the same subscriptions without duplicating transport work', () => {
        const client = new OnlineGameClient();
        const transport = { connect: vi.fn(), disconnect: vi.fn(), removeSubscription: vi.fn() };
        const game = { unsubscribe: vi.fn() };
        const lobby = { unsubscribe: vi.fn() };
        client.client = transport;
        client.gameChannel = game;
        client.lobbyChannel = lobby;
        client.currentGameId = 'resume-room';
        client.hostedLobbyMeta = { game_id: 'resume-room' };
        client.suspend();
        client.suspend();
        expect(transport.disconnect).toHaveBeenCalledTimes(1);
        expect(game.unsubscribe).not.toHaveBeenCalled();
        expect(lobby.unsubscribe).not.toHaveBeenCalled();
        expect(client.currentGameId).toBe('resume-room');
        client.resume();
        client.resume();
        expect(transport.connect).toHaveBeenCalledTimes(1);
        expect(client.gameChannel).toBe(game);
        expect(client.lobbyChannel).toBe(lobby);
        expect(client.hostedLobbyMeta).toEqual({ game_id: 'resume-room' });
        client.suspend();
        client.disconnect();
        client.resume();
        expect(game.unsubscribe).toHaveBeenCalledTimes(1);
        expect(lobby.unsubscribe).toHaveBeenCalledTimes(1);
        expect(transport.connect).toHaveBeenCalledTimes(1);
        expect(client.client).toBeNull();
    });

    it('enforces optional outgoing actions and projects mini-game metadata for legacy players', async () => {
        const client = new OnlineGameClient();
        const publish = vi.fn().mockResolvedValue({});
        client.gameChannel = { publish };
        client.roomAuthority.announce('legacy', { id: 'legacy', role: 'host' });
        client.peerCompatibility.announce('legacy', {});
        await client.broadcastGameEvent('feature-room', 'fist-bump', { index: 0 });
        client.sendWhisperEvent('tic-tac-toe-move', { index: 0, playerId: client.clientId });
        expect(publish).not.toHaveBeenCalled();
        await client.broadcastGameEvent('feature-room', 'sync', { gameState: { board: [] }, ticTacToe: { triggered: true } });
        expect(publish.mock.lastCall[0].data).not.toHaveProperty('ticTacToe');
        client.peerCompatibility.remove('legacy');
        client.roomAuthority.leave('legacy');
        client.sendWhisperEvent('fist-bump', { index: 0 });
        expect(publish.mock.lastCall[0].type).toBe('fist-bump');
    });

    it('applies historical peer features when projecting recovered snapshots', async () => {
        const client = new OnlineGameClient();
        const publication = (type, data, offset) => ({ offset, info: { client: 'legacy-transport' }, data: { type, data } });
        const sub = { history: vi.fn().mockResolvedValue({ publications: [
            publication('presence-announce', { id: 'legacy-host', role: 'host' }, 1),
            publication('sync', { senderId: 'legacy-host', gameState: { board: Array(36).fill(0), givens: Array(36).fill(false) },
                ticTacToe: { triggered: false, shifts: [], game: null } }, 2),
        ] }) };
        client.gameChannel = sub;
        const events = [];
        await client.replayGameHistory(sub, (type, data) => events.push({ type, data }));
        expect(events).toHaveLength(1);
        expect(events[0].data).not.toHaveProperty('ticTacToe');
        expect(client.gameMembersByServerClient.size).toBe(0);
    });

    it('retains local mutations across delayed history and does not truncate at an unsafe snapshot', async () => {
        const client = new OnlineGameClient();
        client.gameChannel = { publish: vi.fn().mockResolvedValue({}) };
        await client.broadcastGameEvent('recovery-room', 'cell-update', { index: 0, value: 1 });
        const localVector = client.stateRecovery.vector();
        expect(localVector[client.stateActor]).toBeGreaterThan(0);
        const received = vi.fn();
        const event = (offset, type, data) => ({ offset, data: { type, data } });
        client.deliverHistory([
            event(10, 'cell-update', { senderId: 'host', seq: 5, index: 1, value: 2, eventId: 'missing-cell' }),
            event(11, 'sync', { senderId: 'host', seq: 6, eventId: 'stale-history', stateVector: {},
                gameState: { board: Array(81).fill(0) } }),
        ], received);
        expect(received).toHaveBeenCalledTimes(1);
        expect(received.mock.calls[0][1].eventId).toBe('missing-cell');
        // Once a snapshot covers an edit, an evicted event ID cannot replay that old edit.
        client.stateRecovery.observe('sync', {
            senderId: 'host', seq: 10, gameState: {}, stateVector: { ...localVector, host: 9 },
        });
        client.eventDeduper.clear();
        client.deliverHistory([
            event(10, 'cell-update', { senderId: 'host', seq: 5, index: 1, value: 2, eventId: 'old-cell' }),
        ], received);
        expect(received).toHaveBeenCalledTimes(1);
    });

    it('uses a fresh state actor when the logical player identity is reused', () => {
        const first = new OnlineGameClient();
        const second = new OnlineGameClient();
        expect(first.clientId).toBe(second.clientId);
        expect(first.stateActor).not.toBe(second.stateActor);
        expect(first.buildOutgoingEnvelope({}).stateActor).toBe(first.stateActor);
    });

    it('validates game IDs strictly', () => {
        expect(isValidGameId('room-123_abc')).toBe(true);
        expect(isValidGameId(generateGameId())).toBe(true);
        expect(isValidGameId('abc')).toBe(false);
        expect(isValidGameId('"><script>alert(1)</script>')).toBe(false);
        expect(isValidGameId('')).toBe(false);
        expect(isValidGameId(null)).toBe(false);
    });

    it('generates unique game and event IDs', () => {
        const g1 = generateGameId();
        const g2 = generateGameId();
        const e1 = generateEventId();
        const e2 = generateEventId();

        expect(g1).not.toBe(g2);
        expect(e1).not.toBe(e2);
    });

    it('builds WebSocket URLs from explicit config, runtime window.__APP_CONFIG__, or Capacitor iOS default', () => {
        const localClient = new OnlineGameClient({
            wsConfig: { host: 'localhost', port: 8081, scheme: 'http' },
        });
        expect(localClient.buildWsUrl()).toBe('ws://localhost:8081/connection/websocket');

        window.__APP_CONFIG__ = {
            wsHost: 'sudoku-ws.fraha.dev',
            wsPort: '443',
            wsScheme: 'https',
        };
        const runtimeClient = new OnlineGameClient();
        expect(runtimeClient.buildWsUrl()).toBe('wss://sudoku-ws.fraha.dev/connection/websocket');

        delete window.__APP_CONFIG__;
        window.Capacitor = { isNativePlatform: () => true };
        const iosNativeClient = new OnlineGameClient();
        expect(iosNativeClient.buildWsUrl()).toBe('wss://sudoku-ws.fraha.dev/connection/websocket');

        const overrideClient = new OnlineGameClient({
            wsConfig: { wsUrl: 'wss://custom.fraha.dev/connection/websocket' },
        });
        expect(overrideClient.buildWsUrl()).toBe('wss://custom.fraha.dev/connection/websocket');
    });

    it('deduplicates seen event IDs up to bounded window', () => {
        const client = new OnlineGameClient({
            wsConfig: { host: 'localhost', port: 8081, scheme: 'http' },
        });

        expect(client.rememberEvent('evt-1')).toBe(false);
        expect(client.rememberEvent('evt-1')).toBe(true);
        expect(client.rememberEvent('evt-2')).toBe(false);
    });

    it('publishes game events directly to Centrifugo channel with deduplicated eventId', async () => {
        const client = new OnlineGameClient({
            wsConfig: { host: 'localhost', port: 8081, scheme: 'http' },
        });

        const publishSpy = vi.fn().mockResolvedValue({});
        client.gameChannel = { publish: publishSpy };

        await client.broadcastGameEvent('room-abc123', 'cell-update', { index: 40, value: 7, notes: [] });

        expect(publishSpy).toHaveBeenCalledTimes(1);
        const publishedPayload = publishSpy.mock.calls[0][0];

        expect(publishedPayload.type).toBe('cell-update');
        expect(publishedPayload.data.index).toBe(40);
        expect(publishedPayload.data.value).toBe(7);
        expect(publishedPayload.data.eventId).toBeTruthy();
        expect(client.rememberEvent(publishedPayload.data.eventId)).toBe(true);
    });

    it('broadcasts variant, total_cells, has_guest, and game_mode in lobby updates', () => {
        const client = new OnlineGameClient({
            wsConfig: { host: 'localhost', port: 8081, scheme: 'http' },
        });

        const publishSpy = vi.fn().mockResolvedValue({});
        client.lobbyChannel = { publish: publishSpy };

        client.broadcastLobbyUpdate('solo-room-1', 'in_progress', 16, 'hard', 'solo', {
            variant: '2x3',
            totalCells: 36,
            hasGuest: true,
            ticTacToe: true,
        });

        expect(publishSpy).toHaveBeenCalledTimes(1);
        const payload = publishSpy.mock.calls[0][0];
        expect(payload.type).toBe('lobby-update');
        expect(payload.data).toMatchObject({
            id: client.clientId,
            game_id: 'solo-room-1',
            status: 'in_progress',
            game_mode: 'solo',
            difficulty: 'hard',
            variant: '2x3',
            total_cells: 36,
            has_guest: true,
            filled_count: 16,
        });
        expect(client.hostedLobbyMeta).toMatchObject({
            id: client.clientId,
            game_id: 'solo-room-1',
            status: 'in_progress',
            game_mode: 'solo',
            difficulty: 'hard',
            variant: '2x3',
            total_cells: 36,
            has_guest: true,
            filled_count: 16,
            join_policy: 'confirm',
            tic_tac_toe: true,
            host_name: client.playerName,
            elapsed_seconds: 0,
            protocolVersion: 2,
        });

        const gamePublishSpy = vi.fn().mockResolvedValue({});
        client.gameChannel = { publish: gamePublishSpy };
        client.gameRole = 'host';
        client.gameMode = 'online';
        client.updateGameJoinPolicy('auto');

        expect(client.gameJoinPolicy).toBe('auto');
        expect(gamePublishSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'join-policy',
            data: expect.objectContaining({
                joinPolicy: 'auto',
                protocolVersion: 2,
            }),
        }));
    });

    it('skips replaying channel history for authoritative solo hosts and ignores pre-rematch events for guests', async () => {
        const makeMockSubscription = (publications) => {
            const handlers = new Map();
            return {
                on: (evt, cb) => handlers.set(evt, cb),
                subscribe: async () => {
                    await handlers.get('subscribed')?.();
                },
                unsubscribe: vi.fn(),
                presence: vi.fn().mockResolvedValue({ clients: {} }),
                history: vi.fn().mockResolvedValue({ publications }),
                publish: vi.fn().mockResolvedValue({}),
            };
        };

        const soloClient = new OnlineGameClient({
            wsConfig: { host: 'localhost', port: 8081, scheme: 'http' },
        });
        const soloSub = makeMockSubscription([
            { offset: 1, data: { type: 'cell-update', data: { eventId: 'e1', index: 4, value: 9 } } },
        ]);
        soloClient.client = {
            state: 'connected',
            connect: vi.fn(),
            newSubscription: vi.fn(() => soloSub),
            removeSubscription: vi.fn(),
        };

        const soloEvents = [];
        soloClient.joinGameChannel('room-solo-clean', {
            role: 'host',
            gameMode: 'solo',
            onEvent: (type, data) => soloEvents.push({ type, data }),
        });
        await Promise.resolve();
        await Promise.resolve();
        expect(soloEvents).toEqual([]);

        const guestClient = new OnlineGameClient({
            wsConfig: { host: 'localhost', port: 8081, scheme: 'http' },
        });
        const historyInfo = { client: 'sc-history-host' };
        const guestSub = makeMockSubscription([
            { offset: 0, info: historyInfo, data: { type: 'presence-announce', data: { id: 'history-host', role: 'host' } } },
            ...[
                { offset: 4, type: 'cell-update', data: { eventId: 'e4', index: 5, value: 3 } },
                { offset: 3, type: 'new-puzzle-accept', data: { eventId: 'e3', gameState: { board: Array(81).fill(0), givens: Array(81).fill(false) } } },
                { offset: 2, type: 'cell-update', data: { eventId: 'e2', index: 1, value: 8 } },
                { offset: 1, type: 'cell-update', data: { eventId: 'e1', index: 0, value: 7 } },
            ].map(({ offset, type, data }) => ({ offset, info: historyInfo, data: { type, data: { ...data, senderId: 'history-host' } } })),
        ]);
        guestClient.client = {
            state: 'connected',
            connect: vi.fn(),
            newSubscription: vi.fn(() => guestSub),
            removeSubscription: vi.fn(),
        };

        const guestEvents = [];
        guestClient.joinGameChannel('room-coop-reset', {
            role: 'guest',
            gameMode: 'online',
            onEvent: (type, data) => guestEvents.push({ type, data }),
        });
        await Promise.resolve();
        await Promise.resolve();
        expect(guestEvents.map((e) => e.data.eventId)).toEqual(['e3', 'e4']);
    });

    it('assigns unique displayName suffixes for duplicate member names and updates playerName live', async () => {
        const handlers = new Map();
        const publishSpy = vi.fn().mockResolvedValue({});
        const sub = {
            on: (evt, cb) => handlers.set(evt, cb),
            subscribe: async () => {
                await handlers.get('subscribed')?.();
            },
            unsubscribe: vi.fn(),
            presence: vi.fn().mockResolvedValue({ clients: { 'sc-self': {}, 'sc-guest': {} } }),
            history: vi.fn().mockResolvedValue({ publications: [] }),
            publish: publishSpy,
        };

        const client = new OnlineGameClient({
            wsConfig: { host: 'localhost', port: 8081, scheme: 'http' },
            playerName: 'SwiftFox',
        });
        client.serverClientId = 'sc-self';
        client.client = {
            state: 'connected',
            connect: vi.fn(),
            newSubscription: vi.fn(() => sub),
            removeSubscription: vi.fn(),
        };

        let latestMembers = [];
        client.joinGameChannel('room-names-1', {
            role: 'host',
            gameMode: 'online',
            joinPolicy: 'auto',
            onPresenceChange: (members) => { latestMembers = members; },
            onMemberJoin: () => { latestMembers = client.getGameMembers(); },
        });

        await Promise.resolve();
        await Promise.resolve();

        handlers.get('publication')?.({
            info: { client: 'sc-guest' },
            data: {
                type: 'presence-announce',
                data: { id: 'guest-id', serverClientId: 'sc-guest', role: 'guest', name: 'SwiftFox' },
            },
        });

        const byRole = new Map(latestMembers.map((m) => [m.role, m.displayName]));
        expect(byRole.get('host')).toBe('SwiftFox');
        expect(byRole.get('guest')).toBe('SwiftFox (2)');

        client.updatePlayerName('CalmOwl');
        expect(client.playerName).toBe('CalmOwl');
        expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'presence-announce',
            data: expect.objectContaining({ name: 'CalmOwl' }),
        }));
    });

    it('clears stale members, re-announces, and replays missed events on reconnect', async () => {
        const handlers = new Map();
        const publishSpy = vi.fn().mockResolvedValue({});
        const historySpy = vi.fn()
            .mockResolvedValueOnce({ publications: [] })
            .mockResolvedValueOnce({
                publications: [
                    { offset: 0, info: { client: 'sc-old' }, data: { type: 'presence-announce', data: { id: 'old-host', role: 'host' } } },
                    { offset: 1, info: { client: 'sc-old' }, data: { type: 'cell-update', data: { senderId: 'old-host', eventId: 'evt-miss-1', index: 2, value: 5 } } },
                ],
            });
        const presenceSpy = vi.fn()
            .mockResolvedValueOnce({ clients: { 'sc-self': {}, 'sc-old': {} } })
            .mockResolvedValueOnce({ clients: { 'sc-self': {} } });

        const sub = {
            on: (evt, cb) => handlers.set(evt, cb),
            subscribe: async () => {
                await handlers.get('subscribed')?.();
            },
            unsubscribe: vi.fn(),
            presence: presenceSpy,
            history: historySpy,
            publish: publishSpy,
        };

        const client = new OnlineGameClient({
            wsConfig: { host: 'localhost', port: 8081, scheme: 'http' },
            playerName: 'CleverLynx',
        });
        client.serverClientId = 'sc-self';
        client.client = {
            state: 'connected',
            connect: vi.fn(),
            newSubscription: vi.fn(() => sub),
            removeSubscription: vi.fn(),
        };

        const events = [];
        const presenceSnapshots = [];
        client.joinGameChannel('room-reconn-1', {
            role: 'guest',
            gameMode: 'online',
            onEvent: (type, data) => events.push({ type, data }),
            onPresenceChange: (members) => presenceSnapshots.push(members),
        });

        await Promise.resolve();
        await Promise.resolve();

        handlers.get('publication')?.({
            info: { client: 'sc-old' },
            data: {
                type: 'presence-announce',
                data: { id: 'old-host', serverClientId: 'sc-old', role: 'host', name: 'OldHost' },
            },
        });
        expect(client.getGameMembers()).toHaveLength(2);

        // Simulate reconnect: Centrifugo fires 'subscribed' again
        await handlers.get('subscribed')?.();
        await Promise.resolve();
        await Promise.resolve();

        expect(events.map((e) => e.data.eventId)).toEqual(['evt-miss-1']);
        expect(client.getGameMembers()).toHaveLength(1);
        expect(client.getGameMembers()[0].displayName).toBe('CleverLynx');
        expect(publishSpy).toHaveBeenCalledTimes(2);
        handlers.get('publication')?.({
            info: { client: 'sc-reconnected' },
            data: { type: 'presence-announce', data: { id: 'old-host', role: 'host' } },
        });
        handlers.get('publication')?.({
            info: { client: 'sc-reconnected' },
            data: { type: 'cell-update', data: { senderId: 'old-host', eventId: 'evt-after-reconnect', index: 3, value: 2 } },
        });
        expect(events.at(-1).data.eventId).toBe('evt-after-reconnect');
        // A different live transport cannot claim the now-bound player identity.
        handlers.get('publication')?.({
            info: { client: 'sc-spoofed' },
            data: { type: 'cell-update', data: { senderId: 'old-host', eventId: 'evt-spoofed', index: 3, value: 9 } },
        });
        expect(events.at(-1).data.eventId).toBe('evt-after-reconnect');
    });

    it('removes stale Watch rooms when reconnect history no longer contains their hosts', async () => {
        const handlers = new Map();
        const sub = {
            on: (event, callback) => handlers.set(event, callback),
            subscribe: vi.fn(), unsubscribe: vi.fn(),
            presence: vi.fn().mockResolvedValue({ clients: { 'sc-self': {} } }),
            history: vi.fn().mockResolvedValue({ publications: [] }),
        };
        const client = new OnlineGameClient();
        client.client = { newSubscription: () => sub, removeSubscription: vi.fn() };
        const snapshots = [];
        client.joinLobby({ onLobbyPresenceChange: rooms => snapshots.push(rooms) });
        client.lobbyRoomsByGameId.set('old-room', { game_id: 'old-room', serverClientId: 'retired-host' });
        await handlers.get('subscribed')();
        expect(snapshots).toEqual([[]]);
        client.leaveLobby();
    });

    it('rejects duplicate, out-of-order, and spoofed-identity live publications and notifies incompatible clients', async () => {
        const handlers = new Map();
        const publishSpy = vi.fn().mockResolvedValue({});
        const sub = {
            on: (evt, cb) => handlers.set(evt, cb),
            subscribe: async () => {
                await handlers.get('subscribed')?.();
            },
            unsubscribe: vi.fn(),
            presence: vi.fn().mockResolvedValue({ clients: { 'sc-self': {} } }),
            history: vi.fn().mockResolvedValue({ publications: [] }),
            publish: publishSpy,
        };

        const client = new OnlineGameClient({
            wsConfig: { host: 'localhost', port: 8081, scheme: 'http' },
            playerName: 'HostOne',
        });
        client.serverClientId = 'sc-self';
        client.client = {
            state: 'connected',
            connect: vi.fn(),
            newSubscription: vi.fn(() => sub),
            removeSubscription: vi.fn(),
        };

        const events = [];
        const incompatible = [];
        client.joinGameChannel('room-sec-1', {
            role: 'host',
            gameMode: 'online',
            joinPolicy: 'auto',
            onEvent: (type, data) => events.push({ type, data }),
            onIncompatibleClient: (compat) => incompatible.push(compat),
        });

        await Promise.resolve();
        await Promise.resolve();

        // Whisper events also include eventId and protocolVersion
        client.sendWhisperEvent('cursor', { index: 1, role: 'host' });
        expect(publishSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'cursor',
            data: expect.objectContaining({
                eventId: expect.any(String),
                protocolVersion: 2,
                seq: expect.any(Number),
            }),
        }));

        // Bind peer sc-peer -> peer-1
        handlers.get('publication')?.({
            info: { client: 'sc-peer', user: 'u-peer' },
            data: {
                type: 'presence-announce',
                data: { id: 'peer-1', serverClientId: 'sc-peer', role: 'guest', name: 'Peer', protocolVersion: 99, minProtocolVersion: 99 },
            },
        });
        expect(incompatible).toHaveLength(1);
        expect(incompatible[0].requiresUpdate).toBe('local');
        handlers.get('publication')({
            info: { client: 'sc-peer', user: 'u-peer' },
            data: { type: 'cell-update', data: { senderId: 'peer-1', index: 1, value: 4, eventId: 'incompatible-move' } },
        });
        expect(events).toEqual([]);
        expect([...client.gameMembersByServerClient.values()].some(member => member.id === 'peer-1')).toBe(false);
        handlers.get('publication')({
            info: { client: 'sc-peer', user: 'u-peer' },
            data: { type: 'presence-announce', data: { id: 'peer-1', role: 'guest', protocolVersion: 2 } },
        });


        const now = Date.now();
        // Valid live event seq 2
        handlers.get('publication')?.({
            info: { client: 'sc-peer', user: 'u-peer' },
            data: { type: 'cell-update', data: { eventId: 'e-live-2', senderId: 'peer-1', seq: 2, sentAt: now, index: 1, value: 4 } },
        });
        // Duplicate eventId
        handlers.get('publication')?.({
            info: { client: 'sc-peer', user: 'u-peer' },
            data: { type: 'cell-update', data: { eventId: 'e-live-2', senderId: 'peer-1', seq: 3, sentAt: now, index: 1, value: 4 } },
        });
        // Out-of-order seq 1
        handlers.get('publication')?.({
            info: { client: 'sc-peer', user: 'u-peer' },
            data: { type: 'cell-update', data: { eventId: 'e-live-1', senderId: 'peer-1', seq: 1, sentAt: now, index: 2, value: 6 } },
        });
        // Spoofed senderId from sc-peer
        handlers.get('publication')?.({
            info: { client: 'sc-peer', user: 'u-peer' },
            data: { type: 'cell-update', data: { eventId: 'e-spoof', senderId: 'other-player', seq: 1, sentAt: now, index: 3, value: 7 } },
        });

        expect(events.map((e) => e.data.eventId)).toEqual(['e-live-2']);

        // Peer leaves (disconnects) and reconnects on a new serverClientId -> allowed cleanly
        handlers.get('leave')?.({ info: { client: 'sc-peer' } });
        handlers.get('publication')?.({
            info: { client: 'sc-peer-reconnected', user: 'u-peer' },
            data: { type: 'presence-announce', data: { id: 'peer-1', role: 'guest' } },
        });
        handlers.get('publication')?.({
            info: { client: 'sc-peer-reconnected', user: 'u-peer' },
            data: { type: 'cell-update', data: { eventId: 'e-reconn-4', senderId: 'peer-1', seq: 4, sentAt: now, index: 4, value: 8 } },
        });
        expect(events.map((e) => e.data.eventId)).toEqual(['e-live-2', 'e-reconn-4']);
    });
});

describe('outgoing puzzle generations', () => {
    it('stamps a rematch and every following edit with its unique generation', async () => {
        const client = new OnlineGameClient();
        const publish = vi.fn().mockResolvedValue({});
        client.gameChannel = { publish };
        await client.broadcastGameEvent('generation-room', 'new-puzzle-accept', { gameState: { board: [] } });
        const rematch = publish.mock.lastCall[0].data;
        expect(rematch.puzzleGeneration).toBe(rematch.eventId);
        await client.broadcastGameEvent('generation-room', 'cell-update', { index: 0, value: 1 });
        expect(publish.mock.lastCall[0].data.puzzleGeneration).toBe(rematch.eventId);
        client.sendGamePing({ gameState: { board: [] } });
        expect(publish.mock.lastCall[0].data.puzzleGeneration).toBe(rematch.eventId);
    });
});

describe('retrying unacknowledged optimistic edits', () => {
    it('retries the original envelope once and clears acknowledged work', async () => {
        const client = new OnlineGameClient();
        const publish = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
        client.gameChannel = { publish };
        await client.broadcastGameEvent('retry-room', 'cell-update', { index: 0, value: 1 });
        const packet = publish.mock.calls[0][0];
        expect(client.pendingMutations.size).toBe(1);
        await client.flushPendingMutations(client.gameChannel);
        expect(publish.mock.calls[1][0]).toEqual(packet);
        expect(client.pendingMutations.size).toBe(0);
        await client.flushPendingMutations(client.gameChannel);
        expect(publish).toHaveBeenCalledTimes(2);
    });
    it('discards failed old-puzzle edits when a new generation has superseded them', async () => {
        const client = new OnlineGameClient();
        const publish = vi.fn().mockRejectedValue(new Error('offline'));
        client.gameChannel = { publish };
        await client.broadcastGameEvent('retry-room', 'cell-update', { index: 0, value: 1 });
        client.stateRecovery.observe('new-puzzle-accept', { gameState: {}, eventId: 'fresh', puzzleGeneration: 'fresh', stateClock: 10, senderId: 'host', seq: 10 });
        await client.flushPendingMutations(client.gameChannel);
        expect(publish).toHaveBeenCalledTimes(1);
        expect(client.pendingMutations.size).toBe(0);
    });
});

describe('modern history replay order', () => {
    it('does not discard a winning snapshot just because a losing concurrent snapshot has a later offset', () => {
        const client = new OnlineGameClient();
        const state = { variant: '2x3', board: Array(36).fill(0), givens: Array(36).fill(false) };
        const publication = (actor, value, offset) => ({ offset, data: { type: 'sync', data: {
            senderId: actor, stateActor: actor, stateClock: 1, seq: 1, eventId: actor,
            puzzleGeneration: null, stateVector: {}, gameState: { ...state, board: state.board.map((n, i) => i === 0 ? value : n) },
        } } });
        const received = vi.fn();
        client.deliverHistory([publication('b', 2, 1), publication('a', 1, 2)], received);
        expect(received).toHaveBeenCalledTimes(1);
        expect(received.mock.calls[0][1].gameState.board[0]).toBe(2);
    });
});

describe('immutable retry payloads', () => {
    it('keeps the original snapshot even if the caller mutates its source before retry', async () => {
        const client = new OnlineGameClient();
        const publish = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
        client.gameChannel = { publish };
        const gameState = { board: Array(36).fill(0), givens: Array(36).fill(false), variant: '2x3' };
        await client.broadcastGameEvent('retry-room', 'init', { gameState });
        gameState.board[0] = 6;
        await client.flushPendingMutations(client.gameChannel);
        expect(publish.mock.calls[1][0].data.gameState.board[0]).toBe(0);
        expect(publish.mock.calls[1][0].data.eventId).toBe(publish.mock.calls[0][0].data.eventId);
    });
});
