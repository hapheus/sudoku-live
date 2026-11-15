import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlayerControls } from '../src/components/PlayerControls.jsx';
import { SudokuBoard } from '../src/components/SudokuBoard.jsx';
import { createSudokuGame } from '../src/domain/sudoku-engine.js';

describe('Easter Eggs UI (Retro Mode & Fist Bump)', () => {
    it('morphs shift arrows into A/B/C/D during konami ab phase and shows dynamic Back to <year> in retro mode', () => {
        const onKonamiButton = vi.fn();
        const onExitRetro = vi.fn();
        const messages = {
            shiftLabel: 'Shift',
            konamiAbPrompt: 'Code',
            retroLabel: '1981',
            retroBackToYear: 'Back to {year}',
        };

        const { rerender } = render(
            <PlayerControls
                board={Array(81).fill(0)}
                maxDigit={9}
                notesMode={false}
                canErase={false}
                canUndo={false}
                canShift
                isSolved={false}
                onDigitSelect={vi.fn()}
                onErase={vi.fn()}
                onToggleNotes={vi.fn()}
                onUndo={vi.fn()}
                onShiftRow={vi.fn()}
                onShiftCol={vi.fn()}
                konamiPhase="ab"
                onKonamiButton={onKonamiButton}
                messages={messages}
            />,
        );

        expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'C' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'D' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'B' }));
        expect(onKonamiButton).toHaveBeenCalledWith('B');

        rerender(
            <PlayerControls
                board={Array(81).fill(0)}
                maxDigit={9}
                notesMode={false}
                canErase={false}
                canUndo={false}
                canShift
                isSolved={false}
                onDigitSelect={vi.fn()}
                onErase={vi.fn()}
                onToggleNotes={vi.fn()}
                onUndo={vi.fn()}
                onShiftRow={vi.fn()}
                onShiftCol={vi.fn()}
                isRetroMode
                retroYear={2027}
                onExitRetro={onExitRetro}
                messages={messages}
            />,
        );

        expect(screen.queryByRole('button', { name: 'Shift row up' })).not.toBeInTheDocument();
        const exitBtn = screen.getByRole('button', { name: 'Back to 2027' });
        fireEvent.click(exitBtn);
        expect(onExitRetro).toHaveBeenCalledTimes(1);
    });

    it('renders the fist bump emoji and phrase on the target cell in SudokuBoard', () => {
        const gameState = createSudokuGame('easy', '2x3');
        const { container } = render(
            <SudokuBoard
                gameState={gameState}
                selectedIndex={null}
                hintsByCell={new Map()}
                floatingReactions={[]}
                cellRefs={{ current: [] }}
                onCellSelect={vi.fn()}
                fistBump={{ id: 1, index: 5, phraseKey: 'fistBumpAmazing' }}
                messages={{ fistBumpAmazing: 'Amazing!' }}
            />,
        );

        const targetCell = container.querySelector('[data-index="5"]');
        expect(targetCell).toHaveClass('sudoku-cell--fist-bump');
        expect(targetCell).toHaveTextContent('🤜🤛');
        expect(targetCell).toHaveTextContent('Amazing!');
    });
});
