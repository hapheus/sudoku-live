import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createSudokuGame } from '../src/domain/sudoku-engine.js';
import { useBoardActions } from '../src/hooks/useBoardActions.js';

function setup({ isSpectating = false, notesMode = false, selection = 'empty' } = {}) {
    const gameState = createSudokuGame({ difficulty: 'easy', variant: '2x3' });
    const index = gameState.board.findIndex(value => selection === 'given' ? value > 0 : value === 0);
    const selectedIndex = selection === null ? null : index;
    const stateRef = { current: { gameState, selectedIndex, isSpectating,
        mode: isSpectating ? 'watch' : 'online', onlineGameId: 'actions-room',
        myRole: isSpectating ? 'spectator' : 'host', activeDigit: null,
        pendingHint: null, hintsMap: new Map(), messages: {},
    } };
    const client = { clientId: 'actions-client', broadcastGameEvent: vi.fn(), sendWhisperEvent: vi.fn() };
    const callbacks = Object.fromEntries([
        'setGameState', 'setSelectedIndex', 'setActiveDigit', 'setPendingHint',
        'clearHintsForCell', 'triggerHintHighlight', 'triggerUnitCelebration',
        'playMoveSoundFeedback', 'persistSnapshotIfNeeded', 'syncLobbyProgress',
        'announce', 'showFeedback',
    ].map(name => [name, vi.fn()]));
    callbacks.setActiveDigit = vi.fn(digit => { stateRef.current.activeDigit = digit; });
    const setHintsMap = vi.fn(update => { stateRef.current.hintsMap = update(stateRef.current.hintsMap); });
    const { result } = renderHook(() => useBoardActions({
        ...callbacks, stateRef, selectedIndex, notesMode,
        onlineClientRef: { current: client }, soundEffectsRef: { current: null },
        setHintsMap, clearPendingHint: vi.fn(() => { stateRef.current.pendingHint = null; }),
        buildSyncPayload: vi.fn(() => ({})),
    }));
    return { api: result, index, stateRef, client, ...callbacks };
}

describe('board-action lifecycle', () => {
    it('fills, clears and undoes pencil notes while broadcasting changed cells', () => {
        const h = setup();
        act(() => h.api.current.handleFillCandidates());
        const filled = h.stateRef.current.gameState;
        expect(filled.notes[h.index].length).toBeGreaterThan(0);
        expect(h.client.broadcastGameEvent).toHaveBeenCalledWith('actions-room', 'cell-update', expect.objectContaining({ index: h.index, value: null }));
        act(() => h.api.current.handleFillCandidates());
        expect(h.stateRef.current.gameState).toBe(filled);
        act(() => h.api.current.handleClearNotes());
        expect(h.stateRef.current.gameState.notes.every(notes => notes.length === 0)).toBe(true);
        act(() => h.api.current.handleUndo());
        expect(h.stateRef.current.gameState.notes).toEqual(filled.notes);
        expect(h.persistSnapshotIfNeeded).toHaveBeenCalled();
    });

    it('previews a logical hint before applying its correct digit on the second request', () => {
        const h = setup();
        const original = [...h.stateRef.current.gameState.board];
        act(() => h.api.current.handleLocalHint());
        const hint = h.stateRef.current.pendingHint;
        expect(hint).toMatchObject({ index: expect.any(Number), digit: expect.any(Number) });
        expect(h.stateRef.current.gameState.board).toEqual(original);
        expect(h.client.broadcastGameEvent).toHaveBeenCalledWith('actions-room', 'hint-highlight', expect.objectContaining({ mode: 'preview', index: hint.index }));
        act(() => h.api.current.handleLocalHint());
        expect(h.stateRef.current.gameState.board[hint.index]).toBe(hint.digit);
        expect(h.stateRef.current.pendingHint).toBeNull();
        expect(h.client.broadcastGameEvent).toHaveBeenCalledWith('actions-room', 'hint-highlight', expect.objectContaining({ mode: 'solve' }));
    });

    it('lets spectators suggest and retract hints without editing the board', () => {
        const h = setup({ isSpectating: true });
        const original = h.stateRef.current.gameState;
        act(() => h.api.current.sendSpectatorHint(7));
        expect(h.client.sendWhisperEvent).not.toHaveBeenCalled();
        act(() => h.api.current.sendSpectatorHint(3));
        expect(h.client.sendWhisperEvent).toHaveBeenLastCalledWith('hint', { senderId: 'actions-client', index: h.index, value: 3 });
        act(() => h.api.current.sendSpectatorHint(3));
        expect(h.client.sendWhisperEvent).toHaveBeenLastCalledWith('hint', { senderId: 'actions-client', index: null, value: null });
        act(() => h.api.current.sendSpectatorHint(null));
        expect(h.stateRef.current.hintsMap.get('actions-client').value).toBeNull();
        act(() => h.api.current.sendSpectatorHint(undefined));
        expect(h.stateRef.current.hintsMap.size).toBe(0);
        act(() => { h.api.current.handleFillCandidates(); h.api.current.handleClearNotes(); h.api.current.handleLocalHint(); });
        expect(h.stateRef.current.gameState).toBe(original);
        expect(h.setGameState).not.toHaveBeenCalled();
    });

    it('locks a digit without a selection and places it by selecting an empty cell', () => {
        const h = setup({ selection: null });
        act(() => h.api.current.applyPlayerDigit(2));
        expect(h.stateRef.current.activeDigit).toBe(2);
        act(() => h.api.current.applyPlayerDigit(2));
        expect(h.stateRef.current.activeDigit).toBeNull();
        act(() => h.api.current.applyPlayerDigit(3));
        act(() => h.api.current.handleCellSelect(h.index));
        expect(h.stateRef.current.gameState.board[h.index]).toBe(3);
    });

    it('protects given clues while allowing their digit to be locked', () => {
        const h = setup({ selection: 'given' });
        const original = [...h.stateRef.current.gameState.board];
        act(() => h.api.current.applyPlayerDigit(4));
        expect(h.stateRef.current.gameState.board).toEqual(original);
        expect(h.setSelectedIndex).toHaveBeenCalledWith(null);
        expect(h.stateRef.current.activeDigit).toBe(4);
    });

    it('applies accepted spectator suggestions and completes a board correctly', () => {
        const h = setup();
        const state = h.stateRef.current.gameState;
        const board = [...state.solution];
        board[h.index] = 0;
        const givens = board.map(Boolean);
        h.stateRef.current.gameState = { ...state, board, givens, filledCount: 35 };
        act(() => h.api.current.applySpectatorHint(h.index, state.solution[h.index]));
        expect(h.stateRef.current.gameState.status).toBe('solved');
        expect(h.stateRef.current.gameState.filledCount).toBe(36);
        expect(h.persistSnapshotIfNeeded).toHaveBeenCalled();
    });

    it('toggles notes instead of writing digits in notes mode', () => {
        const h = setup({ notesMode: true });
        act(() => h.api.current.applyPlayerDigit(2));
        expect(h.stateRef.current.gameState.board[h.index]).toBe(0);
        expect(h.stateRef.current.gameState.notes[h.index]).toEqual([2]);
        act(() => h.api.current.applyPlayerDigit(2));
        expect(h.stateRef.current.gameState.notes[h.index]).toEqual([]);
    });
});
