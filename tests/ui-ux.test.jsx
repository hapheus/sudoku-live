import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ModeTabs } from '../src/components/ModeTabs.jsx';
import { BottomNav } from '../src/components/BottomNav.jsx';
import { SettingsPanel } from '../src/components/SettingsPanel.jsx';
import { VariantSelector } from '../src/components/VariantSelector.jsx';
import { DifficultySelector } from '../src/components/DifficultySelector.jsx';
import { StatusBanner } from '../src/components/StatusBanner.jsx';
import { PlayerControls } from '../src/components/PlayerControls.jsx';
import { WatcherInteractions } from '../src/components/WatcherInteractions.jsx';
import { HelpDialog } from '../src/components/HelpDialog.jsx';
import { SolveSummary } from '../src/components/SolveSummary.jsx';
import deMessages from '../src/locales/de.json';
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

const SAMPLE_2X3_SOLUTION = [
    1, 2, 3, 4, 5, 6,
    4, 5, 6, 1, 2, 3,
    2, 3, 1, 6, 4, 5,
    5, 6, 4, 2, 3, 1,
    3, 1, 2, 5, 6, 4,
    6, 4, 5, 3, 1, 2,
];

describe('UI/UX components & Solo persistence', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('supports WAI-ARIA arrow-key navigation in 3-tab BottomNav and 2-tab ModeTabs', () => {
        const onSelectTab = vi.fn();
        render(<BottomNav activeTab="play" onSelectTab={onSelectTab} />);

        const playTab = screen.getByRole('tab', { name: 'Play' });
        const watchTab = screen.getByRole('tab', { name: 'Watch' });
        const settingsTab = screen.getByRole('tab', { name: 'Settings' });

        expect(playTab).toHaveAttribute('tabindex', '0');
        expect(watchTab).toHaveAttribute('tabindex', '-1');
        expect(settingsTab).toHaveAttribute('tabindex', '-1');

        fireEvent.keyDown(playTab, { key: 'ArrowRight' });
        expect(onSelectTab).toHaveBeenCalledWith('watch');

        fireEvent.keyDown(playTab, { key: 'End' });
        expect(onSelectTab).toHaveBeenCalledWith('settings');

        const onSelectMode = vi.fn();
        render(<ModeTabs mode="solo" onSelectMode={onSelectMode} />);
        const soloTab = screen.getByRole('tab', { name: 'Solo' });
        fireEvent.keyDown(soloTab, { key: 'ArrowRight' });
        expect(onSelectMode).toHaveBeenCalledWith('watch');
    });

    it('emits theme, language, music, and guide callbacks in SettingsPanel', () => {
        const onChangeTheme = vi.fn();
        const onChangeLanguage = vi.fn();
        const onChangeMusicEnabled = vi.fn();
        const onOpenGuide = vi.fn();
        render(
            <SettingsPanel
                theme="dark"
                language="en"
                musicEnabled
                onChangeTheme={onChangeTheme}
                onChangeLanguage={onChangeLanguage}
                onChangeMusicEnabled={onChangeMusicEnabled}
                onOpenGuide={onOpenGuide}
            />,
        );

        fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
        expect(onChangeTheme).toHaveBeenCalledWith('light');

        fireEvent.click(screen.getByRole('radio', { name: 'Deutsch' }));
        expect(onChangeLanguage).toHaveBeenCalledWith('de');

        fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
        expect(onChangeMusicEnabled).toHaveBeenCalledWith(false);

        fireEvent.click(screen.getByRole('button', { name: 'Open Guide' }));
        expect(onOpenGuide).toHaveBeenCalledTimes(1);
    });

    it('renders VariantSelector and DifficultySelector as segmented pills and emits changes', () => {
        const onVariantChange = vi.fn();
        const onDiffChange = vi.fn();
        render(
            <>
                <VariantSelector variant="3x3" onChange={onVariantChange} />
                <DifficultySelector difficulty="medium" onChange={onDiffChange} />
            </>,
        );

        fireEvent.click(screen.getByRole('radio', { name: '2×3 (6×6)' }));
        expect(onVariantChange).toHaveBeenCalledWith('2x3');

        fireEvent.click(screen.getByRole('radio', { name: 'Hard' }));
        expect(onDiffChange).toHaveBeenCalledWith('hard');
    });

    it('hides connection/Live Watch Ready chrome in Solo mode and shows variant progress', () => {
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
        expect(document.getElementById('game-status-text')).toHaveTextContent('3×3 Easy • Solo');
        expect(document.getElementById('sudoku-progress')).toHaveTextContent('80/81');
    });

    it('transitions StatusBanner to Co-op with Reconnect and You/Partner legend when a partner joins', () => {
        const puzzle = [...SAMPLE_2X3_SOLUTION];
        puzzle[0] = 0;
        const gameState = createSudokuGame({
            difficulty: 'medium',
            variant: '2x3',
            puzzle,
            solution: SAMPLE_2X3_SOLUTION,
        });
        const onReconnect = vi.fn();

        render(
            <StatusBanner
                connectionStatus="failed"
                mode="solo"
                isSpectating={false}
                myRole="host"
                currentMembers={[
                    { id: '1', role: 'host' },
                    { id: '2', role: 'guest' },
                ]}
                spectatedGameMode={null}
                gameState={gameState}
                onReconnect={onReconnect}
            />,
        );

        expect(document.getElementById('game-status-text')).toHaveTextContent('Co-op • 2×3 Medium');
        expect(document.getElementById('sudoku-progress')).toHaveTextContent('35/36');
        expect(screen.getByText('Partner online')).toBeInTheDocument();
        expect(screen.getByText('You')).toBeInTheDocument();
        expect(screen.getByText('Partner')).toBeInTheDocument();
        const retryBtn = screen.getByRole('button', { name: 'Reconnect' });
        fireEvent.click(retryBtn);
        expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('disables completed digits outside notes mode and renders 6 digits for 2x3 in PlayerControls', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0; // Digit 5 has 8 remaining; all other digits 1..4,6..9 have 9 placed (complete)

        const { rerender } = render(
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

        const puzzle2x3 = [...SAMPLE_2X3_SOLUTION];
        puzzle2x3[0] = 0;
        rerender(
            <PlayerControls
                board={puzzle2x3}
                variant="2x3"
                notesMode={false}
                canUndo={false}
                activeDigit={1}
                isSolved={false}
                onUndo={vi.fn()}
                onErase={vi.fn()}
                onToggleNotes={vi.fn()}
                onLocalHint={vi.fn()}
                onDigit={vi.fn()}
            />,
        );

        expect(document.querySelectorAll('.numpad .numpad-btn')).toHaveLength(6);
        expect(screen.getByRole('button', { name: 'Enter 1, 1 remaining' })).not.toBeDisabled();
        expect(screen.getByRole('button', { name: '2, all 6 placed' })).toBeDisabled();
    });

    it('supports 9-digit and 6-digit spectator pads and disables digits when a filled cell is selected', () => {
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

        const puzzle2x3 = [...SAMPLE_2X3_SOLUTION];
        puzzle2x3[0] = 0;
        rerender(
            <WatcherInteractions
                selectedIndex={0}
                board={puzzle2x3}
                variant="2x3"
                onSendHint={vi.fn()}
                onSendReaction={vi.fn()}
            />,
        );
        expect(document.querySelectorAll('.spectator-pad__digits .spectator-pad__btn')).toHaveLength(6);
    });

    it('opens localized touch-first HelpDialog and closes on Escape key, and renders SolveSummary CTA', () => {
        const onClose = vi.fn();
        const onPlayAgain = vi.fn();

        const { rerender } = render(
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

        expect(screen.getByRole('dialog', { name: 'Game Guide' })).toBeInTheDocument();
        expect(screen.getByText('Tap to Enter Numbers')).toBeInTheDocument();
        expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
        expect(screen.queryByText(/Arrow keys/i)).not.toBeInTheDocument();

        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);

        expect(screen.getByText('Hard Co-op finished in 02:05')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));
        expect(onPlayAgain).toHaveBeenCalledTimes(1);

        rerender(<HelpDialog isOpen onClose={onClose} messages={deMessages} />);
        expect(screen.getByRole('dialog', { name: 'Spielanleitung' })).toBeInTheDocument();
        expect(screen.getByText('Zahlen per Tipp eingeben')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Schließen' })).toBeInTheDocument();
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

    it('highlights matched numpad digit and exposes Fill Candidates / Clear Notes when notesMode is active', () => {
        const puzzle = [...SAMPLE_SOLUTION];
        puzzle[0] = 0;
        const onFillCandidates = vi.fn();
        const onClearNotes = vi.fn();

        render(
            <PlayerControls
                board={puzzle}
                notesMode
                canUndo
                activeDigit={null}
                highlightedDigit={5}
                isSolved={false}
                onUndo={vi.fn()}
                onErase={vi.fn()}
                onToggleNotes={vi.fn()}
                onFillCandidates={onFillCandidates}
                onClearNotes={onClearNotes}
                onLocalHint={vi.fn()}
                onDigit={vi.fn()}
            />,
        );

        expect(screen.getByRole('button', { name: 'Enter 5, 1 remaining' })).toHaveClass('numpad-btn--matched');

        fireEvent.click(screen.getByRole('button', { name: 'Fill Candidates' }));
        expect(onFillCandidates).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Clear Notes' }));
        expect(onClearNotes).toHaveBeenCalledTimes(1);
    });

    it('locks iOS and PWA app configuration strictly to portrait orientation', () => {
        const root = process.cwd();
        const infoPlist = fs.readFileSync(path.join(root, 'ios/App/App/Info.plist'), 'utf8');
        const appDelegate = fs.readFileSync(path.join(root, 'ios/App/App/AppDelegate.swift'), 'utf8');
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8'));

        expect(infoPlist).toContain('UIInterfaceOrientationPortrait');
        expect(infoPlist).not.toContain('UIInterfaceOrientationLandscapeLeft');
        expect(infoPlist).not.toContain('UIInterfaceOrientationLandscapeRight');
        expect(infoPlist).not.toContain('UIInterfaceOrientationPortraitUpsideDown');
        expect(infoPlist).toContain('<key>UIRequiresFullScreen</key>');

        expect(appDelegate).toMatch(/supportedInterfaceOrientationsFor[\s\S]*return \.portrait/);
        expect(manifest.orientation).toBe('portrait');
    });
});
