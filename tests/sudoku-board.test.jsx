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

    it('highlights all matching digits and matching pencil notes when activeDigit is locked', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0; // solution is 5
        puzzle[1] = 0; // solution is 3

        let state = createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION });
        state = toggleCellNote(state, 0, 5);
        state = toggleCellNote(state, 0, 3);

        render(
            <SudokuBoard
                gameState={state}
                selectedIndex={null}
                activeDigit={5}
                hintsByCell={new Map()}
                floatingReactions={[]}
                onCellSelect={vi.fn()}
            />,
        );

        const cells = screen.getAllByRole('gridcell');
        const highlightedSameDigits = cells.filter((c) => c.classList.contains('sudoku-cell--same-digit'));
        // There are 8 remaining 5s in the grid since cell 0 is empty
        expect(highlightedSameDigits).toHaveLength(8);
        const matchedNotes = cells[0].querySelectorAll('.sudoku-cell__note--match');
        expect(matchedNotes).toHaveLength(1);
        expect(matchedNotes[0]).toHaveTextContent('5');
    });

    it('renders 2x3 (6x6) grid with 36 cells, R1-R6/C1-C6 axes, and 2x3 box borders', () => {
        const solution2x3 = [
            1, 2, 3, 4, 5, 6,
            4, 5, 6, 1, 2, 3,
            2, 3, 1, 6, 4, 5,
            5, 6, 4, 2, 3, 1,
            3, 1, 2, 5, 6, 4,
            6, 4, 5, 3, 1, 2,
        ];
        const puzzle2x3 = [...solution2x3];
        puzzle2x3[0] = 0;

        let state = createSudokuGame({ difficulty: 'medium', variant: '2x3', puzzle: puzzle2x3, solution: solution2x3 });
        state = toggleCellNote(state, 0, 1);

        render(
            <>
                <SudokuBoard
                    gameState={state}
                    selectedIndex={0}
                    hintsByCell={new Map()}
                    floatingReactions={[]}
                    onCellSelect={vi.fn()}
                />
                <SpectatorHintsFeed
                    hintsByCell={new Map([[14, { index: 14, topValue: 1, count: 1 }]])}
                    variant="2x3"
                    canApply={false}
                    onSelectHint={vi.fn()}
                    onApplyHint={vi.fn()}
                />
            </>,
        );

        const cells = screen.getAllByRole('gridcell');
        expect(cells).toHaveLength(36);
        expect(cells[2]).toHaveClass('sudoku-cell--box-right');
        expect(cells[6]).toHaveClass('sudoku-cell--box-bottom');
        expect(cells[0].querySelectorAll('.sudoku-cell__notes--2x3 .sudoku-cell__note')).toHaveLength(6);
        expect(document.querySelectorAll('.board-col-axes .board-axis-label')).toHaveLength(6);
        expect(document.querySelectorAll('.board-row-axes .board-axis-label')).toHaveLength(6);
        expect(screen.getByRole('button', { name: 'R3C3 → 1' })).toBeInTheDocument();
    });

    it('renders unit completion reward overlay with staggered delay for celebrating cells', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        const state = setCellValue(createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION }), 0, 5);
        const cellDelays = new Map([[0, 0], [1, 28], [2, 56]]);

        render(
            <SudokuBoard
                gameState={state}
                selectedIndex={0}
                hintsByCell={new Map()}
                floatingReactions={[]}
                unitCelebration={{ id: 1, cellDelays }}
                onCellSelect={vi.fn()}
            />,
        );

        const cells = screen.getAllByRole('gridcell');
        expect(cells[0]).toHaveClass('sudoku-cell--unit-complete');
        expect(cells[1]).toHaveClass('sudoku-cell--unit-complete');
        expect(cells[3]).not.toHaveClass('sudoku-cell--unit-complete');
        const overlay = cells[2].querySelector('.sudoku-cell__celebrate');
        expect(overlay).not.toBeNull();
        expect(overlay.style.getPropertyValue('--complete-delay')).toBe('56ms');
    });

    it('renders logical hint target and context highlight overlays with staggered --hint-delay', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        const state = setCellValue(createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION }), 0, 5);
        const contextDelays = new Map([[0, 0], [1, 28], [9, 28], [10, 56]]);

        const { rerender } = render(
            <SudokuBoard
                gameState={state}
                selectedIndex={0}
                hintsByCell={new Map()}
                floatingReactions={[]}
                hintHighlight={{ id: 3, mode: 'preview', targetIndex: 0, contextDelays }}
                onCellSelect={vi.fn()}
            />,
        );

        const cells = screen.getAllByRole('gridcell');
        expect(cells[0]).toHaveClass('sudoku-cell--hint-target', 'sudoku-cell--hint-preview');
        expect(cells[0]).not.toHaveClass('sudoku-cell--hint-context');
        expect(cells[1]).toHaveClass('sudoku-cell--hint-context', 'sudoku-cell--hint-preview');
        expect(cells[10]).toHaveClass('sudoku-cell--hint-context', 'sudoku-cell--hint-preview');
        expect(cells[3]).not.toHaveClass('sudoku-cell--hint-context');

        const targetFlash = cells[0].querySelector('.sudoku-cell__hint-flash--target');
        expect(targetFlash).not.toBeNull();
        expect(targetFlash.style.getPropertyValue('--hint-delay')).toBe('0ms');

        const contextFlash = cells[10].querySelector('.sudoku-cell__hint-flash');
        expect(contextFlash).not.toBeNull();
        expect(contextFlash).not.toHaveClass('sudoku-cell__hint-flash--target');
        expect(contextFlash.style.getPropertyValue('--hint-delay')).toBe('56ms');

        rerender(
            <SudokuBoard
                gameState={state}
                selectedIndex={0}
                hintsByCell={new Map()}
                floatingReactions={[]}
                hintHighlight={{ id: 4, mode: 'solve', targetIndex: 0, contextDelays }}
                onCellSelect={vi.fn()}
            />,
        );
        expect(screen.getAllByRole('gridcell')[0]).toHaveClass('sudoku-cell--hint-target');
        expect(screen.getAllByRole('gridcell')[0]).not.toHaveClass('sudoku-cell--hint-preview');
    });

    it('renders playerCursorIndex crosshair, player pip, aria-label, and same-digit highlights when spectator has no local selection', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[2] = 0; // empty cell for guest/partner cursor
        const state = createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION });
        // Cell 0 is a given 5 (row 0, col 0, box 0)
        render(
            <SudokuBoard
                gameState={state}
                selectedIndex={null}
                hintsByCell={new Map()}
                floatingReactions={[]}
                myRole="spectator"
                playerCursorIndex={0}
                partnerCursorIndex={2}
                onCellSelect={vi.fn()}
            />,
        );

        const cells = screen.getAllByRole('gridcell');
        expect(cells[0]).toHaveClass('sudoku-cell--player-cursor');
        expect(cells[0]).not.toHaveClass('sudoku-cell--peer');
        expect(cells[0].querySelector('.sudoku-cell__player-pip')).not.toBeNull();
        expect(cells[0]).toHaveAttribute('aria-label', expect.stringContaining('player cursor'));

        // Partner cursor coexists cleanly
        expect(cells[2]).toHaveClass('sudoku-cell--partner-cursor', 'sudoku-cell--peer');
        expect(cells[2].querySelector('.sudoku-cell__partner-pip')).not.toBeNull();

        // Crosshair peers from playerCursorIndex (row 0, col 0, box 0)
        expect(cells[8]).toHaveClass('sudoku-cell--peer'); // same row
        expect(cells[72]).toHaveClass('sudoku-cell--peer'); // same col
        expect(cells[10]).toHaveClass('sudoku-cell--peer'); // same box
        expect(cells[40]).not.toHaveClass('sudoku-cell--peer'); // outside

        // All other cells with digit 5 highlight as same-digit based on host's focused cell
        const sameDigitCells = cells.filter((c) => c.classList.contains('sudoku-cell--same-digit'));
        expect(sameDigitCells).toHaveLength(8);
    });

    it('renders multiple partner cursors simultaneously via partnerCursorIndices', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[2] = 0;
        puzzle[10] = 0;
        const state = createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION });

        render(
            <SudokuBoard
                gameState={state}
                selectedIndex={null}
                hintsByCell={new Map()}
                floatingReactions={[]}
                myRole="spectator"
                playerCursorIndex={0}
                partnerCursorIndices={[2, 10]}
                onCellSelect={vi.fn()}
            />,
        );

        const cells = screen.getAllByRole('gridcell');
        expect(cells[0]).toHaveClass('sudoku-cell--player-cursor');
        expect(cells[2]).toHaveClass('sudoku-cell--partner-cursor');
        expect(cells[10]).toHaveClass('sudoku-cell--partner-cursor');
        expect(cells[2].querySelector('.sudoku-cell__partner-pip')).not.toBeNull();
        expect(cells[10].querySelector('.sudoku-cell__partner-pip')).not.toBeNull();
    });
});

