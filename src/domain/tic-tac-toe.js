const WINNING_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];

export function playMove(game, playerId, index) {
    if (!game || game.winner || game.draw || game.players[game.turn] !== playerId
        || !Number.isInteger(index) || index < 0 || index > 8 || game.board[index]) return game;
    const board = [...game.board];
    board[index] = game.turn;
    const winner = WINNING_LINES.some((line) => line.every((cell) => board[cell] === game.turn)) ? game.turn : null;
    return { ...game, board, winner, draw: !winner && board.every(Boolean), turn: game.turn === 'X' ? 'O' : 'X' };
}

export function isValidChallenge(value) {
    if (!value || typeof value.triggered !== 'boolean' || !Array.isArray(value.shifts) || value.shifts.length > 4
        || value.shifts.some((shift) => !shift || typeof shift.playerId !== 'string')) return false;
    const game = value.game;
    if (game === null) return true;
    return Boolean(game && value.triggered && game.players && typeof game.players.X === 'string'
        && typeof game.players.O === 'string' && game.players.X !== game.players.O
        && Array.isArray(game.board) && game.board.length === 9
        && game.board.every((cell) => cell === null || cell === 'X' || cell === 'O')
        && (game.turn === 'X' || game.turn === 'O')
        && ['transition', 'playing', 'return'].includes(game.phase));
}

export function createShiftChallenge() {
    return { shifts: [], game: null, triggered: false };
}

export function recordShift(state, shift, members) {
    if (state.triggered) return state;
    if (!shift || !['row', 'col'].includes(shift.axis) || !Number.isInteger(shift.from)
        || !Number.isInteger(shift.to) || shift.from < 0 || shift.from > 8 || shift.to < 0 || shift.to > 8
        || shift.from === shift.to || ![-1, 1].includes(shift.direction)) return { ...state, shifts: [] };
    const players = members.filter((member) => member.role === 'host' || member.role === 'guest');
    if (players.length !== 2 || players.some((player) => !player.id)
        || new Set(players.map((player) => player.id)).size !== 2
        || !players.some((player) => player.id === shift.playerId)) {
        return { ...state, shifts: [] };
    }

    const playerIds = new Set(players.map((player) => player.id));
    const previous = state.shifts.every((entry) => playerIds.has(entry.playerId)) ? state.shifts : [];
    const shifts = [...previous, shift].slice(-4);
    const inverse = (a, b) => a.playerId !== b.playerId && a.axis === b.axis
        && Number.isInteger(a.from) && Number.isInteger(a.to)
        && a.from === b.to && a.to === b.from && a.direction === -b.direction;
    if (shifts.length === 4 && inverse(shifts[0], shifts[1]) && inverse(shifts[2], shifts[3])) {
        const x = shifts[0].playerId;
        const o = players.find((player) => player.id !== x).id;
        return { shifts: [], triggered: true, game: { players: { X: x, O: o }, turn: 'X', board: Array(9).fill(null) } };
    }
    return { ...state, shifts };
}
