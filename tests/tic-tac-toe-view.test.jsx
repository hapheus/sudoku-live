import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicTacToeView } from '../src/components/TicTacToeView.jsx';

describe('TicTacToeView', () => {
    it('shows the current player turn and lets that player select a cell', () => {
        const onMove = vi.fn();
        const game = { players: { X: 'a', O: 'b' }, turn: 'X', board: Array(9).fill(null) };
        render(<TicTacToeView game={game} playerId="a" onMove={onMove} />);
        expect(screen.getByText("You are X. It's your turn.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Row 1, column 1' }));
        expect(onMove).toHaveBeenCalledWith(0);
    });

    it('shows O the waiting message and prevents spectator moves', () => {
        const onMove = vi.fn();
        const game = { players: { X: 'a', O: 'b' }, turn: 'X', board: Array(9).fill(null), phase: 'playing' };
        const { rerender } = render(<TicTacToeView game={game} playerId="b" onMove={onMove} />);
        expect(screen.getByText('You are O. Waiting for your opponent.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Row 1, column 1' })).toBeDisabled();
        rerender(<TicTacToeView game={game} playerId="a" isSpectating onMove={onMove} />);
        expect(screen.getByText("Watching Tic Tac Toe. Player X's turn.")).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Row 1, column 1' })).toBeDisabled();
    });

    it('announces transition, result and return messages', () => {
        const game = { players: { X: 'a', O: 'b' }, turn: 'O', board: Array(9).fill(null), phase: 'transition' };
        const { rerender } = render(<TicTacToeView game={game} playerId="a" onMove={() => {}} />);
        expect(screen.getByText("You undo me. I undo you. Let's settle this.")).toBeInTheDocument();
        rerender(<TicTacToeView game={{ ...game, phase: 'playing', winner: 'X' }} playerId="a" onMove={() => {}} />);
        expect(screen.getByText('Player X wins!')).toBeInTheDocument();
        rerender(<TicTacToeView game={{ ...game, phase: 'return' }} playerId="a" onMove={() => {}} />);
        expect(screen.getByText('Well, that settled nothing. Back to Sudoku!')).toBeInTheDocument();
    });

    it('uses localized messages when provided and focuses the section on mount', () => {
        const game = { players: { X: 'a', O: 'b' }, turn: 'X', board: Array(9).fill(null), phase: 'playing' };
        const messages = {
            ticTacToeTitle: 'Tic Tac Toe',
            ticTacToeYourTurn: 'Du bist {symbol}. Du bist dran.',
            ticTacToeCellLabel: 'Zeile {row}, Spalte {col}',
        };
        render(<TicTacToeView game={game} playerId="a" onMove={() => {}} messages={messages} />);
        expect(screen.getByText('Du bist X. Du bist dran.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Zeile 1, Spalte 1' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Tic Tac Toe' })).toHaveFocus();
    });
});
