import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialGameState, makeMove, checkWinner, isDraw } from '../../resources/js/domain/game-engine.js';

describe('GameEngine', () => {
    let state;

    beforeEach(() => {
        state = createInitialGameState();
    });

    it('initializes with empty board and turn X', () => {
        expect(state.board).toEqual(Array(9).fill(null));
        expect(state.currentTurn).toBe('X');
        expect(state.status).toBe('in_progress');
        expect(state.winner).toBeNull();
        expect(state.winningIndices).toBeNull();
    });

    it('alternates turns between X and O', () => {
        const next1 = makeMove(state, 0);
        expect(next1.board[0]).toBe('X');
        expect(next1.currentTurn).toBe('O');

        const next2 = makeMove(next1, 4);
        expect(next2.board[4]).toBe('O');
        expect(next2.currentTurn).toBe('X');
    });

    it('prevents moves on occupied cells', () => {
        const next1 = makeMove(state, 0);
        expect(() => makeMove(next1, 0)).toThrow('Cell is already occupied.');
    });

    it('detects row wins and winning indices', () => {
        let s = state;
        // X: 0, O: 3
        // X: 1, O: 4
        // X: 2
        s = makeMove(s, 0);
        s = makeMove(s, 3);
        s = makeMove(s, 1);
        s = makeMove(s, 4);
        s = makeMove(s, 2);

        expect(s.status).toBe('won');
        expect(s.winner).toBe('X');
        expect(s.winningIndices).toEqual([0, 1, 2]);
    });

    it('detects diagonal wins', () => {
        let s = state;
        // X: 0, O: 1
        // X: 4, O: 2
        // X: 8
        s = makeMove(s, 0);
        s = makeMove(s, 1);
        s = makeMove(s, 4);
        s = makeMove(s, 2);
        s = makeMove(s, 8);

        expect(s.status).toBe('won');
        expect(s.winner).toBe('X');
        expect(s.winningIndices).toEqual([0, 4, 8]);
    });

    it('detects draws', () => {
        // X O X
        // X O O
        // O X X
        const moves = [0, 1, 2, 4, 3, 5, 7, 6, 8];
        let s = state;
        for (const idx of moves) {
            s = makeMove(s, idx);
        }

        expect(s.status).toBe('draw');
        expect(s.winner).toBeNull();
    });

    it('rejects moves after game completion', () => {
        let s = state;
        s = makeMove(s, 0);
        s = makeMove(s, 3);
        s = makeMove(s, 1);
        s = makeMove(s, 4);
        s = makeMove(s, 2); // Won

        expect(() => makeMove(s, 8)).toThrow('Game is already finished.');
    });
});
