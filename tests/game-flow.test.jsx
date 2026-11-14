import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from '../src/App.jsx';
import { createSudokuGame, serializeGameState, setCellValue, toggleCellNote } from '../src/domain/sudoku-engine.js';
import { OnlineGameClient } from '../src/services/online-game-client.js';
import { saveSoloGameSnapshot } from '../src/services/online-state-storage.js';

beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.lang = 'en';
    window.history.replaceState({}, '', '/');
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    cleanup();
});

it('renders classic BottomNav and flows cleanly from Play Setup (3x3/2x3 + difficulty) to the clean Game Screen', () => {
    render(<App />);

    // Classic bottom bar with Play, Watch, Settings
    expect(screen.getByRole('tab', { name: 'Play' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Watch' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeVisible();

    // Setup screen: pick 2x3 and Hard, board not rendered yet
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '2×3 (6×6)' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Hard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    // Clean active game screen without Variant/Difficulty clutter
    expect(screen.getByRole('grid')).toBeVisible();
    expect(screen.queryByRole('radio', { name: '2×3 (6×6)' })).not.toBeInTheDocument();
    expect(document.getElementById('game-status-text')).toHaveTextContent('2×3 Hard • Solo');
    expect(screen.getByRole('button', { name: 'Hint' })).toBeVisible();
    expect(document.getElementById('back-to-setup-btn')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
    expect(screen.getByRole('button', { name: 'Notes On' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Fill Candidates' })).toBeVisible();
});

it('switches cleanly between Watch lobby, Spectator view, and Settings (Light mode & Deutsch)', () => {
    render(<App />);

    // Start a game first
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('grid')).toBeVisible();

    // Switch to Settings -> Light mode + Deutsch
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible();

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('sudoku_theme')).toBe('light');

    fireEvent.click(screen.getByRole('radio', { name: 'Deutsch' }));
    expect(document.documentElement.lang).toBe('de');
    expect(screen.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Spielen' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Zuschauen' })).toBeVisible();

    // Returning to Play keeps active game screen intact (in German!)
    fireEvent.click(screen.getByRole('tab', { name: 'Spielen' }));
    expect(screen.getByRole('grid')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Hinweis' })).toBeVisible();

    // Switch to Watch tab
    fireEvent.click(screen.getByRole('tab', { name: 'Zuschauen' }));
    expect(screen.getByRole('heading', { name: 'Aktive Live-Spiele' })).toBeVisible();

    // Direct /games/:id?watch=1 opens Watch Spectator screen with interaction buttons
    cleanup();
    localStorage.clear();
    window.history.replaceState({}, '', '/games/room123?watch=1');
    render(<App />);
    expect(screen.getByRole('tab', { name: 'Watch' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Spectating Live Match/i)).toBeVisible();
    expect(screen.getByRole('region', { name: 'Spectator Interactions' })).toBeVisible();
});

it('briefly highlights a completed row as a reward when the player fills its last cell', () => {
    vi.useFakeTimers();

    const solution2x3 = [
        1, 2, 3, 4, 5, 6,
        4, 5, 6, 1, 2, 3,
        2, 3, 1, 6, 4, 5,
        5, 6, 4, 2, 3, 1,
        3, 1, 2, 5, 6, 4,
        6, 4, 5, 3, 1, 2,
    ];
    const puzzle2x3 = [...solution2x3];
    puzzle2x3[0] = 0; // finishes row 0 (0..5)
    puzzle2x3[6] = 0; // keeps box 0 open
    puzzle2x3[12] = 0; // keeps col 0 open
    puzzle2x3[13] = 0; // filled below as saved user progress

    let savedState = createSudokuGame({
        difficulty: 'easy',
        variant: '2x3',
        puzzle: puzzle2x3,
        solution: solution2x3,
    });
    savedState = setCellValue(savedState, 13, 6);
    saveSoloGameSnapshot(savedState, 'roomcelebrate1');

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume Current Game' }));

    const cells = screen.getAllByRole('gridcell');
    fireEvent.click(cells[0]);
    fireEvent.click(document.querySelector('.numpad-btn[data-digit="1"]'));

    const updatedCells = screen.getAllByRole('gridcell');
    for (let i = 0; i < 6; i++) {
        expect(updatedCells[i]).toHaveClass('sudoku-cell--unit-complete');
    }
    expect(updatedCells[6]).not.toHaveClass('sudoku-cell--unit-complete');
    expect(document.getElementById('game-announcements')).toHaveTextContent('Row completed');

    act(() => {
        vi.advanceTimersByTime(1000);
    });

    const clearedCells = screen.getAllByRole('gridcell');
    expect(clearedCells[0]).not.toHaveClass('sudoku-cell--unit-complete');
});

it('does not publish a game to the live lobby during Setup selection, only once started', () => {
    vi.useFakeTimers();

    const joinLobbySpy = vi.spyOn(OnlineGameClient.prototype, 'joinLobby').mockImplementation(() => null);
    const joinGameSpy = vi.spyOn(OnlineGameClient.prototype, 'joinGameChannel').mockImplementation(() => null);
    const broadcastLobbySpy = vi.spyOn(OnlineGameClient.prototype, 'broadcastLobbyUpdate').mockImplementation(() => {});
    const leaveLobbySpy = vi.spyOn(OnlineGameClient.prototype, 'leaveLobby').mockImplementation(() => {});

    render(<App />);

    // Selecting variant/difficulty on Setup and letting heartbeat run must NOT publish a game
    fireEvent.click(screen.getByRole('radio', { name: '2×3 (6×6)' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Hard' }));
    act(() => {
        vi.advanceTimersByTime(6000);
    });

    expect(joinGameSpy).not.toHaveBeenCalled();
    expect(joinLobbySpy).not.toHaveBeenCalled();
    expect(broadcastLobbySpy).not.toHaveBeenCalled();

    // Switching to Watch and back to Play Setup must still NOT host/publish a game
    fireEvent.click(screen.getByRole('tab', { name: 'Watch' }));
    expect(joinLobbySpy).toHaveBeenCalledTimes(1);
    expect(joinLobbySpy.mock.calls[0][0].gameId).toBeUndefined();

    fireEvent.click(screen.getByRole('tab', { name: 'Play' }));
    expect(joinGameSpy).not.toHaveBeenCalled();
    expect(broadcastLobbySpy).not.toHaveBeenCalled();

    // Pressing Play starts the game and publishes it to the live lobby
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(joinGameSpy).toHaveBeenCalledTimes(1);
    expect(joinLobbySpy).toHaveBeenCalledTimes(2);
    expect(joinLobbySpy.mock.calls[1][0]).toMatchObject({
        status: 'in_progress',
        gameMode: 'solo',
        difficulty: 'hard',
        variant: '2x3',
    });

    // Returning to Setup withdraws the unpartnered game from the live lobby
    const hostedRoomId = joinLobbySpy.mock.calls[1][0].gameId;
    fireEvent.click(document.getElementById('back-to-setup-btn'));
    expect(leaveLobbySpy).toHaveBeenCalled();
    broadcastLobbySpy.mockClear();

    act(() => {
        vi.advanceTimersByTime(6000);
    });
    expect(broadcastLobbySpy).not.toHaveBeenCalled();

    // Pressing Play again re-publishes the active game
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(joinLobbySpy).toHaveBeenCalledTimes(3);
    expect(joinLobbySpy.mock.calls[2][0].gameId).toBe(hostedRoomId);
});

it('triggers distinct sound effects for wrong/correct digits, unit completion, puzzle solved, and spectator cheers', () => {
    const scheduledFreqs = [];
    const OriginalAudioContext = window.AudioContext;

    class MockAudioContext {
        constructor() {
            this.currentTime = 0;
            this.state = 'running';
            this.destination = {};
        }

        createGain() {
            return {
                gain: {
                    setValueAtTime: vi.fn(),
                    linearRampToValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                },
                connect: vi.fn(),
            };
        }

        createBiquadFilter() {
            return {
                type: 'lowpass',
                frequency: { setValueAtTime: vi.fn() },
                connect: vi.fn(),
            };
        }

        createOscillator() {
            return {
                type: 'sine',
                frequency: {
                    setValueAtTime: vi.fn((freq) => {
                        scheduledFreqs.push(freq);
                    }),
                    exponentialRampToValueAtTime: vi.fn(),
                },
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
            };
        }

        close() {}
    }

    window.AudioContext = MockAudioContext;

    try {
        const solution2x3 = [
            1, 2, 3, 4, 5, 6,
            4, 5, 6, 1, 2, 3,
            2, 3, 1, 6, 4, 5,
            5, 6, 4, 2, 3, 1,
            3, 1, 2, 5, 6, 4,
            6, 4, 5, 3, 1, 2,
        ];
        const puzzle = [...solution2x3];
        puzzle[0] = 0; // solution 1
        puzzle[1] = 0; // solution 2
        puzzle[13] = 0; // solution 3
        puzzle[20] = 0; // solution 4 (filled below as saved progress)
        let savedState = createSudokuGame({
            difficulty: 'easy',
            variant: '2x3',
            puzzle,
            solution: solution2x3,
        });
        savedState = setCellValue(savedState, 20, 4);
        saveSoloGameSnapshot(savedState, 'roomsfx1');

        render(<App />);
        fireEvent.click(screen.getByRole('button', { name: 'Resume Current Game' }));
        const cells = screen.getAllByRole('gridcell');

        // 1. Wrong digit on cell 0 (enter 3, solution is 1; digit 3 is still available) -> 220 Hz, 174.61 Hz
        fireEvent.click(cells[0]);
        fireEvent.click(document.querySelector('.numpad-btn[data-digit="3"]'));
        expect(cells[0]).toHaveTextContent('3');
        expect(scheduledFreqs).toEqual([220, 174.61]);
        scheduledFreqs.length = 0;

        // 2. Correct digit on cell 1 (enter 2; no unit completed yet) -> 783.99 Hz + 392 Hz
        fireEvent.click(cells[1]);
        fireEvent.click(document.querySelector('.numpad-btn[data-digit="2"]'));
        expect(scheduledFreqs).toEqual([783.99, 392]);
        scheduledFreqs.length = 0;

        // 3. Fill cell 0 with 1 -> completes row/col/box (puzzle not solved yet) -> 8 oscillators starting with C5 (523.25)
        fireEvent.click(cells[0]);
        fireEvent.click(document.querySelector('.numpad-btn[data-digit="1"]'));
        expect(scheduledFreqs).toHaveLength(8);
        expect(scheduledFreqs[0]).toBe(523.25);
        scheduledFreqs.length = 0;

        // 4. Fill last remaining cell 13 with 3 -> puzzle solved -> 9 oscillators celebratory chord
        fireEvent.click(cells[13]);
        fireEvent.click(document.querySelector('.numpad-btn[data-digit="3"]'));
        expect(scheduledFreqs).toHaveLength(9);
        expect(scheduledFreqs[0]).toBe(523.25);
        scheduledFreqs.length = 0;

        // Settings toggles and volume sliders persist settings in localStorage
        fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
        const musicGroup = screen.getByRole('radiogroup', { name: 'Background Music' });
        expect(musicGroup.querySelector('input[value="false"]')).toBeChecked();
        expect(screen.getByRole('slider', { name: 'Volume: Background Music' })).toBeDisabled();
        fireEvent.click(musicGroup.querySelector('input[value="true"]'));
        expect(localStorage.getItem('sudoku_music_enabled')).toBe('true');

        fireEvent.change(screen.getByRole('slider', { name: 'Volume: Background Music' }), { target: { value: '25' } });
        expect(localStorage.getItem('sudoku_music_volume')).toBe('0.25');
        fireEvent.change(screen.getByRole('slider', { name: 'Volume: Sound Effects' }), { target: { value: '80' } });
        expect(localStorage.getItem('sudoku_sound_volume')).toBe('0.8');

        const soundGroup = screen.getByRole('radiogroup', { name: 'Sound Effects' });
        fireEvent.click(soundGroup.querySelector('input[value="false"]'));
        expect(localStorage.getItem('sudoku_sound_enabled')).toBe('false');

        // 5. Spectator cheer reaction triggers cheer sound (when enabled)
        cleanup();
        localStorage.clear();
        window.history.replaceState({}, '', '/games/roomcheer1?watch=1');
        render(<App />);
        fireEvent.click(document.querySelector('.emoji-btn[data-emoji="👏"]'));
        expect(scheduledFreqs).toEqual([783.99, 987.77, 1174.66]);
    } finally {
        window.AudioContext = OriginalAudioContext;
    }
});

it('enforces join approval settings defaults, persists changes, and handles host accept/decline/auto/disabled requests', () => {
    const joinEventHandlers = [];
    vi.spyOn(OnlineGameClient.prototype, 'joinLobby').mockImplementation(() => null);
    vi.spyOn(OnlineGameClient.prototype, 'joinGameChannel').mockImplementation((_gameId, callbacks) => {
        if (callbacks?.onEvent) {
            joinEventHandlers.push(callbacks.onEvent);
        }
        return null;
    });
    const broadcastGameSpy = vi.spyOn(OnlineGameClient.prototype, 'broadcastGameEvent').mockImplementation(() => {});
    const updatePolicySpy = vi.spyOn(OnlineGameClient.prototype, 'updateGameJoinPolicy').mockImplementation(() => {});

    render(<App />);

    // Defaults in Settings: Allow Joins ON, Auto-accept Joins OFF
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    const allowGroup = screen.getByRole('radiogroup', { name: 'Allow Joins' });
    const autoGroup = screen.getByRole('radiogroup', { name: 'Auto-accept Joins' });
    expect(allowGroup.querySelector('input[value="true"]')).toBeChecked();
    expect(autoGroup.querySelector('input[value="false"]')).toBeChecked();
    expect(autoGroup.querySelector('input[value="true"]')).not.toBeDisabled();

    // Start game as host (default policy: 'confirm')
    fireEvent.click(screen.getByRole('tab', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(joinEventHandlers.length).toBeGreaterThan(0);
    const hostOnEvent = joinEventHandlers[joinEventHandlers.length - 1];

    // 1. Confirm policy: incoming request prompts host -> Accept
    act(() => {
        hostOnEvent('join-request', { requestId: 'req-accept', requesterId: 'guest-1' });
    });
    expect(document.getElementById('join-request-banner')).toBeVisible();
    expect(document.getElementById('join-request-title')).toHaveTextContent('Player wants to join');
    fireEvent.click(document.getElementById('accept-join-btn'));
    expect(document.getElementById('join-request-banner')).not.toBeInTheDocument();
    expect(broadcastGameSpy).toHaveBeenCalledWith(expect.any(String), 'join-response', {
        requestId: 'req-accept',
        requesterId: 'guest-1',
        accepted: true,
        reason: undefined,
    });

    // 2. Confirm policy: incoming request -> Decline
    broadcastGameSpy.mockClear();
    act(() => {
        hostOnEvent('join-request', { requestId: 'req-decline', requesterId: 'guest-2' });
    });
    expect(document.getElementById('join-request-banner')).toBeVisible();
    fireEvent.click(document.getElementById('decline-join-btn'));
    expect(document.getElementById('join-request-banner')).not.toBeInTheDocument();
    expect(broadcastGameSpy).toHaveBeenCalledWith(expect.any(String), 'join-response', {
        requestId: 'req-decline',
        requesterId: 'guest-2',
        accepted: false,
        reason: 'declined',
    });

    // 3. Auto-accept ON: incoming request auto-approved without banner
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('radiogroup', { name: 'Auto-accept Joins' }).querySelector('input[value="true"]'));
    expect(localStorage.getItem('sudoku_joins_auto_accept')).toBe('true');
    expect(updatePolicySpy).toHaveBeenCalledWith('auto');

    broadcastGameSpy.mockClear();
    act(() => {
        hostOnEvent('join-request', { requestId: 'req-auto', requesterId: 'guest-3' });
    });
    expect(document.getElementById('join-request-banner')).not.toBeInTheDocument();
    expect(broadcastGameSpy).toHaveBeenCalledWith(expect.any(String), 'join-response', {
        requestId: 'req-auto',
        requesterId: 'guest-3',
        accepted: true,
    });

    // 4. Allow Joins OFF: Auto-accept inputs disabled and requests rejected with reason 'disabled'
    fireEvent.click(screen.getByRole('radiogroup', { name: 'Allow Joins' }).querySelector('input[value="false"]'));
    expect(localStorage.getItem('sudoku_joins_allowed')).toBe('false');
    expect(updatePolicySpy).toHaveBeenCalledWith('disabled');
    expect(screen.getByRole('radiogroup', { name: 'Auto-accept Joins' }).querySelector('input[value="true"]')).toBeDisabled();

    broadcastGameSpy.mockClear();
    act(() => {
        hostOnEvent('join-request', { requestId: 'req-disabled', requesterId: 'guest-4' });
    });
    expect(document.getElementById('join-request-banner')).not.toBeInTheDocument();
    expect(broadcastGameSpy).toHaveBeenCalledWith(expect.any(String), 'join-response', {
        requestId: 'req-disabled',
        requesterId: 'guest-4',
        accepted: false,
        reason: 'disabled',
    });
});

it('handles requester join approval, decline, and cancel flow from Watch Directory', () => {
    let lobbyCallbacks = null;
    const gameJoinCalls = [];

    vi.spyOn(OnlineGameClient.prototype, 'joinLobby').mockImplementation((callbacks) => {
        lobbyCallbacks = callbacks;
        return null;
    });
    vi.spyOn(OnlineGameClient.prototype, 'leaveLobby').mockImplementation(() => {});
    vi.spyOn(OnlineGameClient.prototype, 'leaveGameChannel').mockImplementation(() => {});
    vi.spyOn(OnlineGameClient.prototype, 'joinGameChannel').mockImplementation(function (gameId, callbacks) {
        this.currentGameId = gameId;
        this.gameChannel = { name: `sudoku:game.${gameId}` };
        gameJoinCalls.push({ client: this, gameId, callbacks });
        callbacks?.onSubscribed?.();
        return this.gameChannel;
    });
    const broadcastGameSpy = vi.spyOn(OnlineGameClient.prototype, 'broadcastGameEvent').mockImplementation(() => {});

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Watch' }));

    act(() => {
        lobbyCallbacks?.onLobbyPresenceChange?.([
            {
                id: 'host-client-1',
                game_id: 'roomjoin01',
                status: 'in_progress',
                game_mode: 'solo',
                difficulty: 'medium',
                variant: '3x3',
                total_cells: 81,
                filled_count: 35,
                has_guest: false,
                join_policy: 'confirm',
            },
        ]);
    });

    // Click Join -> sends join-request and displays pending banner
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(document.querySelector('.join-pending-banner')).toBeVisible();
    const firstReqCall = broadcastGameSpy.mock.calls.find((c) => c[1] === 'join-request');
    expect(firstReqCall).toBeTruthy();
    const [, , firstReqPayload] = firstReqCall;

    // Cancel pending request -> emits join-cancel and keeps user in Watch Directory
    fireEvent.click(document.querySelector('.join-pending-banner__cancel-btn'));
    expect(document.querySelector('.join-pending-banner')).not.toBeInTheDocument();
    expect(broadcastGameSpy).toHaveBeenCalledWith('roomjoin01', 'join-cancel', {
        requestId: firstReqPayload.requestId,
        requesterId: firstReqPayload.requesterId,
    });
    expect(screen.getByRole('heading', { name: 'Live Sudoku Matches' })).toBeVisible();

    // Repopulate lobby room after returning to Watch Directory
    act(() => {
        lobbyCallbacks?.onLobbyPresenceChange?.([
            {
                id: 'host-client-1',
                game_id: 'roomjoin01',
                status: 'in_progress',
                game_mode: 'solo',
                difficulty: 'medium',
                variant: '3x3',
                total_cells: 81,
                filled_count: 35,
                has_guest: false,
                join_policy: 'confirm',
            },
        ]);
    });

    // Request again and receive host decline -> stays in Watch Directory with feedback
    broadcastGameSpy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    const secondReqPayload = broadcastGameSpy.mock.calls.find((c) => c[1] === 'join-request')[2];
    const secondJoinEntry = gameJoinCalls[gameJoinCalls.length - 1];
    act(() => {
        secondJoinEntry.callbacks.onEvent('join-response', {
            requestId: secondReqPayload.requestId,
            requesterId: secondReqPayload.requesterId,
            accepted: false,
            reason: 'declined',
        });
    });
    expect(document.querySelector('.join-pending-banner')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Live Sudoku Matches' })).toBeVisible();

    // Repopulate lobby room and request again -> host accepts -> enters Co-op Play as guest
    act(() => {
        lobbyCallbacks?.onLobbyPresenceChange?.([
            {
                id: 'host-client-1',
                game_id: 'roomjoin01',
                status: 'in_progress',
                game_mode: 'solo',
                difficulty: 'medium',
                variant: '3x3',
                total_cells: 81,
                filled_count: 35,
                has_guest: false,
                join_policy: 'confirm',
            },
        ]);
    });
    broadcastGameSpy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    const thirdReqPayload = broadcastGameSpy.mock.calls.find((c) => c[1] === 'join-request')[2];
    const thirdJoinEntry = gameJoinCalls[gameJoinCalls.length - 1];
    act(() => {
        thirdJoinEntry.callbacks.onEvent('join-response', {
            requestId: thirdReqPayload.requestId,
            requesterId: thirdReqPayload.requesterId,
            accepted: true,
        });
    });

    expect(screen.getByRole('grid')).toBeVisible();
    expect(gameJoinCalls[gameJoinCalls.length - 1].callbacks.role).toBe('guest');
    expect(document.getElementById('game-status-text')).toHaveTextContent(/Co-op/i);
});

it('shows Spectating Live Match — Read-only board only when host allows joins', () => {
    let lobbyCallbacks = null;
    let spectateCallbacks = null;

    vi.spyOn(OnlineGameClient.prototype, 'joinLobby').mockImplementation((callbacks) => {
        lobbyCallbacks = callbacks;
        return null;
    });
    vi.spyOn(OnlineGameClient.prototype, 'leaveLobby').mockImplementation(() => {});
    vi.spyOn(OnlineGameClient.prototype, 'joinGameChannel').mockImplementation((_gameId, callbacks) => {
        spectateCallbacks = callbacks;
        return null;
    });

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Watch' }));

    act(() => {
        lobbyCallbacks?.onLobbyPresenceChange?.([
            {
                id: 'host-client-1',
                game_id: 'roomclosed1',
                status: 'in_progress',
                game_mode: 'solo',
                difficulty: 'medium',
                variant: '3x3',
                total_cells: 81,
                filled_count: 20,
                has_guest: false,
                join_policy: 'disabled',
            },
        ]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Watch Live' }));
    expect(document.getElementById('spectator-bar')).toBeVisible();
    expect(document.getElementById('exit-watch-btn')).toBeVisible();
    expect(screen.queryByText(/Spectating Live Match/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Read-only board/i)).not.toBeInTheDocument();

    // When host enables joins live, the notice appears
    act(() => {
        spectateCallbacks?.onEvent?.('join-policy', { joinPolicy: 'confirm' });
    });
    expect(screen.getByText(/Spectating Live Match/i)).toBeVisible();
    expect(screen.getByText(/Read-only board/i)).toBeVisible();

    // When host disables joins live again, the notice hides while Back to Lobby stays visible
    act(() => {
        spectateCallbacks?.onEvent?.('join-policy', { joinPolicy: 'disabled' });
    });
    expect(screen.queryByText(/Spectating Live Match/i)).not.toBeInTheDocument();
    expect(document.getElementById('exit-watch-btn')).toBeVisible();
});

it('first Hint click highlights the logically deduced cell without filling it, and second click solves it', () => {
    vi.useFakeTimers();

    const solution2x3 = [
        1, 2, 3, 4, 5, 6,
        4, 5, 6, 1, 2, 3,
        2, 3, 1, 6, 4, 5,
        5, 6, 4, 2, 3, 1,
        3, 1, 2, 5, 6, 4,
        6, 4, 5, 3, 1, 2,
    ];
    const puzzle2x3 = [...solution2x3];
    // Clear idx 0 (unique Full House in col 0), plus 2x2 blocks in box 0 (1,2,7,8) and cols 4-5 (22,23,28,29)
    // so every other open box/row/column has >=2 empties.
    puzzle2x3[0] = 0; // R1C1 = 1 (only empty cell in column 0)
    puzzle2x3[1] = 0;
    puzzle2x3[2] = 0;
    puzzle2x3[7] = 0;
    puzzle2x3[8] = 0;
    puzzle2x3[13] = 0; // filled below as saved user progress
    puzzle2x3[22] = 0;
    puzzle2x3[23] = 0;
    puzzle2x3[28] = 0;
    puzzle2x3[29] = 0;

    let savedState = createSudokuGame({
        difficulty: 'medium',
        variant: '2x3',
        puzzle: puzzle2x3,
        solution: solution2x3,
    });
    savedState = setCellValue(savedState, 13, 3);
    saveSoloGameSnapshot(savedState, 'roomhint1');

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume Current Game' }));

    // Select a different empty cell (R4C5 idx 22) to prove Hint prioritizes logical Full House at R1C1 (idx 0)
    const initialCells = screen.getAllByRole('gridcell');
    fireEvent.click(initialCells[22]);

    const hintBtn = screen.getByRole('button', { name: 'Hint' });

    // 1st click: only highlights target & explaining context cells, selects R1C1, does NOT fill yet
    fireEvent.click(hintBtn);
    const previewCells = screen.getAllByRole('gridcell');
    expect(previewCells[0]).toHaveTextContent('');
    expect(previewCells[0]).toHaveAttribute('aria-selected', 'true');
    expect(previewCells[0]).toHaveClass('sudoku-cell--hint-target', 'sudoku-cell--hint-preview');
    expect(previewCells[6]).toHaveClass('sudoku-cell--hint-context', 'sudoku-cell--hint-preview');
    expect(previewCells[30]).toHaveClass('sudoku-cell--hint-context', 'sudoku-cell--hint-preview');
    expect(hintBtn).toHaveClass('tool-btn--hint-armed');
    expect(document.getElementById('action-feedback')).toHaveTextContent('Hint: Check R1 C1 (last empty cell in column). Tap Hint again to fill.');

    // Preview highlight persists past 2200ms while player thinks
    act(() => {
        vi.advanceTimersByTime(2200);
    });
    expect(screen.getAllByRole('gridcell')[0]).toHaveClass('sudoku-cell--hint-target', 'sudoku-cell--hint-preview');

    // 2nd click: fills the highlighted cell, shows full explanation, and disarms button
    fireEvent.click(hintBtn);
    const afterCells = screen.getAllByRole('gridcell');
    expect(afterCells[0]).toHaveTextContent('1');
    expect(afterCells[0]).toHaveClass('sudoku-cell--hint-target');
    expect(afterCells[0]).not.toHaveClass('sudoku-cell--hint-preview');
    expect(afterCells[22]).toHaveTextContent('');
    expect(hintBtn).not.toHaveClass('tool-btn--hint-armed');
    expect(document.getElementById('action-feedback')).toHaveTextContent('Hint: R1 C1 = 1 (last empty cell in column).');

    // Solve highlights clear automatically after animation duration
    act(() => {
        vi.advanceTimersByTime(2200);
    });
    const clearedCells = screen.getAllByRole('gridcell');
    expect(clearedCells[0]).not.toHaveClass('sudoku-cell--hint-target');
    expect(clearedCells[6]).not.toHaveClass('sudoku-cell--hint-context');

    // Another 1st Hint click previews next logical deduction; solving it manually clears the preview cleanly
    fireEvent.click(hintBtn);
    expect(hintBtn).toHaveClass('tool-btn--hint-armed');
    const targetCell = screen.getAllByRole('gridcell').find((cell) => cell.classList.contains('sudoku-cell--hint-target'));
    expect(targetCell).toBeTruthy();
    const targetIdx = Number(targetCell.dataset.index);
    const expectedDigit = String(solution2x3[targetIdx]);
    fireEvent.click(document.querySelector(`.numpad-btn[data-digit="${expectedDigit}"]`));
    expect(hintBtn).not.toHaveClass('tool-btn--hint-armed');
    expect(screen.getAllByRole('gridcell')[targetIdx]).toHaveTextContent(expectedDigit);
    expect(screen.getAllByRole('gridcell')[targetIdx]).not.toHaveClass('sudoku-cell--hint-preview');
});

it('broadcasts cursor, activeDigit lock, Escape clear, and hint-highlight events in Solo mode for watchers', () => {
    vi.useFakeTimers();

    const broadcastGameSpy = vi.spyOn(OnlineGameClient.prototype, 'broadcastGameEvent').mockImplementation(() => {});
    const sendPingSpy = vi.spyOn(OnlineGameClient.prototype, 'sendGamePing').mockImplementation(() => {});
    vi.spyOn(OnlineGameClient.prototype, 'joinLobby').mockImplementation(() => null);
    vi.spyOn(OnlineGameClient.prototype, 'joinGameChannel').mockImplementation(function (gameId) {
        this.currentGameId = gameId;
        this.gameChannel = { name: `sudoku:game.${gameId}` };
        return this.gameChannel;
    });

    const solution2x3 = [
        1, 2, 3, 4, 5, 6,
        4, 5, 6, 1, 2, 3,
        2, 3, 1, 6, 4, 5,
        5, 6, 4, 2, 3, 1,
        3, 1, 2, 5, 6, 4,
        6, 4, 5, 3, 1, 2,
    ];
    const puzzle2x3 = [...solution2x3];
    puzzle2x3[0] = 0; // R1C1 = 1 (Full House in col 0)
    puzzle2x3[1] = 0;
    puzzle2x3[2] = 0;
    puzzle2x3[7] = 0;
    puzzle2x3[8] = 0;
    puzzle2x3[13] = 0; // saved user move below
    puzzle2x3[22] = 0;
    puzzle2x3[23] = 0;
    puzzle2x3[28] = 0;
    puzzle2x3[29] = 0;

    let savedState = createSudokuGame({
        difficulty: 'medium',
        variant: '2x3',
        puzzle: puzzle2x3,
        solution: solution2x3,
    });
    savedState = setCellValue(savedState, 13, 3);
    saveSoloGameSnapshot(savedState, 'roomsolowatch1');

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume Current Game' }));

    // Initial resume focuses and broadcasts cell 0
    expect(broadcastGameSpy).toHaveBeenCalledWith('roomsolowatch1', 'cursor', expect.objectContaining({
        role: 'host',
        index: 0,
    }));

    broadcastGameSpy.mockClear();
    const cells = screen.getAllByRole('gridcell');
    fireEvent.click(cells[3]); // given cell 3
    expect(broadcastGameSpy).toHaveBeenCalledWith('roomsolowatch1', 'cursor', expect.objectContaining({
        role: 'host',
        index: 3,
    }));

    // Arrow key navigation broadcasts updated cell
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(broadcastGameSpy).toHaveBeenCalledWith('roomsolowatch1', 'cursor', expect.objectContaining({
        role: 'host',
        index: 4,
    }));

    // Escape clears remote cursor and active digit
    broadcastGameSpy.mockClear();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(broadcastGameSpy).toHaveBeenCalledWith('roomsolowatch1', 'cursor', expect.objectContaining({
        role: 'host',
        index: null,
    }));
    expect(broadcastGameSpy).toHaveBeenCalledWith('roomsolowatch1', 'active-digit', expect.objectContaining({
        role: 'host',
        digit: null,
    }));

    // Locking digit 2 broadcasts active-digit
    broadcastGameSpy.mockClear();
    fireEvent.click(document.querySelector('.numpad-btn[data-digit="2"]'));
    expect(broadcastGameSpy).toHaveBeenCalledWith('roomsolowatch1', 'active-digit', expect.objectContaining({
        role: 'host',
        digit: 2,
    }));

    // 1st Hint click broadcasts cursor + hint-highlight preview, and 5s ping includes both
    broadcastGameSpy.mockClear();
    const hintBtn = screen.getByRole('button', { name: 'Hint' });
    fireEvent.click(hintBtn);
    expect(broadcastGameSpy).toHaveBeenCalledWith('roomsolowatch1', 'cursor', expect.objectContaining({
        role: 'host',
        index: 0,
    }));
    expect(broadcastGameSpy).toHaveBeenCalledWith('roomsolowatch1', 'hint-highlight', expect.objectContaining({
        role: 'host',
        mode: 'preview',
        index: 0,
    }));

    act(() => {
        vi.advanceTimersByTime(5100);
    });
    expect(sendPingSpy).toHaveBeenCalledWith(expect.objectContaining({
        hostCursorIndex: 0,
        hostActiveDigit: 2,
        hintPreview: expect.objectContaining({ mode: 'preview', index: 0 }),
    }));

    // 2nd Hint click broadcasts hint-highlight solve and cell-update
    broadcastGameSpy.mockClear();
    fireEvent.click(hintBtn);
    expect(broadcastGameSpy).toHaveBeenCalledWith('roomsolowatch1', 'hint-highlight', expect.objectContaining({
        role: 'host',
        mode: 'solve',
        index: 0,
    }));
    expect(broadcastGameSpy).toHaveBeenCalledWith('roomsolowatch1', 'cell-update', expect.objectContaining({
        index: 0,
        value: 1,
    }));
});

it('renders host/partner cursors, locked digit highlights, hint previews/solves, and cell updates live in Watch mode', () => {
    let spectateCallbacks = null;
    vi.spyOn(OnlineGameClient.prototype, 'joinLobby').mockImplementation(() => null);
    vi.spyOn(OnlineGameClient.prototype, 'joinGameChannel').mockImplementation((_gameId, callbacks) => {
        spectateCallbacks = callbacks;
        return null;
    });

    window.history.replaceState({}, '', '/games/roomwatchlive?watch=1');
    render(<App />);

    const solution2x3 = [
        1, 2, 3, 4, 5, 6,
        4, 5, 6, 1, 2, 3,
        2, 3, 1, 6, 4, 5,
        5, 6, 4, 2, 3, 1,
        3, 1, 2, 5, 6, 4,
        6, 4, 5, 3, 1, 2,
    ];
    const puzzle2x3 = [...solution2x3];
    puzzle2x3[0] = 0; // empty target
    puzzle2x3[1] = 0; // empty host cursor target
    puzzle2x3[2] = 0; // empty guest cursor target
    const remoteState = createSudokuGame({
        difficulty: 'easy',
        variant: '2x3',
        puzzle: puzzle2x3,
        solution: solution2x3,
    });

    // Initial sync with hostCursorIndex = 3 (given 4)
    act(() => {
        spectateCallbacks?.onEvent?.('sync', {
            gameState: serializeGameState(remoteState),
            rematchRequestedBy: null,
            hints: [],
            hostCursorIndex: 3,
            hostActiveDigit: null,
            hintPreview: null,
        });
    });

    let cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(36);
    expect(cells[3]).toHaveClass('sudoku-cell--player-cursor');
    expect(cells[3].querySelector('.sudoku-cell__player-pip')).not.toBeNull();
    expect(cells[4]).toHaveClass('sudoku-cell--peer');
    // Same-digit highlighting mirrors host's focused digit (4)
    expect(cells.filter((c) => c.classList.contains('sudoku-cell--same-digit'))).toHaveLength(5);

    // Live cursor moves from host and co-op partner
    act(() => {
        spectateCallbacks?.onEvent?.('cursor', { senderId: 'host-1', role: 'host', index: 1 });
        spectateCallbacks?.onEvent?.('cursor', { senderId: 'guest-1', role: 'guest', index: 2 });
    });
    cells = screen.getAllByRole('gridcell');
    expect(cells[3]).not.toHaveClass('sudoku-cell--player-cursor');
    expect(cells[1]).toHaveClass('sudoku-cell--player-cursor');
    expect(cells[2]).toHaveClass('sudoku-cell--partner-cursor');
    expect(cells[2].querySelector('.sudoku-cell__partner-pip')).not.toBeNull();

    // Host locks digit 5 -> watcher sees all 5s highlighted even when host cursor is on empty cell 1
    act(() => {
        spectateCallbacks?.onEvent?.('active-digit', { senderId: 'host-1', role: 'host', digit: 5 });
    });
    cells = screen.getAllByRole('gridcell');
    expect(cells.filter((c) => c.classList.contains('sudoku-cell--same-digit'))).toHaveLength(6);

    // Host previews logical hint on cell 0 -> watcher sees preview highlight on target and context
    act(() => {
        spectateCallbacks?.onEvent?.('hint-highlight', {
            senderId: 'host-1',
            role: 'host',
            mode: 'preview',
            index: 0,
            contextEntries: [[0, 0], [6, 30]],
        });
    });
    cells = screen.getAllByRole('gridcell');
    expect(cells[0]).toHaveClass('sudoku-cell--hint-target', 'sudoku-cell--hint-preview');
    expect(cells[6]).toHaveClass('sudoku-cell--hint-context', 'sudoku-cell--hint-preview');

    // Host confirms hint -> watcher receives cell value and solve highlight
    act(() => {
        spectateCallbacks?.onEvent?.('cell-update', { index: 0, value: 1, notes: [], owner: 'host' });
        spectateCallbacks?.onEvent?.('hint-highlight', {
            senderId: 'host-1',
            role: 'host',
            mode: 'solve',
            index: 0,
            contextEntries: [[0, 0], [6, 30]],
        });
    });
    cells = screen.getAllByRole('gridcell');
    expect(cells[0]).toHaveTextContent('1');
    expect(cells[0]).toHaveClass('sudoku-cell--hint-target');
    expect(cells[0]).not.toHaveClass('sudoku-cell--hint-preview');
});

it('allows 3+ players to join the same match, queues simultaneous requests, and shows multiple guest cursors', () => {
    let hostCallbacks = null;
    vi.spyOn(OnlineGameClient.prototype, 'joinLobby').mockImplementation(() => null);
    vi.spyOn(OnlineGameClient.prototype, 'joinGameChannel').mockImplementation((_gameId, callbacks) => {
        hostCallbacks = callbacks;
        return null;
    });
    const broadcastGameSpy = vi.spyOn(OnlineGameClient.prototype, 'broadcastGameEvent').mockImplementation(() => {});

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    // Guest 1 already joined the match
    act(() => {
        hostCallbacks?.onMemberJoin?.({ id: 'guest-1', role: 'guest' });
    });

    // Two more players request to join while guest-1 is active
    broadcastGameSpy.mockClear();
    act(() => {
        hostCallbacks?.onEvent?.('join-request', { requestId: 'req-g2', requesterId: 'guest-2' });
        hostCallbacks?.onEvent?.('join-request', { requestId: 'req-g3', requesterId: 'guest-3' });
    });
    expect(document.getElementById('join-request-banner')).toBeVisible();

    // Host approves guest-2 -> banner immediately advances to queued guest-3
    fireEvent.click(document.getElementById('accept-join-btn'));
    expect(broadcastGameSpy).toHaveBeenCalledWith(expect.any(String), 'join-response', {
        requestId: 'req-g2',
        requesterId: 'guest-2',
        accepted: true,
        reason: undefined,
    });
    expect(document.getElementById('join-request-banner')).toBeVisible();

    // Host approves guest-3 -> queue is now empty and banner closes
    fireEvent.click(document.getElementById('accept-join-btn'));
    expect(broadcastGameSpy).toHaveBeenCalledWith(expect.any(String), 'join-response', {
        requestId: 'req-g3',
        requesterId: 'guest-3',
        accepted: true,
        reason: undefined,
    });
    expect(document.getElementById('join-request-banner')).not.toBeInTheDocument();

    // Multiple guests move their cursors simultaneously
    act(() => {
        hostCallbacks?.onEvent?.('cursor', { senderId: 'guest-1', role: 'guest', index: 1 });
        hostCallbacks?.onEvent?.('cursor', { senderId: 'guest-2', role: 'guest', index: 4 });
    });
    let cells = screen.getAllByRole('gridcell');
    expect(cells[1]).toHaveClass('sudoku-cell--partner-cursor');
    expect(cells[4]).toHaveClass('sudoku-cell--partner-cursor');

    // Leaving guest-1 removes only guest-1's cursor while keeping guest-2's cursor
    act(() => {
        hostCallbacks?.onMemberLeave?.({ id: 'guest-1', role: 'guest' });
    });
    cells = screen.getAllByRole('gridcell');
    expect(cells[1]).not.toHaveClass('sudoku-cell--partner-cursor');
    expect(cells[4]).toHaveClass('sudoku-cell--partner-cursor');
});

it('lets a 3rd player join an active co-op game without spectator downgrade and keeps Join Game visible while watching', () => {
    let lobbyCallbacks = null;
    const joinCalls = [];

    vi.spyOn(OnlineGameClient.prototype, 'joinLobby').mockImplementation((callbacks) => {
        lobbyCallbacks = callbacks;
        return null;
    });
    vi.spyOn(OnlineGameClient.prototype, 'leaveLobby').mockImplementation(() => {});
    vi.spyOn(OnlineGameClient.prototype, 'getGameMembers').mockImplementation(function () {
        const last = joinCalls[joinCalls.length - 1];
        return [
            { id: 'host-client-1', role: 'host', game_mode: 'online', join_policy: 'auto' },
            { id: 'guest-existing-1', role: 'guest', game_mode: 'online' },
            ...(last?.callbacks?.role === 'guest' ? [{ id: this.clientId, role: 'guest', game_mode: 'online' }] : []),
        ];
    });
    vi.spyOn(OnlineGameClient.prototype, 'joinGameChannel').mockImplementation(function (gameId, callbacks) {
        this.currentGameId = gameId;
        this.gameChannel = { name: `sudoku:game.${gameId}` };
        joinCalls.push({ client: this, gameId, callbacks });
        callbacks?.onSubscribed?.();
        callbacks?.onPresenceChange?.([
            { id: 'host-client-1', role: 'host', game_mode: 'online', join_policy: 'auto' },
            { id: 'guest-existing-1', role: 'guest', game_mode: 'online' },
            ...(callbacks?.role === 'guest' ? [{ id: this.clientId, role: 'guest', game_mode: 'online' }] : []),
        ]);
        return this.gameChannel;
    });

    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: 'Watch' }));

    act(() => {
        lobbyCallbacks?.onLobbyPresenceChange?.([
            {
                id: 'host-client-1',
                game_id: 'coopmulti1',
                status: 'in_progress',
                game_mode: 'online',
                difficulty: 'medium',
                variant: '3x3',
                total_cells: 81,
                filled_count: 35,
                has_guest: true,
                join_policy: 'confirm',
            },
        ]);
    });

    // Spectating a room that already has a guest still offers Join Game when policy !== disabled
    fireEvent.click(screen.getByRole('button', { name: 'Watch Live' }));
    expect(document.getElementById('join-from-watch-btn')).toBeVisible();

    // Return to lobby and join a co-op room with auto-accept while another guest is already in it
    fireEvent.click(document.getElementById('exit-watch-btn'));
    act(() => {
        lobbyCallbacks?.onLobbyPresenceChange?.([
            {
                id: 'host-client-1',
                game_id: 'coopmulti2',
                status: 'in_progress',
                game_mode: 'online',
                difficulty: 'medium',
                variant: '3x3',
                total_cells: 81,
                filled_count: 35,
                has_guest: true,
                join_policy: 'auto',
            },
        ]);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(joinCalls[joinCalls.length - 1].callbacks.role).toBe('guest');
    expect(screen.getByRole('grid')).toBeVisible();
    expect(document.getElementById('game-status-text')).toHaveTextContent(/Co-op/i);
    expect(screen.getByText('2 Partners online')).toBeVisible();
    expect(document.getElementById('spectator-bar')).not.toBeInTheDocument();
});

it('shows App Store link, Privacy Policy, and Impressum on Web start screen and routes /privacy and /impressum', () => {
    try {
        render(<App />);

        const footer = document.getElementById('web-start-footer');
        expect(footer).toBeVisible();

        const appStoreLink = document.getElementById('app-store-link');
        expect(appStoreLink).toHaveAttribute('href', 'https://apps.apple.com/app/id6834748729');

        const privacyLink = document.getElementById('privacy-link');
        const impressumLink = document.getElementById('impressum-link');
        expect(privacyLink).toHaveAttribute('href', '/privacy');
        expect(impressumLink).toHaveAttribute('href', '/impressum');

        // Navigate to Privacy Policy
        fireEvent.click(privacyLink);
        expect(window.location.pathname).toBe('/privacy');
        expect(document.getElementById('legal-privacy')).toBeVisible();
        expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
        expect(screen.getAllByText('haf68k@gmail.com')[0]).toBeVisible();
        expect(screen.getByText(/4481 Asten, Austria/)).toBeVisible();
        expect(screen.getByText(/165\(3\) TKG 2021/)).toBeVisible();
        expect(screen.getByText('dsb@dsb.gv.at')).toBeVisible();

        // Switch from Privacy to Impressum
        fireEvent.click(document.getElementById('legal-switch-impressum'));
        expect(window.location.pathname).toBe('/impressum');
        expect(document.getElementById('legal-impressum')).toBeVisible();
        expect(screen.getByRole('heading', { name: /Legal Notice/i })).toBeVisible();
        expect(screen.getByText(/Franz Haberfellner/)).toBeVisible();
        expect(screen.getByText(/4481 Asten, Austria/)).toBeVisible();
        expect(screen.getByText(/MedienG/)).toBeVisible();
        expect(document.getElementById('legal-impressum').textContent).not.toContain('DDG');

        // Return to Start screen
        fireEvent.click(document.getElementById('legal-back-btn'));
        expect(window.location.pathname).toBe('/');
        expect(document.getElementById('play-setup')).toBeVisible();
    } finally {
        window.history.replaceState({}, '', '/');
    }
});

it('hides Impressum, Privacy footer, and App Store link inside native Capacitor iOS app', () => {
    window.Capacitor = { isNativePlatform: () => true };
    window.history.replaceState({}, '', '/impressum');
    try {
        render(<App />);

        expect(document.getElementById('play-setup')).toBeVisible();
        expect(document.getElementById('web-start-footer')).not.toBeInTheDocument();
        expect(document.getElementById('app-store-link')).not.toBeInTheDocument();
        expect(document.getElementById('privacy-link')).not.toBeInTheDocument();
        expect(document.getElementById('impressum-link')).not.toBeInTheDocument();
        expect(document.getElementById('legal-impressum')).not.toBeInTheDocument();
        expect(document.getElementById('legal-privacy')).not.toBeInTheDocument();
    } finally {
        delete window.Capacitor;
        window.history.replaceState({}, '', '/');
    }
});

it('allocates a fresh room and does not carry over notes or digits when starting a new game after an unfinished game', () => {
    const joinedRooms = [];
    vi.spyOn(OnlineGameClient.prototype, 'joinLobby').mockImplementation(() => null);
    vi.spyOn(OnlineGameClient.prototype, 'joinGameChannel').mockImplementation(function (gameId) {
        joinedRooms.push(gameId);
        this.currentGameId = gameId;
        this.gameChannel = { name: `sudoku:game.${gameId}` };
        return this.gameChannel;
    });

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
    puzzle2x3[1] = 0;
    let unfinishedState = createSudokuGame({
        difficulty: 'easy',
        variant: '2x3',
        puzzle: puzzle2x3,
        solution: solution2x3,
    });
    // Notes-only unfinished progress still counts as unsaved progress even after reload strips history
    unfinishedState = toggleCellNote(unfinishedState, 0, 1);
    saveSoloGameSnapshot(unfinishedState, 'unfinished-room-old');

    render(<App />);
    expect(screen.getByRole('button', { name: 'Resume Current Game' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(joinedRooms).toHaveLength(1);
    expect(joinedRooms[0]).not.toBe('unfinished-room-old');

    // Also starting a new puzzle after placing a wrong/user digit clears old user progress cleanly
    const cells = screen.getAllByRole('gridcell');
    const emptyIdx = cells.findIndex((c) => !c.classList.contains('sudoku-cell--given'));
    fireEvent.click(cells[emptyIdx]);
    fireEvent.click(document.querySelector('.numpad-btn:not(:disabled)'));

    cleanup();
    localStorage.setItem('sudoku_theme', 'dark');
    const secondJoined = [];
    vi.spyOn(OnlineGameClient.prototype, 'joinGameChannel').mockImplementation(function (gameId) {
        secondJoined.push(gameId);
        this.currentGameId = gameId;
        this.gameChannel = { name: `sudoku:game.${gameId}` };
        return this.gameChannel;
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(secondJoined).toHaveLength(1);
    expect(secondJoined[0]).not.toBe(joinedRooms[0]);
});

it('clears selected cell highlight as soon as the final digit solves the puzzle', () => {
    const solution2x3 = [
        1, 2, 3, 4, 5, 6,
        4, 5, 6, 1, 2, 3,
        2, 3, 1, 6, 4, 5,
        5, 6, 4, 2, 3, 1,
        3, 1, 2, 5, 6, 4,
        6, 4, 5, 3, 1, 2,
    ];
    const almostSolvedPuzzle = [...solution2x3];
    almostSolvedPuzzle[34] = 0;
    almostSolvedPuzzle[35] = 0; // last cell R6 C6 = 2

    let saved = createSudokuGame({
        difficulty: 'easy',
        variant: '2x3',
        puzzle: almostSolvedPuzzle,
        solution: solution2x3,
    });
    saved = setCellValue(saved, 34, solution2x3[34]);
    saveSoloGameSnapshot(saved, 'almost-solved-room');

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume Current Game' }));

    const cells = screen.getAllByRole('gridcell');
    fireEvent.click(cells[35]);
    expect(cells[35]).toHaveClass('sudoku-cell--selected');

    fireEvent.click(document.querySelector('.numpad-btn[data-digit="2"]'));

    const board = document.getElementById('sudoku-board');
    expect(board).toHaveClass('sudoku-board--solved');
    expect(document.querySelectorAll('.sudoku-cell--selected')).toHaveLength(0);
    expect(document.querySelectorAll('.sudoku-cell--peer')).toHaveLength(0);
    expect(document.querySelectorAll('.sudoku-cell--same-digit')).toHaveLength(0);
    expect(document.querySelectorAll('.sudoku-cell--revealed')).toHaveLength(36);
});

it('defaults background music to Off (opt-in) on Start screen, syncs with Settings, and remembers preference across reload', () => {
    render(<App />);

    const setupMusicGroup = document.getElementById('setup-music-control').querySelector('[role="radiogroup"]');
    expect(setupMusicGroup.querySelector('input[value="false"]')).toBeChecked();
    expect(setupMusicGroup.querySelector('input[value="true"]')).not.toBeChecked();

    // Opt in directly on the Start screen
    fireEvent.click(setupMusicGroup.querySelector('input[value="true"]'));
    expect(localStorage.getItem('sudoku_music_enabled')).toBe('true');
    expect(setupMusicGroup.querySelector('input[value="true"]')).toBeChecked();

    // Settings reflects the opted-in music state
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    const settingsMusicGroup = screen.getByRole('radiogroup', { name: 'Background Music' });
    expect(settingsMusicGroup.querySelector('input[value="true"]')).toBeChecked();
    expect(screen.getByRole('slider', { name: 'Volume: Background Music' })).not.toBeDisabled();

    // Reload / remount remembers the opted-in preference on both Start and Settings
    cleanup();
    render(<App />);
    const reloadedSetupGroup = document.getElementById('setup-music-control').querySelector('[role="radiogroup"]');
    expect(reloadedSetupGroup.querySelector('input[value="true"]')).toBeChecked();

    // Turning it off in Settings persists Off across reload
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('radiogroup', { name: 'Background Music' }).querySelector('input[value="false"]'));
    expect(localStorage.getItem('sudoku_music_enabled')).toBe('false');

    cleanup();
    render(<App />);
    expect(document.getElementById('setup-music-control').querySelector('input[value="false"]')).toBeChecked();
});


