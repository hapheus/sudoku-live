import { isValidChallenge } from '../domain/tic-tac-toe.js';

export const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const isBoundedString = (value, max = 256) => typeof value === 'string' && value.length > 0 && value.length <= max;
export const isIntegerIn = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
export const optional = (value, predicate) => value === undefined || predicate(value);
const nullable = (predicate) => (value) => value === null || predicate(value);
const isRole = (value) => value === 'host' || value === 'guest';
const isDifficulty = (value) => ['easy', 'medium', 'hard', 'expert'].includes(value);
const arrayOf = (value, length, predicate) => Array.isArray(value) && value.length === length && value.every(predicate);

export function validateContextEntries(entries, cells) {
    return Array.isArray(entries) && entries.length <= cells && entries.every((entry) =>
        Array.isArray(entry) && entry.length === 2 && isIntegerIn(entry[0], 0, cells - 1)
        && isIntegerIn(entry[1], 0, 60_000));
}

export function validateShift(shift, grid = 9) {
    return isObject(shift) && isBoundedString(shift.playerId, 64)
        && ['row', 'col'].includes(shift.axis) && [-1, 1].includes(shift.direction)
        && isIntegerIn(shift.from, 0, grid - 1) && isIntegerIn(shift.to, 0, grid - 1) && shift.from !== shift.to;
}

export function validateNetworkChallenge(value, grid = 9) {
    return isValidChallenge(value) && value.shifts.every((shift) => validateShift(shift, grid))
        && (!value.game || (isBoundedString(value.game.players.X, 64) && isBoundedString(value.game.players.O, 64)));
}

function validateStateVector(vector) {
    return isObject(vector) && Object.keys(vector).length <= 256
        && Object.entries(vector).every(([sender, seq]) => isBoundedString(sender, 64)
            && isIntegerIn(seq, 1, Number.MAX_SAFE_INTEGER));
}

export function validateNetworkEnvelope(data) {
    return optional(data.stateVector, validateStateVector)
        && optional(data.stateActor, (v) => isBoundedString(v, 64))
        && optional(data.senderId, (v) => isBoundedString(v, 64))
        && optional(data.eventId, (v) => isBoundedString(v))
        && optional(data.seq, (v) => isIntegerIn(v, 1, Number.MAX_SAFE_INTEGER))
        && optional(data.sentAt, (v) => isIntegerIn(v, 0, Number.MAX_SAFE_INTEGER))
        && optional(data.protocolVersion, (v) => isIntegerIn(v, 1, Number.MAX_SAFE_INTEGER));
}

function validateBoardState(state) {
    if (!isObject(state) || ![36, 81].includes(state.board?.length)) return false;
    const cells = state.board.length;
    const digit = cells === 36 ? 6 : 9;
    const validVariant = (value) => (cells === 36 ? ['2x3', '6x6'] : ['3x3', '9x9']).includes(value);
    return arrayOf(state.board, cells, (v) => isIntegerIn(v, 0, digit))
        && arrayOf(state.givens, cells, (v) => typeof v === 'boolean')
        && optional(state.variant, validVariant)
        && optional(state.difficulty, isDifficulty) && optional(state.requestedDifficulty, isDifficulty)
        && optional(state.status, (v) => ['in_progress', 'solved'].includes(v))
        && optional(state.elapsedSeconds, (v) => isIntegerIn(v, 0, Number.MAX_SAFE_INTEGER))
        && optional(state.notes, (v) => arrayOf(v, cells, (notes) => Array.isArray(notes)
            && notes.length <= digit && notes.every((n) => isIntegerIn(n, 1, digit))))
        && optional(state.cellOwners, (v) => arrayOf(v, cells, nullable(isRole)))
        && optional(state.solution, (v) => arrayOf(v, cells, (n) => isIntegerIn(n, 0, digit)));
}

export function validateHintPreview(preview, cells, digit) {
    return isObject(preview) && isIntegerIn(preview.index, 0, cells - 1)
        && optional(preview.contextEntries, (v) => validateContextEntries(v, cells))
        && optional(preview.digit, (v) => isIntegerIn(v, 1, digit))
        && optional(preview.mode, (v) => ['preview', 'solve', 'clear'].includes(v))
        && optional(preview.technique, (v) => isBoundedString(v))
        && optional(preview.unitType, (v) => v === null || ['row', 'col', 'box', 'cell'].includes(v))
        && optional(preview.unitIndex, (v) => v === null || isIntegerIn(v, 0, digit - 1));
}

export function validateSnapshotPayload(data) {
    if (!validateBoardState(data.gameState)) return false;
    const cells = data.gameState.board.length;
    const digit = cells === 36 ? 6 : 9;
    return optional(data.boardBackgroundId, nullable((v) => isBoundedString(v)))
        && optional(data.rematchRequestedBy, nullable(isRole))
        && optional(data.role, isRole)
        && optional(data.isRetroMode, (v) => typeof v === 'boolean')
        && optional(data.hostCursorIndex, nullable((v) => isIntegerIn(v, 0, cells - 1)))
        && optional(data.hostActiveDigit, nullable((v) => isIntegerIn(v, 1, digit)))
        && optional(data.hintPreview, nullable((v) => validateHintPreview(v, cells, digit)))
        && optional(data.ticTacToe, nullable((v) => validateNetworkChallenge(v, digit)))
        && optional(data.hints, (v) => Array.isArray(v) && v.length <= 256 && v.every((entry) =>
            Array.isArray(entry) && entry.length === 2 && isBoundedString(entry[0], 64)
            && isObject(entry[1]) && isIntegerIn(entry[1].index, 0, cells - 1)
            && optional(entry[1].senderId, (id) => isBoundedString(id, 64))
            && optional(entry[1].value, nullable((n) => isIntegerIn(n, 1, digit)))));
}
