import { describe, expect, it } from 'vitest';
import { createSudokuGame } from '../src/domain/sudoku-engine.js';
import { shiftBand, shiftCol, shiftRow, shiftStack } from '../src/domain/sudoku-shifts.js';

describe('sudoku-shifts', () => {
    it('shifts rows, columns, bands, and stacks while preserving solved state validity', () => {
        const game = createSudokuGame({ difficulty: 'easy', variant: '2x3' });
        const initialRow0 = game.board.slice(0, 6);
        const rowShifted = shiftRow(game, 0, 1);
        expect(rowShifted.board.slice(6, 12)).toEqual(initialRow0);
        expect(rowShifted.history).toHaveLength(1);

        const colShifted = shiftCol(rowShifted, 0, 1);
        expect(colShifted.history).toHaveLength(2);

        const bandShifted = shiftBand(colShifted, 0, 1);
        expect(bandShifted.history).toHaveLength(3);

        const stackShifted = shiftStack(bandShifted, 0, 1);
        expect(stackShifted.history).toHaveLength(4);
    });

    it('throws on out-of-range shift indices', () => {
        const game = createSudokuGame({ difficulty: 'easy', variant: '2x3' });
        expect(() => shiftRow(game, 6, 1)).toThrow();
        expect(() => shiftCol(game, -1, 1)).toThrow();
        expect(() => shiftBand(game, 3, 1)).toThrow();
        expect(() => shiftStack(game, 2, 1)).toThrow();
    });
});
