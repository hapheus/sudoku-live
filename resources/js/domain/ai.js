import { checkWinner, WINNING_COMBINATIONS } from './game-engine.js';

export function selectAiMove(board, aiPlayer, difficulty = 'hard') {
    const available = board
        .map((cell, idx) => (cell === null ? idx : null))
        .filter((idx) => idx !== null);

    if (available.length === 0) {
        throw new Error('No available moves.');
    }

    switch (difficulty) {
        case 'easy':
            return selectEasyMove(available);
        case 'medium':
            return selectMediumMove(board, aiPlayer, available);
        case 'hard':
        default:
            return selectHardMove(board, aiPlayer, available);
    }
}

function selectEasyMove(available) {
    const randomIndex = Math.floor(Math.random() * available.length);
    return available[randomIndex];
}

function selectMediumMove(board, aiPlayer, available) {
    const opponent = aiPlayer === 'X' ? 'O' : 'X';

    // 1. Take immediate win
    for (const move of available) {
        const next = [...board];
        next[move] = aiPlayer;
        if (checkWinner(next)?.player === aiPlayer) {
            return move;
        }
    }

    // 2. Block immediate opponent win
    for (const move of available) {
        const next = [...board];
        next[move] = opponent;
        if (checkWinner(next)?.player === opponent) {
            return move;
        }
    }

    // 3. Center preference
    if (available.includes(4)) {
        return 4;
    }

    // 4. Corner preference
    const corners = [0, 2, 6, 8].filter((c) => available.includes(c));
    if (corners.length > 0) {
        return corners[Math.floor(Math.random() * corners.length)];
    }

    return selectEasyMove(available);
}

function selectHardMove(board, aiPlayer, available) {
    // Optimization on empty board: center is immediately optimal
    if (available.length === 9) {
        return 4;
    }

    let bestScore = -Infinity;
    let bestMove = available[0];

    for (const move of available) {
        const next = [...board];
        next[move] = aiPlayer;
        const score = minimax(next, 0, false, aiPlayer);
        if (score > bestScore) {
            bestScore = score;
            bestMove = move;
        }
    }

    return bestMove;
}

function minimax(board, depth, isMaximizing, aiPlayer) {
    const winner = checkWinner(board);
    if (winner) {
        return winner.player === aiPlayer ? 10 - depth : depth - 10;
    }

    const available = board
        .map((cell, idx) => (cell === null ? idx : null))
        .filter((idx) => idx !== null);

    if (available.length === 0) {
        return 0; // Draw
    }

    const opponent = aiPlayer === 'X' ? 'O' : 'X';

    if (isMaximizing) {
        let maxScore = -Infinity;
        for (const move of available) {
            const next = [...board];
            next[move] = aiPlayer;
            const score = minimax(next, depth + 1, false, aiPlayer);
            maxScore = Math.max(maxScore, score);
        }
        return maxScore;
    } else {
        let minScore = Infinity;
        for (const move of available) {
            const next = [...board];
            next[move] = opponent;
            const score = minimax(next, depth + 1, true, aiPlayer);
            minScore = Math.min(minScore, score);
        }
        return minScore;
    }
}
