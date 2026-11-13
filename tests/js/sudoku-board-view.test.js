import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SudokuBoardView, getSudokuCellAriaLabel } from '../../resources/js/ui/sudoku-board-view.js';
import { createSudokuGame, setCellValue, toggleCellNote } from '../../resources/js/domain/sudoku-engine.js';

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

describe('SudokuBoardView', () => {
    let boardElement;
    let announcementElement;
    let statusElement;
    let progressElement;
    let onCellSelect;

    beforeEach(() => {
        boardElement = document.createElement('div');
        announcementElement = document.createElement('div');
        statusElement = document.createElement('div');
        progressElement = document.createElement('span');
        onCellSelect = vi.fn();
    });

    it('builds accessible aria-labels for given, empty, notes, conflict, and hints', () => {
        expect(getSudokuCellAriaLabel(0, 5, { isGiven: true })).toBe('Row 1, Column 1, given 5');
        expect(getSudokuCellAriaLabel(10, 0, {
            notes: [2, 7],
            hint: { topValue: 7 },
        })).toBe('Row 2, Column 2, empty, notes 2, 7, spectator hint 7');
        expect(getSudokuCellAriaLabel(4, 3, { isConflict: true })).toBe('Row 1, Column 5, 3, conflict');
    });

    it('creates 81 cells and renders user values, notes, and spectator hint badges', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        puzzle[1] = 0;

        let state = createSudokuGame({ difficulty: 'hard', puzzle, solution: SAMPLE_SOLUTION });
        state = toggleCellNote(state, 1, 3);
        state = setCellValue(state, 0, 3); // Conflicts with nothing? Wait: 3 is at (0, 12..), box/row check

        const view = new SudokuBoardView({
            boardElement,
            announcementElement,
            statusElement,
            progressElement,
            onCellSelect,
        });

        const hintsByCell = new Map([[1, { index: 1, topValue: 3, count: 2 }]]);
        view.render(state, { selectedIndex: 0, hintsByCell });

        const cells = boardElement.querySelectorAll('.sudoku-cell');
        expect(cells).toHaveLength(81);
        expect(cells[0].classList.contains('sudoku-cell--selected')).toBe(true);
        expect(cells[1].classList.contains('sudoku-cell--hinted')).toBe(true);
        expect(cells[1].querySelector('.sudoku-cell__hint-badge').textContent).toBe('3');
        expect(progressElement.textContent).toBe('80/81');

        cells[1].click();
        expect(onCellSelect).toHaveBeenCalledWith(1);
    });
});
