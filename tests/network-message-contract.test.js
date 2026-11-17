import { describe, expect, it, vi } from 'vitest';
import { validateIncomingGameMessage } from '../src/services/message-security.js';
import { createRemoteEventRouter } from '../src/services/remote-event-router.js';

const snapshot = (size) => ({ board: Array(size).fill(0), givens: Array(size).fill(false) });

describe('complete network message contract', () => {
    for (const size of [36, 81]) {
        const digit = size === 36 ? 6 : 9;
        it(`rejects malformed optional snapshot metadata atomically (${size} cells)`, () => {
            for (const extra of [
                { hints: [null] }, { hints: [['peer', null]] },
                { hintPreview: { index: 0, contextEntries: [null] } },
                { hostCursorIndex: size }, { hostActiveDigit: digit + 1 },
                { rematchRequestedBy: 'admin' }, { ticTacToe: { bad: true } },
                { isRetroMode: 'yes' }, { boardBackgroundId: {} },
            ]) {
                const stateRef = { current: { gameState: snapshot(size), isSpectating: true } };
                const setGameState = vi.fn();
                const router = createRemoteEventRouter({ stateRef, setGameState, setSelectedIndex: vi.fn() });
                const initial = stateRef.current.gameState;
                expect(() => router('sync', { gameState: snapshot(size), ...extra })).not.toThrow();
                expect(setGameState).not.toHaveBeenCalled();
                expect(stateRef.current.gameState).toBe(initial);
            }
        });
        it(`validates every present board field without repairing network input (${size} cells)`, () => {
            for (const extra of [
                { board: Array(size).fill(digit + 1) }, { givens: Array(size).fill('false') },
                { notes: Array(size).fill([digit + 1]) }, { notes: [] },
                { cellOwners: Array(size).fill('admin') }, { solution: Array(size).fill({}) },
                { variant: size === 36 ? '3x3' : '2x3' }, { difficulty: {} },
                { status: 'bad' }, { elapsedSeconds: 0.5 },
            ]) {
                expect(validateIncomingGameMessage('sync', { gameState: { ...snapshot(size), ...extra } })).toBe(false);
            }
            expect(validateIncomingGameMessage('sync', {
                gameState: snapshot(size), hints: [['peer', { index: 0, value: digit }]],
                hintPreview: { index: 0, contextEntries: [[size - 1, 150]] },
                hostCursorIndex: null, hostActiveDigit: digit, ticTacToe: null,
            })).toBe(true);
        });
    }
    it('bounds hint tuples, action values, identities and envelope metadata', () => {
        for (const [type, data] of [
            ['hint-highlight', { index: 1, contextEntries: [[0, -1]] }],
            ['hint-highlight', { index: 1, mode: 'bad' }],
            ['fist-bump', { index: 1, value: 99 }],
            ['tic-tac-toe-shift', { playerId: 'peer', axis: 'row', from: 0, to: 1, direction: 0 }],
            ['new-puzzle-request', { role: 'spectator' }],
            ['reaction', { emoji: '🔥', seq: '1' }],
            ['reaction', { emoji: '🔥', senderId: {} }],
            ['join-request', { requestId: 'x'.repeat(257), requesterId: 'peer' }],
        ]) expect(validateIncomingGameMessage(type, data)).toBe(false);
    });
});
