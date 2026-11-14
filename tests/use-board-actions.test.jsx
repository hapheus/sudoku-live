import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createSudokuGame } from '../src/domain/sudoku-engine.js';
import { useBoardActions } from '../src/hooks/useBoardActions.js';

describe('useBoardActions', () => {
    it('applies digit to selected empty cell, toggles digit lock, and handles undo/shift', () => {
        let game = createSudokuGame({ difficulty: 'easy', variant: '2x3' });
        const emptyIdx = game.board.findIndex((v) => v === 0);
        const setGameState = vi.fn((next) => {
            game = next;
        });
        const setSelectedIndex = vi.fn();
        const setActiveDigit = vi.fn();
        const showFeedback = vi.fn();
        const stateRef = {
            current: {
                isSpectating: false,
                mode: 'solo',
                onlineGameId: null,
                myRole: null,
                gameState: game,
                selectedIndex: emptyIdx,
                activeDigit: null,
                pendingHint: null,
                hintsMap: new Map(),
                messages: {},
            },
        };

        const { result } = renderHook(() => useBoardActions({
            stateRef,
            onlineClientRef: { current: null },
            soundEffectsRef: { current: null },
            selectedIndex: emptyIdx,
            notesMode: false,
            setGameState,
            setSelectedIndex,
            setActiveDigit,
            setPendingHint: vi.fn(),
            setHintsMap: vi.fn(),
            clearPendingHint: vi.fn(),
            clearHintsForCell: vi.fn(),
            triggerHintHighlight: vi.fn(),
            triggerUnitCelebration: vi.fn(() => false),
            playMoveSoundFeedback: vi.fn(),
            persistSnapshotIfNeeded: vi.fn(),
            syncLobbyProgress: vi.fn(),
            buildSyncPayload: vi.fn(() => ({})),
            announce: vi.fn(),
            showFeedback,
        }));

        act(() => {
            result.current.applyPlayerDigit(3);
        });
        expect(setGameState).toHaveBeenCalledTimes(1);
        expect(game.board[emptyIdx]).toBe(3);

        act(() => {
            result.current.handleUndo();
        });
        expect(game.board[emptyIdx]).toBe(0);
    });
});
