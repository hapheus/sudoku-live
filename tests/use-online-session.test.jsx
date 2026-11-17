import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearPendingJoinState,
    respondToQueuedJoinRequests,
    useOnlineSession,
} from '../src/hooks/useOnlineSession.js';

vi.mock('../src/services/online-game-client.js', () => ({
    generateEventId: vi.fn(() => 'evt-1'),
    generateGameId: vi.fn(() => 'game-new-1'),
    isValidGameId: vi.fn((id) => Boolean(id && id.length >= 3)),
    OnlineGameClient: class MockOnlineGameClient {
        constructor({ onConnectionChange }) {
            this.clientId = 'client-1';
            this.onConnectionChange = onConnectionChange;
            this.client = { connect: vi.fn() };
            this.joinLobby = vi.fn();
            this.leaveLobby = vi.fn();
            this.joinGameChannel = vi.fn();
            this.leaveGameChannel = vi.fn();
            this.broadcastGameEvent = vi.fn();
            this.broadcastLobbyUpdate = vi.fn();
            this.updateGameJoinPolicy = vi.fn();
            this.disconnect = vi.fn();
            this.getGameMembers = vi.fn(() => []);
        }
    },
}));

describe('useOnlineSession', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('respondToQueuedJoinRequests clears incoming requests and broadcasts responses', () => {
        const broadcastGameEvent = vi.fn();
        const setIncomingJoinRequests = vi.fn();
        const stateRef = {
            current: {
                incomingJoinRequests: [
                    { gameId: 'room-1', requestId: 'req-1', requesterId: 'guest-1' },
                    { gameId: 'room-1', requestId: 'req-2', requesterId: 'guest-2' },
                ],
            },
        };
        const onlineClientRef = { current: { broadcastGameEvent } };

        respondToQueuedJoinRequests({
            stateRef,
            onlineClientRef,
            setIncomingJoinRequests,
            accepted: false,
            reason: 'declined',
        });

        expect(setIncomingJoinRequests).toHaveBeenCalledWith([]);
        expect(stateRef.current.incomingJoinRequests).toEqual([]);
        expect(broadcastGameEvent).toHaveBeenCalledTimes(2);
        expect(broadcastGameEvent).toHaveBeenCalledWith('room-1', 'join-response', {
            requestId: 'req-1',
            requesterId: 'guest-1',
            accepted: false,
            reason: 'declined',
        });
    });

    it('clearPendingJoinState clears timer, resets pending request, and sends join-cancel', () => {
        const timer = setTimeout(() => {}, 10000);
        const pendingJoinTimerRef = { current: timer };
        const setPendingJoinRequest = vi.fn();
        const broadcastGameEvent = vi.fn();
        const stateRef = {
            current: {
                pendingJoinRequest: { gameId: 'room-2', requestId: 'req-9', fromSpectating: false },
            },
        };
        const onlineClientRef = { current: { clientId: 'c-9', broadcastGameEvent } };

        const cleared = clearPendingJoinState({
            pendingJoinTimerRef,
            stateRef,
            onlineClientRef,
            setPendingJoinRequest,
        });

        expect(cleared).toEqual({ gameId: 'room-2', requestId: 'req-9', fromSpectating: false });
        expect(pendingJoinTimerRef.current).toBeNull();
        expect(stateRef.current.pendingJoinRequest).toBeNull();
        expect(setPendingJoinRequest).toHaveBeenCalledWith(null);
        expect(broadcastGameEvent).toHaveBeenCalledWith('room-2', 'join-cancel', {
            requestId: 'req-9',
            requesterId: 'c-9',
        });
    });

    it('boots OnlineGameClient and handles reconnect and join responses', () => {
        const stateRef = {
            current: {
                navTab: 'play',
                isPlayingGame: true,
                mode: 'solo',
                difficulty: 'easy',
                variant: '9x9',
                isSpectating: false,
                onlineGameId: 'room-abc',
                myRole: 'host',
                joinPolicy: 'confirm',
                gameState: {
                    board: Array(81).fill(0),
                    filledCount: 30,
                    difficulty: 'easy',
                    variant: '9x9',
                    status: 'playing',
                },
                boardBackground: { id: 'bg-1' },
                rematchRequestedBy: null,
                currentMembers: [],
                hintsMap: new Map(),
                selectedIndex: null,
                activeDigit: null,
                incomingJoinRequests: [{ gameId: 'room-abc', requestId: 'r-1', requesterId: 'g-1' }],
                pendingJoinRequest: null,
                pendingHint: null,
                activeLobbyRooms: [],
                messages: {},
            },
        };
        const onlineClientRef = { current: null };
        const pendingJoinTimerRef = { current: null };
        const showFeedback = vi.fn();
        const setIncomingJoinRequests = vi.fn();

        const { result } = renderHook(() => useOnlineSession({
            initialRoute: { initialMode: 'solo', initialWatch: false, initialGameId: null },
            joinPolicy: 'confirm',
            hostJoinPolicy: 'confirm',
            stateRef,
            onlineClientRef,
            pendingJoinTimerRef,
            setConnectionStatus: vi.fn(),
            setNavTab: vi.fn(),
            setIsPlayingGame: vi.fn(),
            setMode: vi.fn(),
            setDifficulty: vi.fn(),
            setVariant: vi.fn(),
            setIsSpectating: vi.fn(),
            setSpectatedGameMode: vi.fn(),
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
            setActiveLobbyRooms: vi.fn(),
            triggerHintHighlight: vi.fn(),
            clearHintHighlight: vi.fn(),
            clearUnitCelebration: vi.fn(),
            clearPendingHint: vi.fn(),
            triggerUnitCelebration: vi.fn(),
            playMoveSoundFeedback: vi.fn(),
            triggerFloatingReaction: vi.fn(),
            announce: vi.fn(),
            showFeedback,
        }));

        expect(onlineClientRef.current).toBeTruthy();

        act(() => {
            result.current.handleReconnect();
        });
        expect(onlineClientRef.current.client.connect).toHaveBeenCalledTimes(1);
        expect(showFeedback).toHaveBeenCalledWith('Reconnecting to live server...');

        act(() => {
            stateRef.current.incomingJoinRequests = [{ gameId: 'room-abc', requestId: 'r-1', requesterId: 'g-1' }];
            result.current.handleRespondJoinRequest(true);
        });
        expect(setIncomingJoinRequests).toHaveBeenCalledWith([]);
        expect(onlineClientRef.current.broadcastGameEvent).toHaveBeenCalledWith('room-abc', 'join-response', {
            requestId: 'r-1',
            requesterId: 'g-1',
            accepted: true,
            reason: undefined,
        });
    });
});
