import React, { useEffect, useRef } from 'react';

const WINNING_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];

function formatMessage(template, replacements) {
    return Object.entries(replacements).reduce(
        (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
        template,
    );
}

function getWinningLine(board, winner) {
    if (!winner || !Array.isArray(board)) return null;
    return WINNING_LINES.find((line) => line.every((cell) => board[cell] === winner)) || null;
}

export function TicTacToeView({ game, playerId, onMove, isSpectating = false, messages = null }) {
    const sectionRef = useRef(null);
    const cellRefs = useRef([]);

    useEffect(() => {
        sectionRef.current?.focus();
    }, []);

    let symbol = null;
    if (!isSpectating && game.players.X === playerId) symbol = 'X';
    else if (!isSpectating && game.players.O === playerId) symbol = 'O';

    const title = messages?.ticTacToeTitle || 'Tic Tac Toe';
    const isReturnPhase = game.phase === 'return';
    let message;
    if (game.phase === 'transition') {
        message = messages?.ticTacToeTransition || "You undo me. I undo you. Let's settle this.";
    } else if (game.winner) {
        message = formatMessage(messages?.ticTacToeWinner || 'Player {winner} wins!', { winner: game.winner });
    } else if (game.draw) {
        message = messages?.ticTacToeDraw || 'Draw!';
    } else if (!symbol) {
        message = formatMessage(messages?.ticTacToeWatching || "Watching Tic Tac Toe. Player {turn}'s turn.", { turn: game.turn });
    } else {
        const template = game.turn === symbol
            ? (messages?.ticTacToeYourTurn || "You are {symbol}. It's your turn.")
            : (messages?.ticTacToeWaitTurn || 'You are {symbol}. Waiting for your opponent.');
        message = formatMessage(template, { symbol });
    }

    const returnMessage = messages?.ticTacToeReturn || 'Well, that settled nothing. Back to Sudoku!';
    const canPlay = game.phase !== 'transition' && !isReturnPhase && !game.winner && !game.draw && symbol === game.turn;
    const boardLabel = messages?.ticTacToeBoardLabel || 'Tic Tac Toe board';
    const cellTemplate = messages?.ticTacToeCellLabel || 'Row {row}, column {col}';
    const winningLine = getWinningLine(game.board, game.winner);
    const winningSet = winningLine ? new Set(winningLine) : null;

    const handleCellKeyDown = (event, index) => {
        const deltas = { ArrowUp: -3, ArrowDown: 3, ArrowLeft: -1, ArrowRight: 1 };
        const delta = deltas[event.key];
        if (!delta) return;
        event.preventDefault();
        let next = index + delta;
        while (next >= 0 && next < 9) {
            const target = cellRefs.current[next];
            if (target && !target.disabled) {
                target.focus();
                return;
            }
            next += delta;
        }
    };

    return (
        <section ref={sectionRef} tabIndex={-1} className="tic-tac-toe" aria-label={title}>
            <div className="tic-tac-toe__header">
                <h2 className="tic-tac-toe__title">{title}</h2>
                <p
                    className={`tic-tac-toe__status${game.winner ? ' tic-tac-toe__status--winner' : ''}`}
                    role={isReturnPhase ? undefined : 'status'}
                    aria-live={isReturnPhase ? undefined : 'polite'}
                >
                    {message}
                </p>
            </div>
            <div className={isReturnPhase ? 'tic-tac-toe-transition-stage tic-tac-toe-transition-stage--active' : 'tic-tac-toe-transition-stage'}>
                <div className="board-wrapper">
                    <div className="board-frame">
                        <div
                            className={`tic-tac-toe__board${game.winner ? ' tic-tac-toe__board--won' : ''}`}
                            role="group"
                            aria-label={boardLabel}
                        >
                            {game.board.map((value, index) => {
                                const baseLabel = formatMessage(cellTemplate, {
                                    row: Math.floor(index / 3) + 1,
                                    col: (index % 3) + 1,
                                });
                                const isWinnerCell = winningSet?.has(index);
                                const cellClass = [
                                    'tic-tac-toe__cell',
                                    value === 'X' ? 'tic-tac-toe__cell--x' : '',
                                    value === 'O' ? 'tic-tac-toe__cell--o' : '',
                                    isWinnerCell ? 'tic-tac-toe__cell--winner' : '',
                                ].filter(Boolean).join(' ');
                                return (
                                    <button
                                        key={index}
                                        ref={(el) => { cellRefs.current[index] = el; }}
                                        type="button"
                                        className={cellClass}
                                        aria-label={value ? `${baseLabel}: ${value}` : baseLabel}
                                        disabled={!canPlay || Boolean(value)}
                                        onClick={() => onMove(index)}
                                        onKeyDown={(e) => handleCellKeyDown(e, index)}
                                    >
                                        {value}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                {isReturnPhase && (
                    <div className="tic-tac-toe-transition" role="status" aria-live="polite">
                        <p className="tic-tac-toe-transition__text">{returnMessage}</p>
                    </div>
                )}
            </div>
        </section>
    );
}
