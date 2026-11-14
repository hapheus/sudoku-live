import { beforeEach, describe, expect, it } from 'vitest';
import {
    buildWsUrl,
    generateEventId,
    generateGameId,
    getOrCreateClientId,
    isValidGameId,
    resolveRuntimeWsConfig,
} from '../src/services/ws-config.js';

describe('ws-config', () => {
    beforeEach(() => {
        sessionStorage.clear();
        delete window.__APP_CONFIG__;
        delete window.Capacitor;
    });

    it('validates and generates IDs', () => {
        expect(isValidGameId('room-123_abc')).toBe(true);
        expect(isValidGameId('bad')).toBe(false);
        expect(isValidGameId(generateGameId())).toBe(true);
        expect(generateEventId()).not.toBe(generateEventId());
    });

    it('persists and reuses client ID in sessionStorage', () => {
        const first = getOrCreateClientId(sessionStorage);
        const second = getOrCreateClientId(sessionStorage);
        expect(first).toBe(second);
        expect(first).toMatch(/^[A-Za-z0-9_-]{4,64}$/);
    });

    it('resolves runtime config and builds WebSocket URLs', () => {
        expect(buildWsUrl(resolveRuntimeWsConfig({ host: 'localhost', port: 8081, scheme: 'http' })))
            .toBe('ws://localhost:8081/connection/websocket');

        window.__APP_CONFIG__ = { wsHost: 'sudoku-ws.fraha.dev', wsPort: '443', wsScheme: 'https' };
        expect(buildWsUrl(resolveRuntimeWsConfig())).toBe('wss://sudoku-ws.fraha.dev/connection/websocket');
    });
});
