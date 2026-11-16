import { describe, expect, it } from 'vitest';
import { rateSudokuDifficulty } from '../src/domain/sudoku-rating.ts';
import { countSolutions, generateSudoku } from '../src/domain/sudoku-generator.js';
import { createSudokuGame, shiftRow, shiftCol, shiftBand, shiftStack } from '../src/domain/sudoku-engine.js';

const easy = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'.split('').map(Number);
const expert = '100007090030020008009600500005300900010080002600004000300000010040000007007000300'.split('').map(Number);
function seeded(seed) {
    return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
}

describe('logic-based difficulty', () => {
    it('can stop at singles for the legacy analysis boundary', () => {
        const puzzle = '012080000803400000005000090000800670700304001001027000034000000000000509000060830'.split('').map(Number);
        expect(rateSudokuDifficulty(puzzle, '3x3', { maxTechnique: 'nakedSingles' }).solved).toBe(false);
        expect(rateSudokuDifficulty(puzzle, '3x3', { maxTechnique: 'hiddenSingles' }).solved).toBe(true);
    });
    it('rates a worked singles puzzle as easy and leaves input intact', () => {
        const original = [...easy];
        expect(rateSudokuDifficulty(easy).difficulty).toBe('easy');
        expect(rateSudokuDifficulty(easy).solved).toBe(true);
        expect(easy).toEqual(original);
    });
    it('rates a puzzle beyond singles/pairs/locked candidates as expert', () => {
        expect(countSolutions(expert, 2)).toBe(1);
        expect(rateSudokuDifficulty(expert).difficulty).toBe('expert');
        expect(rateSudokuDifficulty(expert).solved).toBe(false);
    });
    it.each([
        ['medium', '012080000803400000005000090000800670700304001001027000034000000000000509000060830', 'hiddenSingles'],
        ['hard', '000069800085000300600001000010000000570000218004000050000100705008000920000692000', 'lockedCandidates'],
        ['expert', '360000000020005004004009000000007030200154009010800000400500800600400012000000063', 'nakedPairs'],
    ])('separates %s using actual deductions, not clue targets', (expected, digits, technique) => {
        const puzzle = digits.split('').map(Number);
        expect(countSolutions(puzzle, 2)).toBe(1);
        const rating = rateSudokuDifficulty(puzzle);
        expect(rating.difficulty).toBe(expected);
        expect(rating.techniques[technique]).toBeGreaterThan(0);
    });
    it('rejects malformed or conflicting boards', () => {
        expect(() => rateSudokuDifficulty([1])).toThrow();
        expect(() => rateSudokuDifficulty(Array(81).fill(1))).toThrow();
    });
    it.each(['3x3', '2x3'])('never mislabels a bounded generation fallback (%s)', variant => {
        for (const difficulty of ['easy', 'medium', 'hard', 'expert']) {
            for (const seed of [1, 17, 321]) {
                const generated = generateSudoku(difficulty, seeded(seed), variant);
                expect(countSolutions(generated.puzzle, 2, variant)).toBe(1);
                expect(generated.difficulty).toBe(rateSudokuDifficulty(generated.puzzle, variant).difficulty);
                expect(generated.requestedDifficulty).toBe(difficulty);
            }
        }
    });
    it.each(['3x3', '2x3'])('preserves unique clue solutions through every shift (%s)', variant => {
        let state = createSudokuGame({ difficulty: 'hard', variant });
        for (const shift of [shiftRow, shiftCol, shiftBand, shiftStack]) {
            state = shift(state, 0, 1);
            const clues = state.board.map((value, index) => state.givens[index] ? value : 0);
            expect(countSolutions(clues, 2, variant)).toBe(1);
        }
    });
});
