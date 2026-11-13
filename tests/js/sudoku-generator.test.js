import { describe, it, expect } from 'vitest';
import {
    DIFFICULTY_PRESETS,
    analyzeLogicDifficulty,
    countSolutions,
    generateSolvedBoard,
    generateSudoku,
    solveBoard,
} from '../../resources/js/domain/sudoku-generator.js';

function isValidSolvedBoard(board) {
    if (!Array.isArray(board) || board.length !== 81) return false;
    const expected = '1,2,3,4,5,6,7,8,9';

    for (let r = 0; r < 9; r++) {
        const row = board.slice(r * 9, r * 9 + 9).sort((a, b) => a - b).join(',');
        if (row !== expected) return false;
    }

    for (let c = 0; c < 9; c++) {
        const col = Array.from({ length: 9 }, (_, r) => board[r * 9 + c]).sort((a, b) => a - b).join(',');
        if (col !== expected) return false;
    }

    for (let b = 0; b < 9; b++) {
        const br = Math.floor(b / 3) * 3;
        const bc = (b % 3) * 3;
        const box = [];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                box.push(board[(br + r) * 9 + (bc + c)]);
            }
        }
        if (box.sort((a, b) => a - b).join(',') !== expected) return false;
    }

    return true;
}

describe('Sudoku Generator & Solver', () => {
    it('generates valid complete 9x9 solved boards', () => {
        const board = generateSolvedBoard();
        expect(isValidSolvedBoard(board)).toBe(true);
    });

    it.each(['easy', 'medium', 'hard', 'expert'])('generates unique-solution puzzles for %s difficulty', (difficulty) => {
        const { puzzle, solution, clues } = generateSudoku(difficulty);
        const preset = DIFFICULTY_PRESETS[difficulty];

        expect(isValidSolvedBoard(solution)).toBe(true);
        expect(clues).toBeGreaterThanOrEqual(preset.minClues);
        expect(clues).toBeLessThanOrEqual(preset.maxClues);
        expect(puzzle.filter((v) => v !== 0)).toHaveLength(clues);

        // Guaranteed unique solution matching generated solution
        expect(countSolutions(puzzle, 2)).toBe(1);
        expect(solveBoard(puzzle)).toEqual(solution);
    });

    it('calibrates easy puzzles to be solvable by naked singles', () => {
        const { puzzle } = generateSudoku('easy');
        const analysis = analyzeLogicDifficulty(puzzle, { allowHiddenSingles: false });
        expect(analysis.solved).toBe(true);
    });
});
