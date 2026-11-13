/**
 * Game Rules and State Engine for Tic Tac Toe
 */

export const WINNING_COMBINATIONS = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];

export function createInitialGameState() {
    return {
        board: Array(9).fill(null),
        currentTurn: 'X',
        status: 'in_progress', // 'in_progress' | 'won' | 'draw'
        winner: null,
        winningIndices: null,
        moveCount: 0,
    };
}

export function checkWinner(board) {
    for (const combo of WINNING_COMBINATIONS) {
        const [a, b, c] = combo;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return {
                player: board[a],
                indices: combo,
            };
        }
    }
    return null;
}

export function isDraw(board) {
    return checkWinner(board) === null && board.every((cell) => cell !== null);
}

export function makeMove(state, index, player = null) {
    if (state.status !== 'in_progress') {
        throw new Error('Game is already finished.');
    }

    if (index < 0 || index > 8) {
        throw new Error(`Invalid move index ${index}. Must be between 0 and 8.`);
    }

    if (state.board[index] !== null) {
        throw new Error('Cell is already occupied.');
    }

    const movingPlayer = player || state.currentTurn;
    if (movingPlayer !== state.currentTurn) {
        throw new Error('It is not your turn.');
    }

    const nextBoard = [...state.board];
    nextBoard[index] = movingPlayer;

    const winnerResult = checkWinner(nextBoard);
    if (winnerResult) {
        return {
            board: nextBoard,
            currentTurn: movingPlayer,
            status: 'won',
            winner: winnerResult.player,
            winningIndices: winnerResult.indices,
            moveCount: state.moveCount + 1,
        };
    }

    if (isDraw(nextBoard)) {
        return {
            board: nextBoard,
            currentTurn: movingPlayer === 'X' ? 'O' : 'X',
            status: 'draw',
            winner: null,
            winningIndices: null,
            moveCount: state.moveCount + 1,
        };
    }

    return {
        board: nextBoard,
        currentTurn: movingPlayer === 'X' ? 'O' : 'X',
        status: 'in_progress',
        winner: null,
        winningIndices: null,
        moveCount: state.moveCount + 1,
    };
}
