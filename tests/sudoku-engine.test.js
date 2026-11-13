import { describe, it, expect } from 'vitest';
import {
    applyRemoteCellPatch,
    createSudokuGame,
    findConflicts,
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
});

