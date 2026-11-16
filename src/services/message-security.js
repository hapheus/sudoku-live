import { ALLOWED_REACTIONS } from '../utils/watcher-helpers.js';
import { isValidChallenge } from '../domain/tic-tac-toe.js';

const VALID_JOIN_POLICIES = new Set(['auto', 'confirm', 'disabled']);
const VALID_ROLES = new Set(['host', 'guest']);
const VALID_GAME_TYPES = new Set([
    'init',
    'sync',
    'cell-update',
    'cursor',
    'active-digit',
    'hint',
    'hint-highlight',
    'reaction',
    'join-request',
    'join-cancel',
    'join-response',
    'join-policy',
    'new-puzzle-request',
    'new-puzzle-accept',
    'new-puzzle-decline',
    'new-puzzle-cancel',
    'ping',
    'fist-bump',
    'tic-tac-toe-state',
    'tic-tac-toe-shift',
    'tic-tac-toe-move',
]);

function isPlainObject(val) {
    return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function isValidCellIndex(index, totalCells) {
    return Number.isInteger(index) && index >= 0 && index < totalCells;
}

function isValidNotesArray(notes, maxDigit) {
    return Array.isArray(notes)
        && notes.length <= maxDigit
        && notes.every((n) => Number.isInteger(n) && n >= 1 && n <= maxDigit);
}

function validateCellUpdate(data, totalCells, maxDigit) {
    if (!isValidCellIndex(data.index, totalCells)) return false;
    if (data.value !== undefined && (!Number.isInteger(data.value) || data.value < 0 || data.value > maxDigit)) {
        return false;
    }
    if (data.notes !== undefined && !isValidNotesArray(data.notes, maxDigit)) return false;
    if (data.owner !== undefined && data.owner !== null && data.owner !== 'host' && data.owner !== 'guest') {
        return false;
    }
    return true;
}

function validateCursor(data, totalCells) {
    if (!VALID_ROLES.has(data.role)) return false;
    return data.index === null || data.index === undefined || isValidCellIndex(data.index, totalCells);
}

function validateHint(data, totalCells, maxDigit) {
    if (data.index !== null && data.index !== undefined && !isValidCellIndex(data.index, totalCells)) {
        return false;
    }
    if (data.value !== undefined && data.value !== null && (!Number.isInteger(data.value) || data.value < 1 || data.value > maxDigit)) {
        return false;
    }
    return true;
}

function validateGameStatePayload(data) {
    return isPlainObject(data.gameState)
        && Array.isArray(data.gameState.board)
        && Array.isArray(data.gameState.givens);
}

/**
 * Validates incoming multiplayer game event type and payload bounds.
 */
export function validateIncomingGameMessage(type, data, totalCells = 81, maxDigit = 9) {
    if (typeof type !== 'string' || !VALID_GAME_TYPES.has(type) || !isPlainObject(data)) {
        return false;
    }

    switch (type) {
    case 'cell-update':
        return validateCellUpdate(data, totalCells, maxDigit);
    case 'cursor':
        return validateCursor(data, totalCells);
    case 'active-digit':
        return data.digit === null || data.digit === undefined
            || (Number.isInteger(data.digit) && data.digit >= 1 && data.digit <= maxDigit);
    case 'hint':
        return validateHint(data, totalCells, maxDigit);
    case 'hint-highlight':
        return data.mode === 'clear' || isValidCellIndex(data.index, totalCells);
    case 'reaction':
        return typeof data.emoji === 'string' && ALLOWED_REACTIONS.has(data.emoji);
    case 'join-request':
    case 'join-cancel':
        return typeof data.requestId === 'string' && data.requestId.length > 0
            && typeof data.requesterId === 'string' && data.requesterId.length > 0;
    case 'join-response':
        return typeof data.requestId === 'string' && data.requestId.length > 0
            && typeof data.requesterId === 'string' && data.requesterId.length > 0
            && typeof data.accepted === 'boolean';
    case 'join-policy':
        return VALID_JOIN_POLICIES.has(data.joinPolicy);
    case 'init':
    case 'sync':
    case 'new-puzzle-accept':
    case 'ping':
        return validateGameStatePayload(data);
    case 'fist-bump':
        return isValidCellIndex(data.index, totalCells);
    case 'tic-tac-toe-state':
        return isValidChallenge(data.challenge);
    case 'tic-tac-toe-shift':
        return typeof data.playerId === 'string' && data.playerId.length > 0;
    case 'tic-tac-toe-move':
        return typeof data.playerId === 'string' && data.playerId.length > 0
            && Number.isInteger(data.index) && data.index >= 0 && data.index < 9;
    default:
        return true;
    }
}

/**
 * Enforces monotonic per-sender sequence numbers and timestamp skew bounds against replay/out-of-order attacks.
 */
export function createMessageOrderGuard({ nowFn = () => Date.now(), maxClockSkewMs = 300_000 } = {}) {
    const lastSeqBySender = new Map();

    return {
        accept({ senderId, seq, sentAt } = {}) {
            if (typeof sentAt === 'number') {
                if (!Number.isFinite(sentAt)) return false;
                const now = nowFn();
                if (Math.abs(now - sentAt) > maxClockSkewMs) {
                    return false;
                }
            }
            if (typeof senderId === 'string' && senderId.length > 0 && Number.isInteger(seq)) {
                if (seq < 1) return false;
                const lastSeq = lastSeqBySender.get(senderId) ?? 0;
                if (seq <= lastSeq) {
                    return false;
                }
                lastSeqBySender.set(senderId, seq);
            }
            return true;
        },
        clear() {
            lastSeqBySender.clear();
        },
    };
}

/**
 * Binds Centrifugo serverClientId/user to logical senderId to prevent spoofing and impersonation.
 */
export function createSenderIdentityGuard() {
    const senderByServerClient = new Map();
    const serverClientBySender = new Map();
    const userByServerClient = new Map();

    return {
        verify({ serverClientId, serverUser = null, senderId } = {}) {
            if (!serverClientId) {
                return true;
            }
            if (serverUser) {
                const boundUser = userByServerClient.get(serverClientId);
                if (boundUser && boundUser !== serverUser) {
                    return false;
                }
                userByServerClient.set(serverClientId, serverUser);
            }
            if (typeof senderId === 'string' && senderId.length > 0) {
                const boundSender = senderByServerClient.get(serverClientId);
                if (boundSender && boundSender !== senderId) {
                    return false;
                }
                const boundClient = serverClientBySender.get(senderId);
                if (boundClient && boundClient !== serverClientId) {
                    return false;
                }
                senderByServerClient.set(serverClientId, senderId);
                serverClientBySender.set(senderId, serverClientId);
            }
            return true;
        },
        releaseServerClient(serverClientId) {
            if (!serverClientId) return;
            const boundSender = senderByServerClient.get(serverClientId);
            senderByServerClient.delete(serverClientId);
            userByServerClient.delete(serverClientId);
            if (boundSender && serverClientBySender.get(boundSender) === serverClientId) {
                serverClientBySender.delete(boundSender);
            }
        },
        clear() {
            senderByServerClient.clear();
            serverClientBySender.clear();
            userByServerClient.clear();
        },
    };
}
