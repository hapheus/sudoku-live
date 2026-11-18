import { ALLOWED_REACTIONS } from '../utils/watcher-helpers.js';
import { isBoundedString, optional, validateContextEntries, validateNetworkChallenge, validateNetworkEnvelope, validateShift, validateSnapshotPayload } from './network-payloads.js';
import { isValidGameId } from './ws-config.js';

const VALID_JOIN_POLICIES = new Set(['auto', 'confirm', 'disabled']);
const VALID_ROLES = new Set(['host', 'guest']);
const VALID_MEMBER_ROLES = new Set(['host', 'guest', 'spectator']);
const VALID_LOBBY_MODES = new Set(['solo', 'online']);
const VALID_LOBBY_STATUSES = new Set(['waiting', 'in_progress', 'solved', 'finished']);
const VALID_DIFFICULTIES = new Set(['easy', 'medium', 'hard', 'expert']);
const VALID_VARIANTS = new Set(['3x3', '2x3', '9x9', '6x6']);
const SNAPSHOT_TYPES = new Set(['init', 'sync', 'new-puzzle-accept', 'ping']);
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
    'retro-mode',
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
    if (data.value !== undefined && data.value !== null && (!Number.isInteger(data.value) || data.value < 0 || data.value > maxDigit)) {
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

/**
 * Validates complete presence-announce payloads so manipulated member fields cannot crash clients.
 */
export function validatePresenceAnnounce(data) {
    if (!isPlainObject(data)) return false;
    if (typeof data.id !== 'string' || data.id.length < 4 || data.id.length > 64) return false;
    if (data.role !== undefined && !VALID_MEMBER_ROLES.has(data.role)) return false;
    if (!validateNetworkEnvelope(data)) return false;
    if (data.senderId !== undefined && data.senderId !== data.id) return false;
    if (!optional(data.minProtocolVersion, (v) => Number.isSafeInteger(v) && v >= 1)) return false;
    if (data.approvedGuestIds !== undefined && (!Array.isArray(data.approvedGuestIds)
        || data.approvedGuestIds.length > 256 || !data.approvedGuestIds.every((id) => isBoundedString(id, 64)))) return false;
    if (data.game_mode !== undefined && !VALID_LOBBY_MODES.has(data.game_mode)) return false;
    if (data.join_policy !== undefined && !VALID_JOIN_POLICIES.has(data.join_policy)) return false;
    if (data.name !== undefined && data.name !== null && (typeof data.name !== 'string' || data.name.length > 256)) return false;
    if (data.clientPlatform !== undefined && !isBoundedString(data.clientPlatform, 64)) return false;
    if (data.features !== undefined && (!Array.isArray(data.features) || data.features.length > 64 || !data.features.every((f) => isBoundedString(f, 64)))) {
        return false;
    }
    return true;
}

/**
 * Validates complete lobby-update payloads so manipulated room objects cannot crash WatchDirectory.
 */
export function validateLobbyUpdateMessage(data) {
    if (!isPlainObject(data) || !isValidGameId(data.game_id)) return false;
    if (data.status !== undefined && !VALID_LOBBY_STATUSES.has(data.status)) return false;
    if (data.game_mode !== undefined && !VALID_LOBBY_MODES.has(data.game_mode)) return false;
    if (data.difficulty !== undefined && !VALID_DIFFICULTIES.has(data.difficulty)) return false;
    if (data.variant !== undefined && !VALID_VARIANTS.has(data.variant)) return false;
    if (data.join_policy !== undefined && !VALID_JOIN_POLICIES.has(data.join_policy)) return false;
    if (data.host_name !== undefined && data.host_name !== null && typeof data.host_name !== 'string') return false;
    if (data.filled_count !== undefined && (!Number.isInteger(data.filled_count) || data.filled_count < 0 || data.filled_count > 81)) {
        return false;
    }
    if (data.total_cells !== undefined && data.total_cells !== 36 && data.total_cells !== 81) return false;
    if (data.elapsed_seconds !== undefined && (!Number.isFinite(data.elapsed_seconds) || data.elapsed_seconds < 0)) {
        return false;
    }
    return true;
}

/**
 * Validates incoming multiplayer game event type and payload bounds.
 */
export function validateIncomingGameMessage(type, data, totalCells = 81, maxDigit = 9) {
    if (typeof type !== 'string' || !VALID_GAME_TYPES.has(type) || !isPlainObject(data) || !validateNetworkEnvelope(data)) {
        return false;
    }

    if (data.gameState !== undefined && !SNAPSHOT_TYPES.has(type)) return false;

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
        return optional(data.mode, (mode) => ['clear', 'preview', 'solve'].includes(mode))
            && optional(data.contextEntries, (entries) => validateContextEntries(entries, totalCells))
            && (data.mode === 'clear' || isValidCellIndex(data.index, totalCells));
    case 'reaction':
        return typeof data.emoji === 'string' && ALLOWED_REACTIONS.has(data.emoji);
    case 'join-request':
        return isBoundedString(data.requestId)
            && isBoundedString(data.requesterId, 64)
            && (data.requesterName === undefined || data.requesterName === null || (typeof data.requesterName === 'string' && data.requesterName.length <= 256));
    case 'join-cancel':
        return isBoundedString(data.requestId)
            && isBoundedString(data.requesterId, 64);
    case 'join-response':
        return isBoundedString(data.requestId)
            && isBoundedString(data.requesterId, 64)
            && typeof data.accepted === 'boolean'
            && optional(data.reason, (v) => isBoundedString(v));
    case 'join-policy':
        return VALID_JOIN_POLICIES.has(data.joinPolicy);
    case 'init':
    case 'sync':
    case 'new-puzzle-accept':
    case 'ping':
        return validateSnapshotPayload(data);
    case 'fist-bump':
        return isValidCellIndex(data.index, totalCells)
            && optional(data.value, (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= maxDigit))
            && optional(data.phraseKey, (v) => ['fistBumpAmazing', 'fistBumpAwesome'].includes(v));
    case 'retro-mode':
        return typeof data.enabled === 'boolean';
    case 'tic-tac-toe-state':
        return validateNetworkChallenge(data.challenge, maxDigit);
    case 'tic-tac-toe-shift':
        return validateShift(data, maxDigit);
    case 'tic-tac-toe-move':
        return isBoundedString(data.playerId, 64)
            && Number.isInteger(data.index) && data.index >= 0 && data.index < 9;
    case 'new-puzzle-request':
    case 'new-puzzle-cancel':
    case 'new-puzzle-decline':
        return VALID_ROLES.has(data.role);
    default:
        return false;
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
