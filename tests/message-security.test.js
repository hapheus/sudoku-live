import { describe, expect, it } from 'vitest';
import {
    validateIncomingGameMessage,
    createMessageOrderGuard,
    createSenderIdentityGuard,
} from '../src/services/message-security.js';

describe('message-security', () => {
    it('validates well-formed game actions and rejects malformed payloads', () => {
        expect(validateIncomingGameMessage('cell-update', { index: 10, value: 5, notes: [1, 2], owner: 'host' }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('cell-update', { index: -1, value: 5 }, 81, 9)).toBe(false);
        expect(validateIncomingGameMessage('cell-update', { index: 81, value: 5 }, 81, 9)).toBe(false);
        expect(validateIncomingGameMessage('cell-update', { index: 5, value: 10 }, 81, 9)).toBe(false);
        expect(validateIncomingGameMessage('cell-update', { index: 5, value: 3, owner: 'admin' }, 81, 9)).toBe(false);

        expect(validateIncomingGameMessage('reaction', { emoji: '🔥' }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('reaction', { emoji: '<script>' }, 81, 9)).toBe(false);

        expect(validateIncomingGameMessage('cursor', { index: 4, role: 'guest' }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('cursor', { index: 99, role: 'guest' }, 81, 9)).toBe(false);
        expect(validateIncomingGameMessage('cursor', { index: 4, role: 'spectator' }, 81, 9)).toBe(false);

        expect(validateIncomingGameMessage('tic-tac-toe-move', { index: 4, symbol: 'X' }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('tic-tac-toe-move', { index: 9, symbol: 'X' }, 81, 9)).toBe(false);
        expect(validateIncomingGameMessage('tic-tac-toe-move', { index: 4, symbol: 'Z' }, 81, 9)).toBe(false);

        expect(validateIncomingGameMessage('join-policy', { joinPolicy: 'auto' }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('join-policy', { joinPolicy: 'hack' }, 81, 9)).toBe(false);

        expect(validateIncomingGameMessage('unknown-action', {}, 81, 9)).toBe(false);
        expect(validateIncomingGameMessage('cell-update', null, 81, 9)).toBe(false);
    });

    it('enforces monotonic sequence ordering and replay timestamp protection', () => {
        const now = 1_700_000_000_000;
        const guard = createMessageOrderGuard({ nowFn: () => now, maxClockSkewMs: 60_000 });

        expect(guard.accept({ senderId: 'c1', seq: 1, sentAt: now })).toBe(true);
        expect(guard.accept({ senderId: 'c1', seq: 2, sentAt: now })).toBe(true);
        // Out-of-order / replayed lower seq
        expect(guard.accept({ senderId: 'c1', seq: 1, sentAt: now })).toBe(false);
        expect(guard.accept({ senderId: 'c1', seq: 2, sentAt: now })).toBe(false);
        // Different sender is independent
        expect(guard.accept({ senderId: 'c2', seq: 1, sentAt: now })).toBe(true);
        // Stale timestamp rejected
        expect(guard.accept({ senderId: 'c2', seq: 2, sentAt: now - 120_000 })).toBe(false);
        // Future timestamp beyond skew rejected
        expect(guard.accept({ senderId: 'c2', seq: 3, sentAt: now + 120_000 })).toBe(false);
    });

    it('verifies sender identity against bound serverClientId and server user', () => {
        const identity = createSenderIdentityGuard();

        // Bind connection sc-1 to client_a and server user user-a
        expect(identity.verify({ serverClientId: 'sc-1', serverUser: 'user-a', senderId: 'client_a' })).toBe(true);
        // Same connection claiming to be client_b is rejected (spoofing attempt)
        expect(identity.verify({ serverClientId: 'sc-1', serverUser: 'user-a', senderId: 'client_b' })).toBe(false);
        // Different connection claiming to be client_a is rejected (impersonation)
        expect(identity.verify({ serverClientId: 'sc-2', serverUser: 'user-b', senderId: 'client_a' })).toBe(false);
        // Mismatched serverUser on same connection rejected
        expect(identity.verify({ serverClientId: 'sc-1', serverUser: 'user-evil', senderId: 'client_a' })).toBe(false);
    });
});
