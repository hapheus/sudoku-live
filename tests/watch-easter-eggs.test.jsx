import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/App.jsx';
import { createShiftChallenge } from '../src/domain/tic-tac-toe.js';

let mockGameCallbacks = null;
const mockDisconnect = vi.fn();

vi.mock('../src/services/online-game-client.js', () => ({
    generateEventId: vi.fn(() => 'evt-mock-1'),
    generateGameId: vi.fn(() => 'room-mock-1'),
    isValidGameId: vi.fn((id) => Boolean(id && id.length >= 3)),
    OnlineGameClient: class MockOnlineGameClient {
        constructor({ onConnectionChange }) {
            this.clientId = 'watcher-client-1';
            this.onConnectionChange = onConnectionChange;
            this.client = { connect: vi.fn() };
        }

        joinLobby({ onLobbyPresenceChange }) {
            onLobbyPresenceChange?.([
                {
                    game_id: 'watch-egg-room',
                    host_name: 'HostPlayer',
                    status: 'in_progress',
                    game_mode: 'online',
                    difficulty: 'medium',
                    variant: '3x3',
                    filled_count: 30,
                    has_guest: true,
                    join_policy: 'confirm',
                },
            ]);
        }

        leaveLobby() {}

        joinGameChannel(_gameId, callbacks) {
            mockGameCallbacks = callbacks;
            callbacks.onPresenceChange?.([
                { id: 'host-1', role: 'host', game_mode: 'online', join_policy: 'confirm', name: 'HostPlayer' },
                { id: 'guest-1', role: 'guest', game_mode: 'online', join_policy: 'confirm', name: 'GuestPlayer' },
                { id: 'watcher-client-1', role: 'spectator', game_mode: 'online', join_policy: 'confirm', name: 'Watcher' },
            ]);
        }

        leaveGameChannel() {}
        broadcastLobbyUpdate() {}
        broadcastGameEvent() { return Promise.resolve(); }
        sendWhisperEvent() {}
        sendGamePing() {}
        updateGameJoinPolicy() {}
        updatePlayerName() {}
        getGameMembers() { return []; }
        disconnect() { mockDisconnect(); }
    },
}));

describe('Watch Mode Easter Eggs visibility', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        delete document.documentElement.dataset.retro;
        mockGameCallbacks = null;
        vi.clearAllMocks();
    });

    it('renders Fist Bump, 1981 Retro Mode, and Tic Tac Toe for watchers in Watch Mode', () => {
        render(<App />);

        // Navigate to Watch and open the live match
        fireEvent.click(screen.getByRole('tab', { name: 'Watch' }));
        fireEvent.click(screen.getByRole('button', { name: 'Watch Live' }));

        expect(mockGameCallbacks).not.toBeNull();

        // 1. Fist Bump event -> watcher sees fist bump badge on cell 4
        act(() => {
            mockGameCallbacks.onEvent('fist-bump', { index: 4, value: 7, phraseKey: 'fistBumpAmazing', senderId: 'host-1' });
        });
        expect(document.querySelector('.sudoku-cell__fist-bump')).not.toBeNull();

        // 2. Retro Konami Mode event -> watcher sees 1981 Retro Mode
        act(() => {
            mockGameCallbacks.onEvent('retro-mode', { enabled: true, senderId: 'host-1' });
        });
        expect(document.documentElement.dataset.retro).toBe('true');

        // 3. Tic Tac Toe state event -> watcher sees Tic Tac Toe board
        const challenge = createShiftChallenge();
        challenge.triggered = true;
        challenge.game = {
            board: ['X', null, null, null, 'O', null, null, null, null],
            players: { X: 'host-1', O: 'guest-1' },
            turn: 'X',
            phase: 'playing',
            winner: null,
        };
        act(() => {
            mockGameCallbacks.onEvent('tic-tac-toe-state', { challenge, senderId: 'host-1' });
        });
        expect(screen.getByLabelText('Tic Tac Toe board')).toBeInTheDocument();

        // Exiting Watch Mode clears remote retro mode
        fireEvent.click(screen.getByRole('button', { name: 'Back to Lobby' }));
        expect(document.documentElement.dataset.retro).toBeUndefined();
    });

    it('syncs 1981 Retro Mode and Tic Tac Toe via ping/sync for late-joining watchers', () => {
        render(<App />);

        fireEvent.click(screen.getByRole('tab', { name: 'Watch' }));
        fireEvent.click(screen.getByRole('button', { name: 'Watch Live' }));

        const challenge = createShiftChallenge();
        challenge.triggered = true;
        challenge.game = {
            board: ['X', 'O', null, null, null, null, null, null, null],
            players: { X: 'host-1', O: 'guest-1' },
            turn: 'X',
            phase: 'playing',
            winner: null,
        };

        act(() => {
            mockGameCallbacks.onEvent('ping', {
                gameState: {
                    board: Array(81).fill(0),
                    givens: Array(81).fill(false),
                    variant: '3x3',
                    difficulty: 'medium',
                    status: 'in_progress',
                    elapsedSeconds: 25,
                },
                isRetroMode: true,
                ticTacToe: challenge,
            });
        });

        expect(document.documentElement.dataset.retro).toBe('true');
        expect(screen.getByLabelText('Tic Tac Toe board')).toBeInTheDocument();
    });
});
