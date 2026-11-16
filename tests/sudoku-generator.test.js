import { describe, it, expect } from 'vitest';
import {
    DIFFICULTY_PRESETS,
    SUDOKU_VARIANTS,
    analyzeLogicDifficulty,
    countSolutions,
    generateSolvedBoard,
    generateSudoku,
    isSolvable,
    isValidSolvedBoard,
    solveBoard,
    verifyGeneratedPuzzle,
} from '../src/domain/sudoku-generator.js';

function isValidCompleteSudoku(board) {
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

function isValidComplete2x3Sudoku(board) {
    if (!Array.isArray(board) || board.length !== 36) return false;
    const expected = '1,2,3,4,5,6';

    for (let r = 0; r < 6; r++) {
        const row = board.slice(r * 6, r * 6 + 6).sort((a, b) => a - b).join(',');
        if (row !== expected) return false;
    }

    for (let c = 0; c < 6; c++) {
        const col = Array.from({ length: 6 }, (_, r) => board[r * 6 + c]).sort((a, b) => a - b).join(',');
        if (col !== expected) return false;
    }

    for (let b = 0; b < 6; b++) {
        const br = Math.floor(b / 2) * 2;
        const bc = (b % 2) * 3;
        const box = [];
        for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 3; c++) {
                box.push(board[(br + r) * 6 + (bc + c)]);
            }
        }
        if (box.sort((a, b) => a - b).join(',') !== expected) return false;
    }

    return true;
}

describe('Sudoku Generator & Solver', () => {
    it('generates valid complete 9x9 solved boards', () => {
        const board = generateSolvedBoard();
        expect(isValidCompleteSudoku(board)).toBe(true);
        expect(isValidSolvedBoard(board)).toBe(true);
    });

    it('generates valid complete 2x3 (6x6) solved boards', () => {
        const board = generateSolvedBoard(Math.random, '2x3');
        expect(isValidComplete2x3Sudoku(board)).toBe(true);
        expect(isValidSolvedBoard(board, '2x3')).toBe(true);
    });

    it.each(['easy', 'medium', 'hard', 'expert'])('generates unique-solution 3x3 puzzles for %s difficulty', (difficulty) => {
        const { puzzle, solution, clues, variant } = generateSudoku(difficulty);
        const preset = DIFFICULTY_PRESETS[difficulty];

        expect(variant).toBe('3x3');
        expect(isValidCompleteSudoku(solution)).toBe(true);
        expect(clues).toBeGreaterThanOrEqual(preset.minClues);
        expect(clues).toBeLessThan(puzzle.length);
        expect(puzzle.filter((v) => v !== 0)).toHaveLength(clues);

        expect(countSolutions(puzzle, 2)).toBe(1);
        expect(isSolvable(puzzle, { requireUnique: true })).toBe(true);
        expect(verifyGeneratedPuzzle(puzzle, solution)).toBe(true);
        expect(solveBoard(puzzle)).toEqual(solution);
    });

    it.each(['easy', 'medium', 'hard', 'expert'])('generates unique-solution 2x3 (6x6) puzzles for %s difficulty', (difficulty) => {
        const { puzzle, solution, clues, variant } = generateSudoku(difficulty, Math.random, '2x3');
        const preset = SUDOKU_VARIANTS['2x3'].presets[difficulty];

        expect(variant).toBe('2x3');
        expect(isValidComplete2x3Sudoku(solution)).toBe(true);
        expect(clues).toBeGreaterThanOrEqual(preset.minClues);
        expect(clues).toBeLessThan(puzzle.length);
        expect(puzzle.filter((v) => v !== 0)).toHaveLength(clues);

        expect(countSolutions(puzzle, 2, '2x3')).toBe(1);
        expect(isSolvable(puzzle, { requireUnique: true, variant: '2x3' })).toBe(true);
        expect(verifyGeneratedPuzzle(puzzle, solution, '2x3')).toBe(true);
        expect(solveBoard(puzzle, '2x3')).toEqual(solution);
    });

    it('guarantees solvability across multiple generated boards per difficulty', () => {
        for (const difficulty of ['easy', 'medium', 'hard', 'expert']) {
            for (let run = 0; run < 5; run++) {
                const { puzzle, solution } = generateSudoku(difficulty);
                expect(verifyGeneratedPuzzle(puzzle, solution)).toBe(true);
                expect(countSolutions(puzzle, 2)).toBe(1);
                expect(solveBoard(puzzle)).toEqual(solution);
            }
        }
    });

    it('rejects unsolvable, conflicted, and ambiguous boards in solvability checks', () => {
        const unsolvableWithoutDirectDuplicates = Array(81).fill(0);
        // Row 0 already has 1..8, while cell (0,8) sees 9 in column 8 -> dead end
        for (let c = 0; c < 8; c++) {
            unsolvableWithoutDirectDuplicates[c] = c + 1;
        }
        unsolvableWithoutDirectDuplicates[9 * 8 + 8] = 9;

        expect(solveBoard(unsolvableWithoutDirectDuplicates)).toBeNull();
        expect(countSolutions(unsolvableWithoutDirectDuplicates, 2)).toBe(0);
        expect(isSolvable(unsolvableWithoutDirectDuplicates)).toBe(false);

        const emptyBoard = Array(81).fill(0);
        expect(isSolvable(emptyBoard)).toBe(true);
        expect(isSolvable(emptyBoard, { requireUnique: true })).toBe(false);

        const { puzzle, solution } = generateSudoku('easy');
        const mismatchedSolution = [...solution];
        const firstEmptyOrSwap = [mismatchedSolution[0], mismatchedSolution[1]];
        mismatchedSolution[0] = firstEmptyOrSwap[1];
        mismatchedSolution[1] = firstEmptyOrSwap[0];
        expect(verifyGeneratedPuzzle(puzzle, mismatchedSolution)).toBe(false);
    });

    it('calibrates easy puzzles to be solvable by naked singles', () => {
        const { puzzle } = generateSudoku('easy');
        const analysis = analyzeLogicDifficulty(puzzle, { allowHiddenSingles: false });
        expect(analysis.solved).toBe(true);
    });
});
