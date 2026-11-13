import { describe, it, expect } from 'vitest';
import { selectAiMove } from '../../resources/js/domain/ai.js';
import { createInitialGameState, makeMove, checkWinner } from '../../resources/js/domain/game-engine.js';

describe('Client AI', () => {
    it('easy selects an available cell', () => {
        const board = [
            'X', 'O', 'X',
            'O', null, 'X',
            'O', 'X', 'O',
        ];
        const move = selectAiMove(board, 'X', 'easy');
        expect(move).toBe(4);
    });

    it('medium takes immediate win', () => {
        const board = [
            'O', 'O', null,
            'X', 'X', null,
            null, null, null,
        ];
        const move = selectAiMove(board, 'O', 'medium');
        expect(move).toBe(2);
    });

    it('medium blocks opponent win', () => {
        const board = [
            'X', 'X', null,
            null, 'O', null,
            null, null, null,
        ];
        const move = selectAiMove(board, 'O', 'medium');
        expect(move).toBe(2);
    });

    it('hard never loses against all legal moves when AI is O', () => {
        function explore(board, turn, aiPlayer) {
            const winner = checkWinner(board);
            if (winner) {
                expect(winner.player).not.toBe(aiPlayer === 'X' ? 'O' : 'X');
                return;
            }
            const available = board.map((c, i) => c === null ? i : null).filter(i => i !== null);
            if (available.length === 0) return;

            if (turn === aiPlayer) {
                const move = selectAiMove(board, aiPlayer, 'hard');
                const next = [...board];
                next[move] = aiPlayer;
                explore(next, aiPlayer === 'X' ? 'O' : 'X', aiPlayer);
            } else {
                for (const move of available) {
                    const next = [...board];
                    next[move] = turn;
                    explore(next, aiPlayer, aiPlayer);
                }
            }
        }

        explore(Array(9).fill(null), 'X', 'O');
    });
});
