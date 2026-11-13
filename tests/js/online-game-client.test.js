import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    OnlineGameClient,
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

    it('deduplicates seen event IDs up to bounded window', () => {
        const client = new OnlineGameClient({
            reverbConfig: { key: 'k', host: 'localhost', port: 8080, scheme: 'http' },
        });

        expect(client.rememberEvent('evt-1')).toBe(false);
        expect(client.rememberEvent('evt-1')).toBe(true);
        expect(client.rememberEvent('evt-2')).toBe(false);
    });

    it('shares identical eventId across whisper and HTTP relay', async () => {
        const client = new OnlineGameClient({
            reverbConfig: { key: 'k', host: 'localhost', port: 8080, scheme: 'http' },
        });

        const whisperSpy = vi.fn();
        client.gameChannel = { whisper: whisperSpy };

        const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchSpy);

        await client.broadcastGameEvent('room-abc123', 'cell-update', { index: 40, value: 7, notes: [] });

        expect(whisperSpy).toHaveBeenCalledTimes(1);
        expect(fetchSpy).toHaveBeenCalledTimes(1);

        const whisperPayload = whisperSpy.mock.calls[0][1];
        const fetchBody = JSON.parse(fetchSpy.mock.calls[0][1].body);

        expect(whisperPayload.data.eventId).toBeTruthy();
        expect(fetchBody.data.eventId).toBe(whisperPayload.data.eventId);
        expect(fetchBody.data.index).toBe(40);
        expect(fetchBody.data.value).toBe(7);

        vi.unstubAllGlobals();
    });

    it('broadcasts game_mode in lobby updates for solo and online games', () => {
        const client = new OnlineGameClient({
            reverbConfig: { key: 'k', host: 'localhost', port: 8080, scheme: 'http' },
        });

        const whisperSpy = vi.fn();
        client.lobbyChannel = { whisper: whisperSpy };

        client.broadcastLobbyUpdate('solo-room-1', 'in_progress', 35, 'hard', 'solo');

        expect(whisperSpy).toHaveBeenCalledWith('lobby-update', {
            id: client.clientId,
            game_id: 'solo-room-1',
            status: 'in_progress',
            game_mode: 'solo',
            difficulty: 'hard',
            filled_count: 35,
        });
    });
});
