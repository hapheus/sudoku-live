import React from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ModeTabs } from '../src/components/ModeTabs.jsx';
import { DifficultySelector } from '../src/components/DifficultySelector.jsx';
import { OnlineInviteBox } from '../src/components/OnlineInviteBox.jsx';
import { StatusBanner } from '../src/components/StatusBanner.jsx';
import { PlayerControls } from '../src/components/PlayerControls.jsx';
import { WatcherInteractions } from '../src/components/WatcherInteractions.jsx';
import { HelpDialog } from '../src/components/HelpDialog.jsx';
import { SolveSummary } from '../src/components/SolveSummary.jsx';
import { createSudokuGame, setCellValue } from '../src/domain/sudoku-engine.js';
import {
    clearSoloGameSnapshot,
    loadSoloGameSnapshot,
    saveSoloGameSnapshot,
} from '../src/services/online-state-storage.js';

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

describe('UI/UX components & Solo persistence', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('supports WAI-ARIA arrow-key navigation and roving tabIndex in ModeTabs', () => {
        const onSelectMode = vi.fn();
        render(<ModeTabs mode="solo" onSelectMode={onSelectMode} />);

        const soloTab = screen.getByRole('tab', { name: 'Solo' });
        const onlineTab = screen.getByRole('tab', { name: 'Online Co-op' });
        const watchTab = screen.getByRole('tab', { name: 'Watch Live' });

        expect(soloTab).toHaveAttribute('tabindex', '0');
        expect(onlineTab).toHaveAttribute('tabindex', '-1');
        expect(watchTab).toHaveAttribute('tabindex', '-1');

        fireEvent.keyDown(soloTab, { key: 'ArrowRight' });
        expect(onSelectMode).toHaveBeenCalledWith('online');

        fireEvent.keyDown(soloTab, { key: 'End' });
        expect(onSelectMode).toHaveBeenCalledWith('watch');
    });

    it('renders DifficultySelector as segmented pills and emits changes', () => {
        const onChange = vi.fn();
        render(<DifficultySelector difficulty="medium" onChange={onChange} />);

        const hardRadio = screen.getByRole('radio', { name: 'Hard' });
        fireEvent.click(hardRadio);
        expect(onChange).toHaveBeenCalledWith('hard');
    });

    it('collapses OnlineInviteBox once a co-op partner connects and toggles URL visibility', () => {
        const { rerender } = render(<OnlineInviteBox inviteUrl="https://example.com/games/abc" partnerOnline={false} />);
        expect(screen.getByLabelText('Invitation link')).toBeInTheDocument();

        rerender(<OnlineInviteBox inviteUrl="https://example.com/games/abc" partnerOnline />);
        expect(screen.queryByLabelText('Invitation link')).not.toBeInTheDocument();
        expect(screen.getByText('Partner connected')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Show URL' }));
        expect(screen.getByLabelText('Invitation link')).toBeInTheDocument();
    });

    it('hides connection/Live Watch Ready chrome in Solo mode and avoids duplicate filledCount', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        const gameState = createSudokuGame({ difficulty: 'easy', puzzle, solution: SAMPLE_SOLUTION });

        render(
            <StatusBanner
                connectionStatus="connected"
                mode="solo"
                isSpectating={false}
                myRole="host"
                currentMembers={[]}
                spectatedGameMode={null}
                gameState={gameState}
                onReconnect={vi.fn()}
            />,
        );

        expect(screen.queryByText('Live Watch Ready')).not.toBeInTheDocument();
        expect(document.getElementById('connection-status')).toBeNull();
        expect(document.getElementById('game-status-text')).toHaveTextContent('Easy • Solo');
        expect(document.getElementById('sudoku-progress')).toHaveTextContent('80/81');
    });

    it('renders Reconnect button and You/Partner legend in disconnected Online Co-op mode', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        const gameState = createSudokuGame({ difficulty: 'medium', puzzle, solution: SAMPLE_SOLUTION });
        const onReconnect = vi.fn();

        render(
            <StatusBanner
                connectionStatus="failed"
                mode="online"
                isSpectating={false}
                myRole="host"
                currentMembers={[{ id: '1', role: 'host' }]}
                spectatedGameMode={null}
                gameState={gameState}
                onReconnect={onReconnect}
            />,
        );

        expect(screen.getByText('You')).toBeInTheDocument();
        expect(screen.getByText('Partner')).toBeInTheDocument();
        const retryBtn = screen.getByRole('button', { name: 'Reconnect' });
        fireEvent.click(retryBtn);
        expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('disables completed digits outside notes mode and highlights activeDigit in PlayerControls', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0; // Digit 5 has 8 remaining; all other digits 1..4,6..9 have 9 placed (complete)

        render(
            <PlayerControls
                board={puzzle}
                notesMode={false}
                canUndo={false}
                activeDigit={5}
                isSolved={false}
                onUndo={vi.fn()}
                onErase={vi.fn()}
                onToggleNotes={vi.fn()}
                onLocalHint={vi.fn()}
                onDigit={vi.fn()}
            />,
        );

        const btn1 = screen.getByRole('button', { name: '1, all 9 placed' });
        const btn5 = screen.getByRole('button', { name: 'Enter 5, 1 remaining' });

        expect(btn1).toBeDisabled();
        expect(btn5).not.toBeDisabled();
        expect(btn5).toHaveClass('numpad-btn--active');
        expect(btn5).toHaveAttribute('aria-pressed', 'true');
    });

    it('uses a 9-column spectator pad and disables digits when a filled cell is selected', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;

        const { rerender } = render(
            <WatcherInteractions
                selectedIndex={0}
                board={puzzle}
                onSendHint={vi.fn()}
                onSendReaction={vi.fn()}
            />,
        );

        expect(document.querySelectorAll('.spectator-pad__digits .spectator-pad__btn')).toHaveLength(9);
        expect(screen.getByRole('button', { name: 'Suggest digit 5' })).not.toBeDisabled();

        rerender(
            <WatcherInteractions
                selectedIndex={1}
                board={puzzle}
                onSendHint={vi.fn()}
                onSendReaction={vi.fn()}
            />,
        );
        expect(screen.getByRole('button', { name: 'Suggest digit 5' })).toBeDisabled();
    });

    it('opens HelpDialog and closes on Escape key, and renders SolveSummary CTA', () => {
        const onClose = vi.fn();
        const onPlayAgain = vi.fn();

        render(
            <>
                <HelpDialog isOpen onClose={onClose} />
                <SolveSummary
                    difficulty="hard"
                    elapsedSeconds={125}
                    mode="online"
                    isSpectating={false}
                    restartLabel="New Puzzle"
                    restartDisabled={false}
                    onPlayAgain={onPlayAgain}
                />
            </>,
        );

        expect(screen.getByRole('dialog', { name: 'How to Play & Shortcuts' })).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);

        expect(screen.getByText('Hard Co-op finished in 02:05')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));
        expect(onPlayAgain).toHaveBeenCalledTimes(1);
    });

    it('persists and restores Solo puzzle progress in localStorage', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        let state = createSudokuGame({ difficulty: 'hard', puzzle, solution: SAMPLE_SOLUTION });
        state = setCellValue(state, 0, 5);
        state.elapsedSeconds = 42;

        saveSoloGameSnapshot(state, 'solo-room-1');
        const loaded = loadSoloGameSnapshot();
        expect(loaded.roomId).toBe('solo-room-1');
        expect(loaded.gameState.board[0]).toBe(5);
        expect(loaded.gameState.elapsedSeconds).toBe(42);

        clearSoloGameSnapshot();
        expect(loadSoloGameSnapshot()).toBeNull();
    });
});
