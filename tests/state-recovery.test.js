import { describe, expect, it } from 'vitest';
import { createStateRecovery } from '../src/services/state-recovery.js';
import { validateIncomingGameMessage } from '../src/services/message-security.js';

const snapshot = (stateVector) => ({ gameState: {}, stateVector });

describe('causal snapshot recovery', () => {
    it.each(['cell-update', 'sync', 'new-puzzle-accept', 'new-puzzle-request', 'new-puzzle-cancel'])(
        'protects an accepted %s from stale snapshots across senders', (type) => {
            const guard = createStateRecovery();
            guard.observe(type, { senderId: 'guest', seq: 4 });
            expect(guard.accepts('ping', snapshot({ host: 100, guest: 3 }))).toBe(false);
            expect(guard.accepts('sync', snapshot({ host: 100 }))).toBe(false);
            expect(guard.accepts('init', snapshot({ guest: 4 }))).toBe(true);
            expect(guard.accepts('ping', snapshot({ guest: 5 }))).toBe(true);
            expect(guard.accepts('ping', snapshot(undefined))).toBe(false);
        },
    );

    it('carries recovered knowledge forward and rejects already-covered history patches', () => {
        const guard = createStateRecovery();
        guard.observe('sync', { ...snapshot({ guest: 5 }), senderId: 'host', seq: 10 });
        expect(guard.vector()).toEqual({ guest: 5, host: 10 });
        expect(guard.accepts('cell-update', { senderId: 'guest', seq: 4 })).toBe(false);
        expect(guard.accepts('cell-update', { senderId: 'guest', seq: 6 })).toBe(true);
        expect(guard.accepts('ping', snapshot({ guest: 5 }))).toBe(false);
        expect(guard.accepts('ping', snapshot({ guest: 5, host: 10 }))).toBe(true);
    });

    it('prefers the host when both players know the same edits', () => {
        const guard = createStateRecovery();
        guard.observe('cell-update', { senderId: 'guest', seq: 5 });
        expect(guard.accepts('ping', snapshot({ guest: 5 }), false)).toBe(false);
        expect(guard.accepts('ping', snapshot({ guest: 5 }), true)).toBe(true);
        expect(guard.accepts('ping', snapshot({ guest: 6 }), false)).toBe(true);
    });

    it('does not use cursor, heartbeat, wall clock or elapsed time as a mutation revision', () => {
        const guard = createStateRecovery();
        guard.observe('cursor', { senderId: 'host', seq: 100 });
        guard.observe('ping', { senderId: 'host', seq: 101 });
        expect(guard.vector()).toEqual({});
        expect(guard.accepts('ping', snapshot(undefined))).toBe(true);
        guard.observe('cell-update', {});
        expect(guard.accepts('ping', snapshot({ host: 102 }))).toBe(false);
    });

    it.each([null, [], { host: 0 }, { host: -1 }, { host: 1.5 }, { host: Infinity },
        { ['x'.repeat(65)]: 1 }, Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`id-${i}`, 1]))])(
        'rejects malformed or oversized network vectors: %j', (stateVector) => {
            expect(validateIncomingGameMessage('cell-update', { index: 0, value: 1, stateVector })).toBe(false);
        },
    );
});
