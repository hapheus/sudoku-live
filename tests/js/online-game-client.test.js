import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    OnlineGameClient,
    extractMemberFromClientInfo,
    generateEventId,
    generateGameId,
    isValidGameId,
} from '../../resources/js/services/online-game-client.js';

describe('OnlineGameClient helpers', () => {
    beforeEach(() => {
        sessionStorage.clear();
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

    it('builds WebSocket URLs correctly for local http and production https', () => {
        const localClient = new OnlineGameClient({
            wsConfig: { host: 'localhost', port: 8081, scheme: 'http' },
        });
        expect(localClient.buildWsUrl()).toBe('ws://localhost:8081/connection/websocket');

        const prodClient = new OnlineGameClient({
            wsConfig: { host: 'sudoku-ws.example.com', port: 443, scheme: 'https' },
        });
        expect(prodClient.buildWsUrl()).toBe('wss://sudoku-ws.example.com/connection/websocket');

        const overrideClient = new OnlineGameClient({
            wsConfig: { wsUrl: 'wss://custom.example.com/connection/websocket' },
        });
        expect(overrideClient.buildWsUrl()).toBe('wss://custom.example.com/connection/websocket');
    });

    it('extracts member metadata from Centrifugo ClientInfo', () => {
        expect(extractMemberFromClientInfo({
            client: 'server-conn-1',
            user: 'client_abc',
            chanInfo: {
                id: 'client_abc',
                role: 'host',
                game_mode: 'solo',
            },
        })).toEqual({
            id: 'client_abc',
            role: 'host',
            game_mode: 'solo',
        });

        expect(extractMemberFromClientInfo(null)).toBeNull();
    });

    it('deduplicates seen event IDs up to bounded window', () => {
        const client = new OnlineGameClient({
            wsConfig: { host: 'localhost', port: 8081, scheme: 'http' },
        });

        expect(client.rememberEvent('evt-1')).toBe(false);
        expect(client.rememberEvent('evt-1')).toBe(true);
        expect(client.rememberEvent('evt-2')).toBe(false);
    });

    it('shares identical eventId across client publish and HTTP relay and suppresses sender echo', async () => {
        const client = new OnlineGameClient({
            wsConfig: { host: 'localhost', port: 8081, scheme: 'http' },
        });

        const publishSpy = vi.fn().mockResolvedValue({});
        client.gameChannel = { publish: publishSpy };

        const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchSpy);

        await client.broadcastGameEvent('room-abc123', 'cell-update', { index: 40, value: 7, notes: [] });

        expect(publishSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        const publishedPayload = publishSpy.mock.calls[0][0];
        const fetchBody = JSON.parse(fetchSpy.mock.calls[0][1].body);

        expect(publishedPayload.type).toBe('cell-update');
        expect(publishedPayload.data.eventId).toBeTruthy();
        expect(fetchBody.data.eventId).toBe(publishedPayload.data.eventId);
        expect(fetchBody.data.index).toBe(40);
        expect(fetchBody.data.value).toBe(7);
        expect(client.rememberEvent(publishedPayload.data.eventId)).toBe(true);

        vi.unstubAllGlobals();
    });

    it('broadcasts game_mode in lobby updates for solo and online games', () => {
        const client = new OnlineGameClient({
            wsConfig: { host: 'localhost', port: 8081, scheme: 'http' },
        });

        const publishSpy = vi.fn().mockResolvedValue({});
        client.lobbyChannel = { publish: publishSpy };

        client.broadcastLobbyUpdate('solo-room-1', 'in_progress', 35, 'hard', 'solo');

        expect(publishSpy).toHaveBeenCalledWith({
            type: 'lobby-update',
            data: {
                id: client.clientId,
                game_id: 'solo-room-1',
                status: 'in_progress',
                game_mode: 'solo',
                difficulty: 'hard',
                filled_count: 35,
            },
        });
    });
});
