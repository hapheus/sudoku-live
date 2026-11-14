import { describe, it, expect } from 'vitest';
import {
    applyRemoteCellPatch,
    clearAllNotes,
    createSudokuGame,
    detectNewlyCompletedUnits,
    fillCandidateNotes,
    findConflicts,
    findLogicalHint,
    getCandidateDigits,
    hydrateGameState,
    serializeGameState,
    setCellValue,
    toggleCellNote,
    undoLastMove,
} from '../src/domain/sudoku-engine.js';

const SAMPLE_SOLUTION = [
    5, 3, 4, 6, 7, 8, 9, 1, 2,
    6, 7, 2, 1, 9, 5, 3, 4, 8,
    1, 9, 8, 3, 4, 2, 5, 6, 7,
    8, 5, 9, 7, 6, 1, 4, 2, 3,
    4, 2, 6, 8, 5, 3, 7, 9, 1,
    7, 1, 3, 9, 2, 4, 8, 5, 6,
    9, 6, 1, 5, 3, 7, 2, 8, 4,
    2, 8, 7, 4, 1, 9, 6, 3, 5,
    3, 4, 5, 2, 8, 6, 1, 7, 9,
];

describe('Sudoku Engine', () => {
    it('prevents modifying given clue cells', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        const state = createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION });

        expect(() => setCellValue(state, 1, 9)).toThrow('Cannot modify a given clue cell.');
    });

    it('detects row, column, and box conflicts', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        const state = createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION });

        const next = setCellValue(state, 0, 3);
        expect(next.conflicts).toContain(0);
        expect(next.conflicts).toContain(1);
        expect(next.status).toBe('in_progress');
    });

    it('detects solved status when all 81 cells are valid', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        const state = createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION });

        const solved = setCellValue(state, 0, 5);
        expect(solved.conflicts).toEqual([]);
        expect(solved.filledCount).toBe(81);
        expect(solved.status).toBe('solved');
    });

    it('toggles pencil notes and clears matching peer notes when digit is placed', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        puzzle[1] = 0;

        let state = createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION });
        state = toggleCellNote(state, 1, 5);
        state = toggleCellNote(state, 1, 3);
        expect(state.notes[1]).toEqual([3, 5]);

        state = setCellValue(state, 0, 5);
        expect(state.notes[1]).toEqual([3]);
    });

    it('supports undo history and serialization round-trip', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        puzzle[1] = 0;

        let state = createSudokuGame({ difficulty: 'medium', puzzle, solution: SAMPLE_SOLUTION });
        state = setCellValue(state, 0, 5);
        expect(state.board[0]).toBe(5);

        state = undoLastMove(state);
        expect(state.board[0]).toBe(0);

        const remotePatched = applyRemoteCellPatch(state, { index: 1, value: 3, notes: [] });
        expect(remotePatched.board[1]).toBe(3);

        const hydrated = hydrateGameState(serializeGameState(remotePatched));
        expect(hydrated.board).toEqual(remotePatched.board);
        expect(hydrated.difficulty).toBe('medium');
        expect(findConflicts(hydrated.board)).toEqual([]);
    });

    it('tracks cellOwners for co-op moves, undo, remote updates, and serialization', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        puzzle[1] = 0;

        let state = createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION });
        expect(state.cellOwners).toHaveLength(81);

        state = setCellValue(state, 0, 5, { owner: 'host' });
        expect(state.cellOwners[0]).toBe('host');

        state = undoLastMove(state);
        expect(state.cellOwners[0]).toBeNull();

        state = applyRemoteCellPatch(state, { index: 1, value: 3, notes: [], owner: 'guest' });
        expect(state.cellOwners[1]).toBe('guest');

        const hydrated = hydrateGameState(serializeGameState(state));
        expect(hydrated.cellOwners[1]).toBe('guest');
        expect(hydrated.cellOwners[0]).toBeNull();
    });

    it('computes valid candidates and supports undoable fillCandidateNotes / clearAllNotes', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0; // only valid candidate is 5 (3 is already in col 0)
        puzzle[1] = 0; // only valid candidate is 3 (5 is already in col 1)

        let state = createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION });
        expect(getCandidateDigits(state.board, 0)).toEqual([5]);
        expect(getCandidateDigits(state.board, 1)).toEqual([3]);

        state = fillCandidateNotes(state);
        expect(state.notes[0]).toEqual([5]);
        expect(state.notes[1]).toEqual([3]);

        state = clearAllNotes(state);
        expect(state.notes[0]).toEqual([]);

        state = undoLastMove(state);
        expect(state.notes[0]).toEqual([5]);
    });

    it('supports 2x3 (6x6) Sudoku boards, box conflicts, 36-cell completion, and serialization', () => {
        const solution2x3 = [
            1, 2, 3, 4, 5, 6,
            4, 5, 6, 1, 2, 3,
            2, 3, 1, 6, 4, 5,
            5, 6, 4, 2, 3, 1,
            3, 1, 2, 5, 6, 4,
            6, 4, 5, 3, 1, 2,
        ];
        const puzzle2x3 = [...solution2x3];
        puzzle2x3[0] = 0; // solution 1
        puzzle2x3[8] = 0; // solution 6

        let state = createSudokuGame({
            difficulty: 'easy',
            variant: '2x3',
            puzzle: puzzle2x3,
            solution: solution2x3,
        });
        expect(state.variant).toBe('2x3');
        expect(state.gridSize).toBe(6);
        expect(state.totalCells).toBe(36);
        expect(state.maxDigit).toBe(6);
        expect(getCandidateDigits(state.board, 0, '2x3')).toEqual([1]);

        expect(() => setCellValue(state, 0, 7)).toThrow('Invalid digit 7. Must be 0..6.');

        // Placing 5 in cell 0 conflicts in row 0 (idx 4), box 0 (idx 7), and col 0 (idx 18)
        const conflicted = setCellValue(state, 0, 5);
        expect(conflicted.conflicts).toEqual([0, 4, 7, 18]);

        state = setCellValue(state, 0, 1);
        state = setCellValue(state, 8, 6);
        expect(state.filledCount).toBe(36);
        expect(state.status).toBe('solved');

        const hydrated = hydrateGameState(serializeGameState(state));
        expect(hydrated.variant).toBe('2x3');
        expect(hydrated.gridSize).toBe(6);
        expect(hydrated.totalCells).toBe(36);
        expect(hydrated.status).toBe('solved');
    });

    it('detects newly completed rows, columns, and boxes without re-triggering already completed or conflicted units', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0; // row 0, col 0, box 0
        puzzle[10] = 0; // row 1, col 1, box 0

        const state0 = createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION });

        // Wrong digit in cell 0 creates conflicts in row 0, col 0, and box 0 -> must NOT celebrate
        const conflicted = setCellValue(state0, 0, 3);
        const conflictCheck = detectNewlyCompletedUnits(state0.board, conflicted.board, '3x3', 0);
        expect(conflictCheck.hasAny).toBe(false);
        expect(conflictCheck.cellDelays.size).toBe(0);

        // Correct digit in cell 0 completes row 0 and col 0 (box 0 still missing idx 10)
        const step1 = setCellValue(state0, 0, 5);
        const res1 = detectNewlyCompletedUnits(state0.board, step1.board, '3x3', 0);
        expect(res1.hasAny).toBe(true);
        expect(res1.rows).toEqual([0]);
        expect(res1.cols).toEqual([0]);
        expect(res1.boxes).toEqual([]);
        expect(res1.cellDelays.get(0)).toBe(0);
        expect(res1.cellDelays.get(8)).toBe(8 * 28);
        expect(res1.cellDelays.has(10)).toBe(false);

        // Next move fills idx 10 -> completes row 1, col 1, box 0, does NOT re-trigger row 0 or col 0
        const step2 = setCellValue(step1, 10, 7);
        const res2 = detectNewlyCompletedUnits(step1.board, step2.board, '3x3', 10);
        expect(res2.hasAny).toBe(true);
        expect(res2.rows).toEqual([1]);
        expect(res2.cols).toEqual([1]);
        expect(res2.boxes).toEqual([0]);
        expect(res2.cellDelays.get(10)).toBe(0);
        expect(res2.cellDelays.has(8)).toBe(false);
    });

    it('detects newly completed 2x3 boxes properly', () => {
        const solution2x3 = [
            1, 2, 3, 4, 5, 6,
            4, 5, 6, 1, 2, 3,
            2, 3, 1, 6, 4, 5,
            5, 6, 4, 2, 3, 1,
            3, 1, 2, 5, 6, 4,
            6, 4, 5, 3, 1, 2,
        ];
        const puzzle2x3 = [...solution2x3];
        puzzle2x3[0] = 0; // box 0
        puzzle2x3[5] = 0; // row 0 open
        puzzle2x3[18] = 0; // col 0 open

        const state0 = createSudokuGame({ difficulty: 'easy', variant: '2x3', puzzle: puzzle2x3, solution: solution2x3 });
        const step1 = setCellValue(state0, 0, 1);
        const res = detectNewlyCompletedUnits(state0.board, step1.board, '2x3', 0);

        expect(res.rows).toEqual([]);
        expect(res.cols).toEqual([]);
        expect(res.boxes).toEqual([0]);
        expect(Array.from(res.cellDelays.keys()).sort((a, b) => a - b)).toEqual([0, 1, 2, 6, 7, 8]);
    });

    it('findLogicalHint prioritizes Full House and highlights the completed unit', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0; // col 0 has 1 empty (idx 0 -> 5)
        // Clear 2x2 block in box 0 so box 0, rows 0-1, cols 1-2 each have >=2 empties
        puzzle[1] = 0;
        puzzle[2] = 0;
        puzzle[10] = 0;
        puzzle[11] = 0;

        const state = createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION });
        const hint = findLogicalHint(state);

        expect(hint).not.toBeNull();
        expect(hint.technique).toBe('full_house');
        expect(hint.unitType).toBe('col');
        expect(hint.index).toBe(0);
        expect(hint.digit).toBe(5);
        expect(hint.contextDelays.get(0)).toBe(0);
        // Full column 0 (indices 0, 9, 18, ..., 72) is included in contextDelays
        expect(Array.from(hint.contextDelays.keys()).sort((a, b) => a - b)).toEqual([0, 9, 18, 27, 36, 45, 54, 63, 72]);
    });

    it('findLogicalHint finds Hidden Single with unit and blocking peers when no Full House exists', () => {
        const solution2x3 = [
            1, 2, 3, 4, 5, 6,
            4, 5, 6, 1, 2, 3,
            2, 3, 1, 6, 4, 5,
            5, 6, 4, 2, 3, 1,
            3, 1, 2, 5, 6, 4,
            6, 4, 5, 3, 1, 2,
        ];
        const puzzle2x3 = [...solution2x3];
        // Leave >=2 empty cells in every non-full unit so no Full House exists
        for (const idx of [0, 7, 3, 11, 12, 16, 19, 22, 25, 28, 30, 33, 35]) {
            puzzle2x3[idx] = 0;
        }

        const state = createSudokuGame({
            difficulty: 'medium',
            variant: '2x3',
            puzzle: puzzle2x3,
            solution: solution2x3,
        });
        const hint = findLogicalHint(state);

        expect(hint).not.toBeNull();
        expect(hint.technique).toBe('hidden_single');
        expect(hint.unitType).toBe('box');
        expect(hint.index).toBe(0);
        expect(hint.digit).toBe(1);
        expect(hint.contextDelays.get(0)).toBe(0);
        // Box 0 cells + blocking peer index 9 (digit 1 in row 1) are highlighted
        expect(hint.contextDelays.has(7)).toBe(true);
        expect(hint.contextDelays.has(9)).toBe(true);
    });

    it('findLogicalHint finds Naked Single with filled peers when no Full House or Hidden Single exists', () => {
        const solution2x3 = [
            1, 2, 3, 4, 5, 6,
            4, 5, 6, 1, 2, 3,
            2, 3, 1, 6, 4, 5,
            5, 6, 4, 2, 3, 1,
            3, 1, 2, 5, 6, 4,
            6, 4, 5, 3, 1, 2,
        ];
        const puzzle2x3 = Array(36).fill(0);
        puzzle2x3[6] = 4;
        puzzle2x3[7] = 5;
        puzzle2x3[8] = 6;
        puzzle2x3[12] = 2;
        puzzle2x3[24] = 3;

        const state = createSudokuGame({
            difficulty: 'hard',
            variant: '2x3',
            puzzle: puzzle2x3,
            solution: solution2x3,
        });
        const hint = findLogicalHint(state);

        expect(hint).not.toBeNull();
        expect(hint.technique).toBe('naked_single');
        expect(hint.unitType).toBe('cell');
        expect(hint.index).toBe(0);
        expect(hint.digit).toBe(1);
        expect(Array.from(hint.contextDelays.keys()).sort((a, b) => a - b)).toEqual([0, 6, 7, 8, 12, 24]);
    });

    it('findLogicalHint ignores deductions poisoned by wrong user entries and falls back cleanly when needed', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0; // sol 5
        puzzle[1] = 0; // sol 3
        puzzle[80] = 0; // sol 9

        // Enter wrong digit in cell 1 (5 instead of 3): poisons col 0? No, wait: poisons box 0 and row 0!
        // Put wrong digit in row 0 / box 0 (idx 1 = 9) so col 0 is still clean, OR put wrong digit in col 0 (idx 9 = 9)
        const base = createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION });
        // Test pure fallback on an empty puzzle (all 81 candidates open)
        const emptyPuzzle = Array(81).fill(0);
        const emptyState = createSudokuGame({ difficulty: 'hard', puzzle: emptyPuzzle, solution: SAMPLE_SOLUTION });
        const fallbackHint = findLogicalHint(emptyState, { preferredIndex: 10 });

        expect(fallbackHint).not.toBeNull();
        expect(fallbackHint.technique).toBe('fallback');
        expect(fallbackHint.index).toBe(10);
        expect(fallbackHint.digit).toBe(SAMPLE_SOLUTION[10]);
        expect(Array.from(fallbackHint.contextDelays.keys())).toEqual([10]);

        // Test wrong user entry blocking a unit: clear idx 9 (col 0) and put wrong digit in idx 9
        const puzzleWrong = [...SAMPLE_SOLUTION];
        puzzleWrong[0] = 0; // sol 5
        puzzleWrong[9] = 0; // sol 6
        // With idx 0 and idx 9 empty: box 0 has 1 empty (idx 0), row 0 has 1 empty (idx 0), col 0 has 2 empties (0, 9).
        // Put wrong digit 1 into idx 9 -> now box 0 and row 0 still have clean units, while col 0 has a wrong entry!
        // Also clear idx 1 and idx 18 so ONLY col 0 looks like a Full House if idx 9 were trusted? Wait:
        // If idx 9 has wrong digit 5 (same as solution[0]), then col 0 is NOT valid, AND missing digit in col 0 wouldn't be 5!
        const puzzlePoison = [...SAMPLE_SOLUTION];
        puzzlePoison[0] = 0; // sol 5
        puzzlePoison[1] = 0; // sol 3
        puzzlePoison[9] = 0; // sol 6
        let poisonedState = createSudokuGame({ difficulty: 'easy', puzzle: puzzlePoison, solution: SAMPLE_SOLUTION });
        poisonedState = setCellValue(poisonedState, 9, 4); // wrong value in col 0
        // Col 0 now has 1 empty cell (idx 0), missing digit 5? No, col 0 has 4 twice so used.size < 8 and cell 9 != solution[9].
        // So col 0 must NOT produce a full_house on idx 0!
        const hintFromPoisoned = findLogicalHint(poisonedState);
        // Either finds a valid non-poisoned deduction (e.g. hidden/naked single on box 0 or row 0) or fallback, never trusting wrong cell 9
        expect(hintFromPoisoned.contextDelays.has(9)).toBe(false);
        expect(base.status).toBe('in_progress');
    });
});

