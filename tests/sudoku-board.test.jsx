import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SudokuBoard } from '../src/components/SudokuBoard.jsx';
import { SpectatorHintsFeed } from '../src/components/SpectatorHintsFeed.jsx';
import { getSudokuCellAriaLabel } from '../src/utils/aria-helpers.js';
import { createSudokuGame, setCellValue, toggleCellNote } from '../src/domain/sudoku-engine.js';

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

describe('SudokuBoard & SpectatorHintsFeed React components', () => {
    it('builds accessible aria-labels for given, empty, notes, conflict, and hints', () => {
        expect(getSudokuCellAriaLabel(0, 5, { isGiven: true })).toBe('Row 1, Column 1, given 5');
        expect(getSudokuCellAriaLabel(10, 0, {
            notes: [2, 7],
            hint: { topValue: 7 },
        })).toBe('Row 2, Column 2, empty, notes 2, 7, spectator hint 7');
        expect(getSudokuCellAriaLabel(4, 3, { isConflict: true })).toBe('Row 1, Column 5, 3, conflict');
    });

    it('renders 81 cells with user digits, notes, spectator hint badges, and floating reactions', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        puzzle[1] = 0;

        let state = createSudokuGame({ difficulty: 'hard', puzzle, solution: SAMPLE_SOLUTION });
        state = toggleCellNote(state, 1, 3);
        state = setCellValue(state, 0, 5);

        const onCellSelect = vi.fn();
        const hintsByCell = new Map([[1, { index: 1, topValue: 3, count: 2 }]]);

        render(
            <SudokuBoard
                gameState={state}
                selectedIndex={0}
                hintsByCell={hintsByCell}
                floatingReactions={[{ id: 1, emoji: '🔥', left: 50 }]}
                onCellSelect={onCellSelect}
            />,
        );

        const cells = screen.getAllByRole('gridcell');
        expect(cells).toHaveLength(81);
        expect(cells[0]).toHaveClass('sudoku-cell--selected');
        expect(cells[1]).toHaveClass('sudoku-cell--hinted');
        expect(cells[1].querySelector('.sudoku-cell__hint-badge')).toHaveTextContent('3');
        expect(document.querySelector('.floating-emoji')).toHaveTextContent('🔥');

        fireEvent.click(cells[1]);
        expect(onCellSelect).toHaveBeenCalledWith(1);
    });

    it('renders clickable spectator hint chips for players', () => {
        const onApplyHint = vi.fn();
        const hintsByCell = new Map([[12, { index: 12, topValue: 7, count: 2 }]]);

        render(
            <SpectatorHintsFeed
                hintsByCell={hintsByCell}
                canApply
                onSelectHint={vi.fn()}
                onApplyHint={onApplyHint}
            />,
        );

        const chip = screen.getByRole('button', { name: 'R2C4 → 7 ×2' });
        fireEvent.click(chip);
        expect(onApplyHint).toHaveBeenCalledWith(12, 7);
    });

    it('uses roving tabIndex, renders R1-R9/C1-C9 axes, and shows partner digits & cursor in co-op', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        puzzle[1] = 0;
        puzzle[2] = 0;

        let state = createSudokuGame({ difficulty: 'medium', puzzle, solution: SAMPLE_SOLUTION });
        state = setCellValue(state, 0, 5, { owner: 'host' });
        state = setCellValue(state, 1, 3, { owner: 'guest' });

        render(
            <SudokuBoard
                gameState={state}
                selectedIndex={0}
                hintsByCell={new Map()}
                floatingReactions={[]}
                myRole="host"
                partnerCursorIndex={2}
                onCellSelect={vi.fn()}
            />,
        );

        const cells = screen.getAllByRole('gridcell');
        expect(cells[0]).toHaveAttribute('tabindex', '0');
        expect(cells[1]).toHaveAttribute('tabindex', '-1');
        expect(cells[0]).toHaveClass('sudoku-cell--user');
        expect(cells[1]).toHaveClass('sudoku-cell--partner');
        expect(cells[2]).toHaveClass('sudoku-cell--partner-cursor');
        expect(cells[2].querySelector('.sudoku-cell__partner-pip')).not.toBeNull();
        expect(cells[1]).toHaveAttribute('aria-label', expect.stringContaining('by partner'));
        expect(cells[2]).toHaveAttribute('aria-label', expect.stringContaining('partner cursor'));

        expect(document.querySelectorAll('.board-col-axes .board-axis-label')).toHaveLength(9);
        expect(document.querySelectorAll('.board-row-axes .board-axis-label')).toHaveLength(9);
    });
});

