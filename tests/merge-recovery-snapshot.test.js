import { describe, it, expect } from 'vitest';
import { hydrateGameState } from '../src/domain/sudoku-engine.js';
import { mergeRecoverySnapshot } from '../src/services/merge-recovery-snapshot.js';
import { validateIncomingGameMessage } from '../src/services/message-security.js';

const raw = () => ({ variant: '2x3', board: Array(36).fill(0), givens: Array(36).fill(false),
    notes: Array.from({ length: 36 }, () => []), cellOwners: Array(36).fill(null), elapsedSeconds: 0 });
const revisions = () => ({ replacement: [1, 'host'], latest: [1, 'host'], cells: [], control: null });

describe('merging bounded recovery snapshots', () => {
    it('preserves independent edits, cleared notes, timer and the newest rematch decision', () => {
        const left = raw(); left.board[0] = 1; left.notes[2] = [1, 2]; left.elapsedSeconds = 9;
        const right = raw(); right.board[1] = 2; right.elapsedSeconds = 5;
        const local = { ...revisions(), latest: [5, 'a'],
            cells: [[0, { value: [3, 'a'] }], [2, { notes: [2, 'a'] }]], control: { revision: [5, 'a'], pending: 'host' } };
        const remote = { ...revisions(), latest: [6, 'b'],
            cells: [[1, { value: [3, 'b'] }], [2, { notes: [4, 'b'] }]], control: { revision: [6, 'b'], pending: null } };
        const merged = mergeRecoverySnapshot(hydrateGameState(left), { gameState: right, stateRevisions: remote }, local, true);
        expect(merged.gameState.board.slice(0, 2)).toEqual([1, 2]);
        expect(merged.gameState.notes[2]).toEqual([]);
        expect(merged.gameState.elapsedSeconds).toBe(9);
        expect(merged.rematchRequestedBy).toBeNull();
    });
    it('uses a winning shift checkpoint without overwriting its immutable givens', () => {
        const left = raw(); left.board[0] = 1;
        const right = raw(); right.board[0] = 3; right.givens[0] = true;
        const local = { ...revisions(), cells: [[0, { value: [10, 'a'] }]] };
        const remote = { ...revisions(), replacement: [4, 'b'] };
        const merged = mergeRecoverySnapshot(hydrateGameState(left), { gameState: right, stateRevisions: remote }, local, false);
        expect(merged.gameState.board[0]).toBe(3);
        expect(merged.gameState.givens[0]).toBe(true);
        expect(merged.gameState.notes[0]).toEqual([]);
        expect(mergeRecoverySnapshot(null, { gameState: right }, local, false)).toBeNull();
    });
    it('keeps winning cell authors and merges hint counters without counting repeated snapshots twice', () => {
        const left = raw();
        const right = raw();
        left.board[0] = 1;
        right.board[0] = 2;
        left.cellAuthors = Array(36).fill(null);
        right.cellAuthors = Array(36).fill(null);
        left.cellAuthors[0] = 'host';
        right.cellAuthors[0] = 'guest';
        left.playerContributions = [{ id: 'host', name: 'Host', hintsUsed: 3 }];
        right.playerContributions = [
            { id: 'host', name: 'Host', hintsUsed: 2 },
            { id: 'guest', name: 'Guest', hintsUsed: 1 },
        ];
        left.wasMultiplayer = true;
        const local = { ...revisions(), cells: [[0, { value: [2, 'host'] }]] };
        const remote = { ...revisions(), cells: [[0, { value: [3, 'guest'] }]] };
        const merged = mergeRecoverySnapshot(hydrateGameState(left), { gameState: right, stateRevisions: remote }, local, true);
        expect(merged.gameState.board[0]).toBe(2);
        expect(merged.gameState.cellAuthors[0]).toBe('guest');
        expect(merged.gameState.wasMultiplayer).toBe(true);
        expect(merged.gameState.playerContributions).toEqual([
            { id: 'guest', name: 'Guest', hintsUsed: 1 },
            { id: 'host', name: 'Host', hintsUsed: 3 },
        ]);
    });
    it.each([0, -1, Infinity, 1.5])('rejects invalid state clocks (%s)', stateClock => {
        expect(validateIncomingGameMessage('cell-update', { index: 0, value: 1, stateClock })).toBe(false);
    });
    it('rejects malformed and duplicate revision entries at the network boundary', () => {
        const payload = { index: 0, value: 1, stateRevisions: { ...revisions(), cells: [[0, { value: [0, 'a'] }]] } };
        expect(validateIncomingGameMessage('cell-update', payload)).toBe(false);
        payload.stateRevisions.cells = [[0, { value: [1, 'a'] }], [0, { value: [2, 'a'] }]];
        expect(validateIncomingGameMessage('cell-update', payload)).toBe(false);
    });
});
