import { hydrateGameState, serializeGameState } from '../domain/sudoku-engine.js';

const ROLE_KEY_PREFIX = 'sudoku_role_';
const STATE_KEY_PREFIX = 'sudoku_state_';
const SOLO_STORAGE_KEY = 'sudoku_solo_snapshot_v1';

export function loadParticipantSession(gameId) {
    if (!gameId) return null;
    const role = sessionStorage.getItem(`${ROLE_KEY_PREFIX}${gameId}`);
    if (role !== 'host' && role !== 'guest') {
        return null;
    }
    return { role };
}

export function saveParticipantSession(gameId, role) {
    if (!gameId) return;
    sessionStorage.setItem(`${ROLE_KEY_PREFIX}${gameId}`, role);
}

export function loadOnlineGameSnapshot(gameId) {
    if (!gameId) return null;
    try {
        const raw = sessionStorage.getItem(`${STATE_KEY_PREFIX}${gameId}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const gameState = hydrateGameState(parsed?.gameState);
        if (!gameState) return null;
        return {
            gameState,
            rematchRequestedBy: parsed.rematchRequestedBy || null,
        };
    } catch {
        return null;
    }
}

export function saveOnlineGameSnapshot(gameId, gameState, rematchRequestedBy = null) {
    if (!gameId || !gameState) return;
    try {
        sessionStorage.setItem(`${STATE_KEY_PREFIX}${gameId}`, JSON.stringify({
            gameState: serializeGameState(gameState),
            rematchRequestedBy,
        }));
    } catch {
        // Ignore storage quota errors
    }
}

export function loadSoloGameSnapshot() {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(SOLO_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const gameState = hydrateGameState(parsed?.gameState);
        if (!gameState) return null;
        return {
            gameState,
            roomId: typeof parsed.roomId === 'string' ? parsed.roomId : null,
        };
    } catch {
        return null;
    }
}

export function saveSoloGameSnapshot(gameState, roomId = null) {
    if (typeof localStorage === 'undefined' || !gameState) return;
    try {
        localStorage.setItem(SOLO_STORAGE_KEY, JSON.stringify({
            gameState: serializeGameState(gameState),
            roomId,
        }));
    } catch {
        // Ignore storage quota errors
    }
}

export function clearSoloGameSnapshot() {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.removeItem(SOLO_STORAGE_KEY);
    } catch {
        // Ignore storage errors
    }
}
