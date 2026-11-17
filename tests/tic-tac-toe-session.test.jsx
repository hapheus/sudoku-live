import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTicTacToe } from '../src/hooks/useTicTacToe.js';

const members = [{ id: 'a', role: 'host' }, { id: 'b', role: 'guest' }, { id: 's', role: 'spectator' }];

describe('online tic tac toe session', () => {
    afterEach(() => { vi.useRealTimers(); sessionStorage.clear(); });

    it('keeps a mixed-version room in Sudoku when the mini-game is unsupported', () => {
        const stateRef = { current: { myRole: 'host', isSpectating: false, onlineGameId: 'legacy-room', currentMembers: members } };
        const onlineClientRef = { current: { clientId: 'a', supportsFeature: () => false, broadcastGameEvent: vi.fn() } };
        const { result } = renderHook(() => useTicTacToe({ stateRef, onlineClientRef }));
        act(() => {
            result.current.onShift({ axis: 'row', from: 0, to: 1, direction: 1 });
            result.current.onEvent('tic-tac-toe-shift', { playerId: 'b', axis: 'row', from: 1, to: 0, direction: -1 });
        });
        expect(result.current.challenge.shifts).toEqual([]);
        act(() => result.current.update({ triggered: true, shifts: [], game: {
            board: Array(9).fill(null), players: { X: 'a', O: 'b' }, turn: 'X', winner: null, draw: false, phase: 'transition',
        } }));
        act(() => result.current.onMembersChange(members));
        expect(result.current.challenge.game).toBeNull();
        expect(result.current.challenge.triggered).toBe(true);
        expect(onlineClientRef.current.broadcastGameEvent).not.toHaveBeenCalled();
    });

    it('restores the once-per-puzzle state for a reconnecting host', () => {
        vi.useFakeTimers();
        const stateRef = { current: { myRole: 'host', isSpectating: false, onlineGameId: 'restore-room', currentMembers: members } };
        const onlineClientRef = { current: { clientId: 'a', broadcastGameEvent: vi.fn() } };
        const first = renderHook(() => useTicTacToe({ stateRef, onlineClientRef }));
        act(() => {
            first.result.current.onShift({ axis: 'row', from: 0, to: 1, direction: 1 });
            first.result.current.onEvent('tic-tac-toe-shift', { playerId: 'b', axis: 'row', from: 1, to: 0, direction: -1 });
            first.result.current.onShift({ axis: 'row', from: 0, to: 1, direction: 1 });
            first.result.current.onEvent('tic-tac-toe-shift', { playerId: 'b', axis: 'row', from: 1, to: 0, direction: -1 });
        });
        first.unmount();
        const restored = renderHook(() => useTicTacToe({ stateRef, onlineClientRef }));
        act(() => restored.result.current.setRoom('restore-room'));
        expect(restored.result.current.challenge).toMatchObject({ triggered: true, game: { phase: 'transition' } });
    });

    it('synchronizes a game to both players and spectators and returns to Sudoku', () => {
        vi.useFakeTimers();
        const participants = [];
        const createParticipant = (id, role) => {
            const stateRef = { current: { myRole: role, isSpectating: role === 'spectator', onlineGameId: 'room', currentMembers: members } };
            const client = { clientId: id, broadcastGameEvent: vi.fn((_room, type, data) => {
                for (const participant of participants) if (participant.id !== id) participant.result.current.onEvent(type, data);
            }) };
            const hook = renderHook(() => useTicTacToe({ stateRef, onlineClientRef: { current: client } }));
            const participant = { id, ...hook };
            participants.push(participant);
            return participant;
        };
        const host = createParticipant('a', 'host');
        const guest = createParticipant('b', 'guest');
        const watcher = createParticipant('s', 'spectator');
        act(() => {
            host.result.current.onShift({ axis: 'row', from: 0, to: 1, direction: 1 });
            guest.result.current.onShift({ axis: 'row', from: 1, to: 0, direction: -1 });
            host.result.current.onShift({ axis: 'row', from: 0, to: 1, direction: 1 });
            guest.result.current.onShift({ axis: 'row', from: 1, to: 0, direction: -1 });
        });
        expect(watcher.result.current.challenge.game.phase).toBe('transition');
        act(() => vi.advanceTimersByTime(2500));
        expect(guest.result.current.challenge.game.phase).toBe('playing');
        for (const [participant, index] of [[host, 0], [guest, 3], [host, 1], [guest, 4], [host, 2]]) {
            act(() => participant.result.current.onMove(index));
        }
        expect(watcher.result.current.challenge.game.winner).toBe('X');
        act(() => vi.advanceTimersByTime(3500));
        expect(guest.result.current.challenge.game.phase).toBe('return');
        act(() => vi.advanceTimersByTime(2500));
        expect(watcher.result.current.challenge.game).toBeNull();
        expect(host.result.current.challenge.triggered).toBe(true);
        act(() => {
            host.result.current.onShift({ axis: 'row', from: 0, to: 1, direction: 1 });
            guest.result.current.onShift({ axis: 'row', from: 1, to: 0, direction: -1 });
            host.result.current.onShift({ axis: 'row', from: 0, to: 1, direction: 1 });
            guest.result.current.onShift({ axis: 'row', from: 1, to: 0, direction: -1 });
        });
        expect(host.result.current.challenge.game).toBeNull();
        act(() => watcher.result.current.onEvent('tic-tac-toe-state', { challenge: {} }));
        expect(watcher.result.current.challenge.game).toBeNull();
    });
});
