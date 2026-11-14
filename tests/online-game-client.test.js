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
        expect(client.hostedLobbyMeta).toEqual({
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
        });

        const gamePublishSpy = vi.fn().mockResolvedValue({});
        client.gameChannel = { publish: gamePublishSpy };
        client.gameRole = 'host';
        client.gameMode = 'online';
        client.updateGameJoinPolicy('auto');

        expect(client.gameJoinPolicy).toBe('auto');
        expect(gamePublishSpy).toHaveBeenCalledWith(expect.objectContaining({
            type: 'join-policy',
            data: { joinPolicy: 'auto' },
        }));
    });
});
