import { describe, expect, it } from 'vitest';
import { createShiftChallenge, isValidChallenge, recordShift, playMove } from '../src/domain/tic-tac-toe.js';

describe('shift challenge', () => {
    it('starts after two consecutive inverse pairs by two joined players, ignoring spectators', () => {
        const members = [{ id: 'a', role: 'host' }, { id: 'b', role: 'guest' }, { id: 'c', role: 'spectator' }];
        let state = createShiftChallenge();
        for (const [playerId, direction] of [['a', 1], ['b', -1], ['a', 1], ['b', -1]]) {
            state = recordShift(state, { playerId, axis: 'row', direction, from: direction === 1 ? 0 : 1, to: direction === 1 ? 1 : 0 }, members);
        }
        expect(state.game).toMatchObject({ players: { X: 'a', O: 'b' }, turn: 'X', board: Array(9).fill(null) });
    });

    it('assigns X to the guest when the guest starts the first pair', () => {
        const members = [{ id: 'a', role: 'host' }, { id: 'b', role: 'guest' }];
        let state = createShiftChallenge();
        for (const [playerId, from, to, direction] of [['b', 0, 1, 1], ['a', 1, 0, -1], ['b', 0, 1, 1], ['a', 1, 0, -1]]) {
            state = recordShift(state, { playerId, axis: 'col', from, to, direction }, members);
        }
        expect(state.game.players).toEqual({ X: 'b', O: 'a' });
    });

    it('does not mistake shifts of different rows in the same band for an undo', () => {
        const members = [{ id: 'a', role: 'host' }, { id: 'b', role: 'guest' }];
        let state = createShiftChallenge();
        for (const shift of [
            { playerId: 'a', axis: 'row', group: 0, direction: 1, from: 0, to: 1 },
            { playerId: 'b', axis: 'row', group: 0, direction: -1, from: 2, to: 1 },
            { playerId: 'a', axis: 'row', group: 0, direction: 1, from: 0, to: 1 },
            { playerId: 'b', axis: 'row', group: 0, direction: -1, from: 2, to: 1 },
        ]) state = recordShift(state, shift, members);
        expect(state.game).toBeNull();
    });

    it('enforces alternating turns and detects a win', () => {
        let game = { players: { X: 'a', O: 'b' }, turn: 'X', board: Array(9).fill(null) };
        expect(playMove(game, 'b', 0)).toBe(game);
        for (const [player, cell] of [['a', 0], ['b', 3], ['a', 1], ['b', 4], ['a', 2]]) {
            game = playMove(game, player, cell);
        }
        expect(game.winner).toBe('X');
        expect(playMove(game, 'b', 5)).toBe(game);
    });

    it('detects a draw and rejects moves into occupied cells', () => {
        let game = { players: { X: 'a', O: 'b' }, turn: 'X', board: Array(9).fill(null) };
        game = playMove(game, 'a', 0);
        expect(playMove(game, 'b', 0)).toBe(game);
        for (const [player, cell] of [['b', 1], ['a', 2], ['b', 4], ['a', 3], ['b', 5], ['a', 7], ['b', 6], ['a', 8]]) {
            game = playMove(game, player, cell);
        }
        expect(game.draw).toBe(true);
        expect(game.winner).toBeNull();
    });

    it('does not start without exactly two distinct joined players', () => {
        for (const members of [
            [{ id: 'a', role: 'host' }],
            [{ id: 'a', role: 'host' }, { id: 'b', role: 'guest' }, { id: 'd', role: 'guest' }],
        ]) {
            let state = createShiftChallenge();
            for (const [playerId, direction] of [['a', 1], ['b', -1], ['a', 1], ['b', -1]]) {
                state = recordShift(state, { playerId, axis: 'row', direction, from: direction === 1 ? 0 : 1, to: direction === 1 ? 1 : 0 }, members);
            }
            expect(state.game).toBeNull();
        }
    });

    it('supports shift indices above 8 for larger Sudoku variants', () => {
        const members = [{ id: 'a', role: 'host' }, { id: 'b', role: 'guest' }];
        let state = createShiftChallenge();
        for (const [playerId, from, to, direction] of [['a', 10, 11, 1], ['b', 11, 10, -1], ['a', 10, 11, 1], ['b', 11, 10, -1]]) {
            state = recordShift(state, { playerId, axis: 'row', from, to, direction }, members);
        }
        expect(state.game).toMatchObject({ players: { X: 'a', O: 'b' }, turn: 'X' });
    });

    it('rejects invalid winner or draw values in isValidChallenge', () => {
        const baseGame = { players: { X: 'a', O: 'b' }, turn: 'X', board: Array(9).fill(null), phase: 'playing' };
        expect(isValidChallenge({ triggered: true, shifts: [], game: { ...baseGame, winner: 'Z' } })).toBe(false);
        expect(isValidChallenge({ triggered: true, shifts: [], game: { ...baseGame, draw: 'yes' } })).toBe(false);
        expect(isValidChallenge({ triggered: true, shifts: [], game: { ...baseGame, winner: 'X', draw: false } })).toBe(true);
    });
});
