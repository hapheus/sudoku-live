import { describe, expect, it } from 'vitest';
import { createShiftChallenge } from '../src/domain/tic-tac-toe.js';
import {
    validateIncomingGameMessage,
    validatePresenceAnnounce,
    validateLobbyUpdateMessage,
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
        expect(validateIncomingGameMessage('cell-update', { index: 5, notes: [0, 10] }, 81, 9)).toBe(false);
        expect(validateIncomingGameMessage('cell-update', { index: 5, notes: 'invalid' }, 81, 9)).toBe(false);

        // 6x6 variant bounds (totalCells = 36, maxDigit = 6)
        expect(validateIncomingGameMessage('cell-update', { index: 35, value: 6, notes: [1, 6] }, 36, 6)).toBe(true);
        expect(validateIncomingGameMessage('cell-update', { index: 36, value: 1 }, 36, 6)).toBe(false);
        expect(validateIncomingGameMessage('cell-update', { index: 5, value: 7 }, 36, 6)).toBe(false);

        expect(validateIncomingGameMessage('reaction', { emoji: '🔥' }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('reaction', { emoji: '<script>' }, 81, 9)).toBe(false);

        expect(validateIncomingGameMessage('cursor', { index: 4, role: 'guest' }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('cursor', { index: 99, role: 'guest' }, 81, 9)).toBe(false);
        expect(validateIncomingGameMessage('cursor', { index: 4, role: 'spectator' }, 81, 9)).toBe(false);

        expect(validateIncomingGameMessage('active-digit', { digit: 5 }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('active-digit', { digit: null }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('active-digit', { digit: 7 }, 36, 6)).toBe(false);

        expect(validateIncomingGameMessage('join-policy', { joinPolicy: 'auto' }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('join-policy', { joinPolicy: 'hack' }, 81, 9)).toBe(false);

        expect(validateIncomingGameMessage('unknown-action', {}, 81, 9)).toBe(false);
        expect(validateIncomingGameMessage('cell-update', null, 81, 9)).toBe(false);
    });

    it('validates easter-egg events (fist-bump & tic-tac-toe) and rejects malformed easter-egg payloads', () => {
        expect(validateIncomingGameMessage('fist-bump', { index: 4, value: 5 }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('fist-bump', { index: -1 }, 81, 9)).toBe(false);
        expect(validateIncomingGameMessage('fist-bump', { index: 36 }, 36, 6)).toBe(false);

        expect(validateIncomingGameMessage('tic-tac-toe-shift', { playerId: 'guest-1', axis: 'row', index: 0, direction: 1 }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('tic-tac-toe-shift', { axis: 'row' }, 81, 9)).toBe(false);

        expect(validateIncomingGameMessage('tic-tac-toe-move', { playerId: 'guest-1', index: 4 }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('tic-tac-toe-move', { playerId: 'guest-1', index: 9 }, 81, 9)).toBe(false);
        expect(validateIncomingGameMessage('tic-tac-toe-move', { playerId: '', index: 4 }, 81, 9)).toBe(false);

        expect(validateIncomingGameMessage('tic-tac-toe-state', { challenge: createShiftChallenge() }, 81, 9)).toBe(true);
        expect(validateIncomingGameMessage('tic-tac-toe-state', { challenge: { bad: true } }, 81, 9)).toBe(false);
    });

    it('enforces monotonic sequence ordering, boundary seq values, and replay timestamp protection', () => {
        const now = 1_700_000_000_000;
        const guard = createMessageOrderGuard({ nowFn: () => now, maxClockSkewMs: 60_000 });

        expect(guard.accept({ senderId: 'c1', seq: 1, sentAt: now })).toBe(true);
        expect(guard.accept({ senderId: 'c1', seq: 2, sentAt: now })).toBe(true);
        // Out-of-order / replayed lower seq
        expect(guard.accept({ senderId: 'c1', seq: 1, sentAt: now })).toBe(false);
        expect(guard.accept({ senderId: 'c1', seq: 2, sentAt: now })).toBe(false);
        // Invalid seq boundaries
        expect(guard.accept({ senderId: 'c1', seq: 0, sentAt: now })).toBe(false);
        expect(guard.accept({ senderId: 'c1', seq: -3, sentAt: now })).toBe(false);
        // Different sender is independent
        expect(guard.accept({ senderId: 'c2', seq: 1, sentAt: now })).toBe(true);
        // Stale / future / non-finite timestamps rejected
        expect(guard.accept({ senderId: 'c2', seq: 2, sentAt: now - 120_000 })).toBe(false);
        expect(guard.accept({ senderId: 'c2', seq: 3, sentAt: now + 120_000 })).toBe(false);
        expect(guard.accept({ senderId: 'c2', seq: 4, sentAt: Number.NaN })).toBe(false);
    });

    it('verifies sender identity and allows re-binding after releaseServerClient on leave/reconnect', () => {
        const identity = createSenderIdentityGuard();

        // Bind connection sc-1 to client_a and server user user-a
        expect(identity.verify({ serverClientId: 'sc-1', serverUser: 'user-a', senderId: 'client_a' })).toBe(true);
        // Same connection claiming to be client_b is rejected (spoofing attempt)
        expect(identity.verify({ serverClientId: 'sc-1', serverUser: 'user-a', senderId: 'client_b' })).toBe(false);
        // Different connection claiming to be client_a is rejected (impersonation)
        expect(identity.verify({ serverClientId: 'sc-2', serverUser: 'user-b', senderId: 'client_a' })).toBe(false);
        // Mismatched serverUser on same connection rejected
        expect(identity.verify({ serverClientId: 'sc-1', serverUser: 'user-evil', senderId: 'client_a' })).toBe(false);

        // After sc-1 leaves, client_a can reconnect on sc-3
        identity.releaseServerClient('sc-1');
        expect(identity.verify({ serverClientId: 'sc-3', serverUser: 'user-a', senderId: 'client_a' })).toBe(true);
    });

    it('validates complete presence-announce and lobby-update objects and rejects manipulated payloads', () => {
        expect(validatePresenceAnnounce({
            id: 'client_1234',
            role: 'host',
            game_mode: 'online',
            join_policy: 'confirm',
            name: 'Franz_01-a',
        })).toBe(true);
        expect(validatePresenceAnnounce(null)).toBe(false);
        expect(validatePresenceAnnounce({ id: 'ab' })).toBe(false);
        expect(validatePresenceAnnounce({ id: 'client_1234', name: { bad: 1 } })).toBe(false);
        expect(validatePresenceAnnounce({ id: 'client_1234', role: 'admin' })).toBe(false);

        expect(validateLobbyUpdateMessage({
            game_id: 'room-123456',
            status: 'in_progress',
            game_mode: 'online',
            difficulty: 'medium',
            variant: '3x3',
            total_cells: 81,
            filled_count: 20,
            elapsed_seconds: 95,
            host_name: 'Franz_01',
        })).toBe(true);
        expect(validateLobbyUpdateMessage(null)).toBe(false);
        expect(validateLobbyUpdateMessage({ game_id: 'bad' })).toBe(false);
        expect(validateLobbyUpdateMessage({ game_id: 'room-123456', host_name: ['evil'] })).toBe(false);
        expect(validateLobbyUpdateMessage({ game_id: 'room-123456', filled_count: -5 })).toBe(false);
    });
});
