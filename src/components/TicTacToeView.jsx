import React from 'react';

export function TicTacToeView({ game, playerId, onMove, isSpectating = false }) {
    let symbol = null;
    if (!isSpectating && game.players.X === playerId) symbol = 'X';
    else if (!isSpectating && game.players.O === playerId) symbol = 'O';
    let message;
    if (game.phase === 'transition') message = "You undo me. I undo you. Let's settle this.";
    else if (game.phase === 'return') message = 'Well, that settled nothing. Back to Sudoku!';
    else if (game.winner) message = `Player ${game.winner} wins!`;
    else if (game.draw) message = 'Draw!';
    else if (!symbol) message = `Watching Tic Tac Toe. Player ${game.turn}'s turn.`;
    else message = `You are ${symbol}. ${game.turn === symbol ? "It's your turn." : 'Waiting for your opponent.'}`;
    const canPlay = game.phase !== 'transition' && game.phase !== 'return' && !game.winner && !game.draw && symbol === game.turn;
    return (
        <section className="tic-tac-toe" aria-label="Tic Tac Toe">
            <h2>Tic Tac Toe</h2>
            <p role="status" aria-live="polite">{message}</p>
            <div className="tic-tac-toe__board" role="group" aria-label="Tic Tac Toe board">
                {game.board.map((value, index) => (
                    <button key={index} type="button" className="tic-tac-toe__cell"
                        aria-label={`Row ${Math.floor(index / 3) + 1}, column ${index % 3 + 1}${value ? ': ' + value : ''}`}
                        disabled={!canPlay || Boolean(value)} onClick={() => onMove(index)}>{value}</button>
                ))}
            </div>
        </section>
    );
}
