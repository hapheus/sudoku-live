import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSudokuGame, setCellValue } from '../src/domain/sudoku-engine.js';
import { useNavigationAndSetup } from '../src/hooks/useNavigationAndSetup.js';

function setup(overrides = {}) {
    const gameState = createSudokuGame({ difficulty: 'easy', variant: '2x3' });
    const stateRef = { current: {
        mode: 'solo', navTab: 'play', isSpectating: false, isPlayingGame: true,
        myRole: 'host', onlineGameId: 'lifecycle-room', gameState,
        variant: '2x3', difficulty: 'easy', currentMembers: [], hintsMap: new Map(),
        incomingJoinRequests: [], pendingJoinRequest: null, boardBackground: null,
        rematchRequestedBy: null, ...overrides,
    } };
    const callbacks = Object.fromEntries([
        'setNavTab', 'setIsPlayingGame', 'setMode', 'setDifficulty', 'setVariant',
        'setIsSpectating', 'setOnlineGameId', 'setMyRole', 'setGameState',
        'setBoardBackground', 'setRematchRequestedBy', 'setCurrentMembers', 'setHintsMap',
        'setSelectedIndex', 'setActiveDigit', 'setHostCursorIndex', 'setGuestCursors',
        'setRemoteActiveDigit', 'setNotesMode', 'setHostJoinPolicy', 'setIncomingJoinRequests',
        'setPendingJoinRequest', 'setPendingConfirm', 'setLegalPage', 'clearUnitCelebration',
        'persistSnapshotIfNeeded', 'syncLobbyProgress', 'openWatchDirectory',
        'ensureHostOnlineSession', 'startNewSoloGame', 'broadcastCursor',
        'broadcastActiveDigit', 'resetTicTacToe', 'announce', 'showFeedback',
    ].map(name => [name, vi.fn()]));
    const client = Object.fromEntries(['disconnect', 'leaveGameChannel', 'leaveLobby', 'broadcastGameEvent'].map(name => [name, vi.fn()]));
    const params = { ...callbacks, stateRef, onlineClientRef: { current: client },
        pendingJoinTimerRef: { current: null }, cellRefs: { current: [] }, isNativeApp: false };
    const { result } = renderHook(() => useNavigationAndSetup(params));
    return { api: result, stateRef, client, ...callbacks };
}

function addProgress(stateRef) {
    const state = stateRef.current.gameState;
    const index = state.board.findIndex(value => value === 0);
    stateRef.current.gameState = setCellValue(state, index, state.solution[index]);
}

describe('navigation and rematch lifecycle', () => {
    beforeEach(() => { localStorage.clear(); window.history.replaceState({}, '', '/'); });

    it('confirms leaving an active co-op game before opening Watch, then restores Solo setup', () => {
        const h = setup({ mode: 'online', currentMembers: [{ id: 'guest', role: 'guest' }] });
        addProgress(h.stateRef);
        act(() => h.api.current.switchMode('watch'));
        expect(h.client.disconnect).not.toHaveBeenCalled();
        act(() => h.setPendingConfirm.mock.lastCall[0].onConfirm());
        expect(h.client.disconnect).toHaveBeenCalledOnce();
        expect(h.openWatchDirectory).toHaveBeenCalledOnce();
        expect(h.stateRef.current.mode).toBe('watch');
        expect(h.setCurrentMembers).toHaveBeenCalledWith([]);
        // Model the parent applying its controlled membership setter on rerender.
        h.stateRef.current.currentMembers = [];
        act(() => h.api.current.switchMode('solo'));
        expect(h.startNewSoloGame).toHaveBeenCalledWith(null, null, { restoreSaved: true, startSession: false });
    });

    it('navigates Settings without leaving a room and normalizes legal-page URLs', () => {
        const h = setup();
        window.history.replaceState({}, '', '/privacy');
        act(() => h.api.current.handleSelectNavTab('settings'));
        expect(h.setNavTab).toHaveBeenCalledWith('settings');
        expect(h.client.disconnect).not.toHaveBeenCalled();
        expect(window.location.pathname).toBe('/');
        h.stateRef.current.mode = 'watch';
        act(() => h.api.current.handleSelectNavTab('watch'));
        expect(h.setNavTab).toHaveBeenLastCalledWith('watch');
        act(() => h.api.current.handleSelectNavTab('play'));
        expect(h.startNewSoloGame).toHaveBeenCalled();
    });

    it('requests, cancels, and accepts a co-op rematch while retaining observable state', () => {
        const h = setup({ mode: 'online', currentMembers: [{ id: 'guest', role: 'guest' }] });
        act(() => h.api.current.handleNewPuzzleAction());
        expect(h.client.broadcastGameEvent).toHaveBeenCalledWith('lifecycle-room', 'new-puzzle-request', { role: 'host' });
        act(() => h.api.current.handleCancelRematch());
        expect(h.setRematchRequestedBy).toHaveBeenLastCalledWith(null);
        h.stateRef.current.rematchRequestedBy = 'guest';
        const original = h.stateRef.current.gameState;
        act(() => h.api.current.handleNewPuzzleAction());
        expect(h.stateRef.current.gameState).not.toBe(original);
        expect(h.client.broadcastGameEvent).toHaveBeenLastCalledWith('lifecycle-room', 'new-puzzle-accept', expect.objectContaining({ gameState: expect.any(Object) }));
        expect(h.syncLobbyProgress).toHaveBeenCalledWith(h.stateRef.current.gameState);
    });

    it('confirms destructive difficulty and variant changes when progress exists', () => {
        const h = setup();
        addProgress(h.stateRef);
        act(() => h.api.current.handleDifficultyChange('hard'));
        expect(h.startNewSoloGame).not.toHaveBeenCalled();
        act(() => h.setPendingConfirm.mock.lastCall[0].onConfirm());
        expect(h.startNewSoloGame).toHaveBeenLastCalledWith('hard', '2x3');
        act(() => h.api.current.handleVariantChange('3x3'));
        act(() => h.setPendingConfirm.mock.lastCall[0].onConfirm());
        expect(h.startNewSoloGame).toHaveBeenLastCalledWith('easy', '3x3');
        expect(localStorage.getItem('sudoku_variant')).toBe('3x3');
    });

    it('changes setup selections directly before play and ignores repeated selections', () => {
        const h = setup({ isPlayingGame: false });
        act(() => h.api.current.handleDifficultyChange('easy'));
        act(() => h.api.current.handleVariantChange('2x3'));
        expect(h.setDifficulty).not.toHaveBeenCalled();
        expect(h.setVariant).not.toHaveBeenCalled();
        act(() => h.api.current.handleDifficultyChange('expert'));
        act(() => h.api.current.handleVariantChange('3x3'));
        expect(h.setDifficulty).toHaveBeenCalledWith('expert');
        expect(h.setVariant).toHaveBeenCalledWith('3x3');
        expect(h.startNewSoloGame).not.toHaveBeenCalled();
    });

    it('confirms replacing solo progress and restores the existing board on Resume', () => {
        const h = setup();
        addProgress(h.stateRef);
        act(() => h.api.current.handleNewPuzzleAction());
        expect(h.startNewSoloGame).not.toHaveBeenCalled();
        act(() => h.setPendingConfirm.mock.lastCall[0].onConfirm());
        expect(h.startNewSoloGame).toHaveBeenCalled();
        const original = h.stateRef.current.gameState;
        act(() => h.api.current.handleResumeFromSetup());
        expect(h.stateRef.current.gameState).toBe(original);
        expect(h.setIsPlayingGame).toHaveBeenLastCalledWith(true);
        expect(h.ensureHostOnlineSession).toHaveBeenCalledWith(original, 'lifecycle-room', 'solo');
    });
});
