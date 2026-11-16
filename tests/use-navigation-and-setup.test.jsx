import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSudokuGame } from '../src/domain/sudoku-engine.js';
import { useNavigationAndSetup } from '../src/hooks/useNavigationAndSetup.js';

describe('useNavigationAndSetup', () => {
    beforeEach(() => {
        localStorage.clear();
        window.history.replaceState({}, '', '/');
        vi.clearAllMocks();
    });

    it('keeps the same observable room when the remaining guest continues solo', () => {
        const gameState = createSudokuGame({ difficulty: 'easy' });
        const spectator = { id: 'watcher', role: 'spectator' };
        const stateRef = { current: {
            isPlayingGame: true, isSpectating: false, mode: 'online', myRole: 'guest',
            onlineGameId: 'room-remaining', currentMembers: [spectator], gameState,
            boardBackground: null,
        } };
        const client = { leaveGameChannel: vi.fn(), leaveLobby: vi.fn() };
        const ensureHostOnlineSession = vi.fn();
        const setters = Object.fromEntries([
            'setMode', 'setMyRole', 'setOnlineGameId', 'setCurrentMembers',
            'setHostCursorIndex', 'setGuestCursors', 'setRemoteActiveDigit',
            'setRematchRequestedBy', 'setHintsMap',
        ].map(name => [name, vi.fn()]));
        const { result } = renderHook(() => useNavigationAndSetup({
            ...setters, stateRef, onlineClientRef: { current: client },
            ensureHostOnlineSession, showFeedback: vi.fn(), announce: vi.fn(),
        }));
        act(() => result.current.handleContinueSolo());
        expect(stateRef.current.mode).toBe('solo');
        expect(stateRef.current.myRole).toBe('host');
        expect(stateRef.current.onlineGameId).toBe('room-remaining');
        expect(stateRef.current.gameState).toBe(gameState);
        expect(ensureHostOnlineSession).toHaveBeenCalledWith(gameState, 'room-remaining', 'solo');
        expect(JSON.parse(localStorage.getItem('sudoku_solo_snapshot_v1')).roomId).toBe('room-remaining');
    });

    it('opens and closes legal pages on web and blocks on native app', () => {
        const setLegalPage = vi.fn();
        const baseParams = {
            isNativeApp: false,
            stateRef: {
                current: {
                    mode: 'solo',
                    isSpectating: false,
                    currentMembers: [],
                    gameState: { board: Array(81).fill(0), given: Array(81).fill(false), status: 'playing', difficulty: 'easy', variant: '9x9' },
                    incomingJoinRequests: [],
                    pendingJoinRequest: null,
                },
            },
            onlineClientRef: { current: null },
            pendingJoinTimerRef: { current: null },
            cellRefs: { current: [] },
            setNavTab: vi.fn(),
            setIsPlayingGame: vi.fn(),
            setMode: vi.fn(),
            setDifficulty: vi.fn(),
            setVariant: vi.fn(),
            setIsSpectating: vi.fn(),
            setOnlineGameId: vi.fn(),
            setMyRole: vi.fn(),
            setGameState: vi.fn(),
            setBoardBackground: vi.fn(),
            setRematchRequestedBy: vi.fn(),
            setCurrentMembers: vi.fn(),
            setHintsMap: vi.fn(),
            setSelectedIndex: vi.fn(),
            setActiveDigit: vi.fn(),
            setHostCursorIndex: vi.fn(),
            setGuestCursors: vi.fn(),
            setRemoteActiveDigit: vi.fn(),
            setNotesMode: vi.fn(),
            setHostJoinPolicy: vi.fn(),
            setIncomingJoinRequests: vi.fn(),
            setPendingJoinRequest: vi.fn(),
            setPendingConfirm: vi.fn(),
            setLegalPage,
            clearUnitCelebration: vi.fn(),
            persistSnapshotIfNeeded: vi.fn(),
            syncLobbyProgress: vi.fn(),
            openWatchDirectory: vi.fn(),
            ensureHostOnlineSession: vi.fn(),
            startNewSoloGame: vi.fn(),
            broadcastCursor: vi.fn(),
            broadcastActiveDigit: vi.fn(),
            announce: vi.fn(),
            showFeedback: vi.fn(),
        };

        const { result, rerender } = renderHook(
            ({ isNativeApp }) => useNavigationAndSetup({ ...baseParams, isNativeApp }),
            { initialProps: { isNativeApp: false } },
        );

        act(() => {
            result.current.openLegalPage('privacy');
        });
        expect(setLegalPage).toHaveBeenCalledWith('privacy');
        expect(window.location.pathname).toBe('/privacy');

        act(() => {
            result.current.closeLegalPage();
        });
        expect(setLegalPage).toHaveBeenCalledWith(null);
        expect(window.location.pathname).toBe('/');

        setLegalPage.mockClear();
        rerender({ isNativeApp: true });
        act(() => {
            result.current.openLegalPage('impressum');
        });
        expect(setLegalPage).not.toHaveBeenCalled();
    });

    it('declines incoming join requests and leaves lobby on handleBackToSetup when solo host', () => {
        const broadcastGameEvent = vi.fn();
        const leaveLobby = vi.fn();
        const setIsPlayingGame = vi.fn();
        const setIncomingJoinRequests = vi.fn();
        const stateRef = {
            current: {
                isPlayingGame: true,
                myRole: 'host',
                currentMembers: [],
                incomingJoinRequests: [
                    { gameId: 'room-1', requestId: 'req-1', requesterId: 'guest-1' },
                ],
                pendingJoinRequest: null,
                gameState: { board: Array(81).fill(0), given: Array(81).fill(false), status: 'playing', difficulty: 'easy', variant: '9x9' },
            },
        };

        const { result } = renderHook(() => useNavigationAndSetup({
            isNativeApp: false,
            stateRef,
            onlineClientRef: { current: { broadcastGameEvent, leaveLobby } },
            pendingJoinTimerRef: { current: null },
            cellRefs: { current: [] },
            setNavTab: vi.fn(),
            setIsPlayingGame,
            setMode: vi.fn(),
            setDifficulty: vi.fn(),
            setVariant: vi.fn(),
            setIsSpectating: vi.fn(),
            setOnlineGameId: vi.fn(),
            setMyRole: vi.fn(),
            setGameState: vi.fn(),
            setBoardBackground: vi.fn(),
            setRematchRequestedBy: vi.fn(),
            setCurrentMembers: vi.fn(),
            setHintsMap: vi.fn(),
            setSelectedIndex: vi.fn(),
            setActiveDigit: vi.fn(),
            setHostCursorIndex: vi.fn(),
            setGuestCursors: vi.fn(),
            setRemoteActiveDigit: vi.fn(),
            setNotesMode: vi.fn(),
            setHostJoinPolicy: vi.fn(),
            setIncomingJoinRequests,
            setPendingJoinRequest: vi.fn(),
            setPendingConfirm: vi.fn(),
            setLegalPage: vi.fn(),
            clearUnitCelebration: vi.fn(),
            persistSnapshotIfNeeded: vi.fn(),
            syncLobbyProgress: vi.fn(),
            openWatchDirectory: vi.fn(),
            ensureHostOnlineSession: vi.fn(),
            startNewSoloGame: vi.fn(),
            broadcastCursor: vi.fn(),
            broadcastActiveDigit: vi.fn(),
            announce: vi.fn(),
            showFeedback: vi.fn(),
        }));

        act(() => {
            result.current.handleBackToSetup();
        });

        expect(setIsPlayingGame).toHaveBeenCalledWith(false);
        expect(setIncomingJoinRequests).toHaveBeenCalledWith([]);
        expect(broadcastGameEvent).toHaveBeenCalledWith('room-1', 'join-response', {
            requestId: 'req-1',
            requesterId: 'guest-1',
            accepted: false,
            reason: 'declined',
        });
        expect(leaveLobby).toHaveBeenCalledTimes(1);
    });
});
