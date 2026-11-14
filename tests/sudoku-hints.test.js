import { describe, expect, it } from 'vitest';
import { findLogicalHint } from '../src/domain/sudoku-hints.js';

describe('sudoku-hints', () => {
    it('finds full_house hint when one cell remains in a unit', () => {
        // 6x6 board with row 0 missing only index 5 (digit 6)
        const board = Array(36).fill(0);
        board[0] = 1;
        board[1] = 2;
        board[2] = 3;
        board[3] = 4;
        board[4] = 5;
        const givens = board.map((v) => v > 0);
        const hint = findLogicalHint({
            variant: '2x3',
            status: 'playing',
            board,
            givens,
            solution: [],
        });

        expect(hint).not.toBeNull();
        expect(hint.technique).toBe('full_house');
        expect(hint.index).toBe(5);
        expect(hint.digit).toBe(6);
    });

    it('returns null when game is already solved', () => {
        expect(findLogicalHint({ status: 'solved', board: Array(81).fill(1) })).toBeNull();
    });
});
