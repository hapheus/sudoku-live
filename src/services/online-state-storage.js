import { hydrateGameState, serializeGameState } from '../domain/sudoku-engine.js';
import {
    getDefaultStorage,
    getStorageItem,
    loadJson,
    removeStorageItem,
    saveJson,
    setStorageItem,
} from '../utils/storage.js';

const ROLE_KEY_PREFIX = 'sudoku_role_';
const STATE_KEY_PREFIX = 'sudoku_state_';
const SOLO_STORAGE_KEY = 'sudoku_solo_snapshot_v1';

export function loadParticipantSession(gameId) {
    if (!gameId) return null;
    const role = getStorageItem(`${ROLE_KEY_PREFIX}${gameId}`, null, getDefaultStorage('session'));
    if (role !== 'host' && role !== 'guest') {
        return null;
    }
    return { role };
}

export function saveParticipantSession(gameId, role) {
    if (!gameId) return;
    setStorageItem(`${ROLE_KEY_PREFIX}${gameId}`, role, getDefaultStorage('session'));
}

export function clearParticipantSession(gameId) {
    if (gameId) removeStorageItem(`${ROLE_KEY_PREFIX}${gameId}`, getDefaultStorage('session'));
}

function loadHydratedSnapshot(key, storage) {
    const parsed = loadJson(key, null, storage);
    const gameState = hydrateGameState(parsed?.gameState);
    if (!gameState) return null;
    return { parsed, gameState };
}

export function loadOnlineGameSnapshot(gameId) {
    if (!gameId) return null;
    const loaded = loadHydratedSnapshot(`${STATE_KEY_PREFIX}${gameId}`, getDefaultStorage('session'));
    if (!loaded) return null;
    const { parsed, gameState } = loaded;
    return {
        gameState,
        rematchRequestedBy: parsed.rematchRequestedBy || null,
        boardBackgroundId: typeof parsed.boardBackgroundId === 'string' ? parsed.boardBackgroundId : null,
    };
}

export function saveOnlineGameSnapshot(gameId, gameState, rematchRequestedBy = null, boardBackgroundId = null) {
    if (!gameId || !gameState) return;
    saveJson(
        `${STATE_KEY_PREFIX}${gameId}`,
        {
            gameState: serializeGameState(gameState),
            rematchRequestedBy,
            boardBackgroundId: typeof boardBackgroundId === 'string' ? boardBackgroundId : null,
        },
        getDefaultStorage('session'),
    );
}

export function clearOnlineGameSnapshot(gameId) {
    if (gameId) removeStorageItem(`${STATE_KEY_PREFIX}${gameId}`, getDefaultStorage('session'));
}

export function loadSoloGameSnapshot() {
    const loaded = loadHydratedSnapshot(SOLO_STORAGE_KEY, getDefaultStorage('local'));
    if (!loaded) return null;
    const { parsed, gameState } = loaded;
    return {
        gameState,
        roomId: typeof parsed.roomId === 'string' ? parsed.roomId : null,
        boardBackgroundId: typeof parsed.boardBackgroundId === 'string' ? parsed.boardBackgroundId : null,
    };
}

export function saveSoloGameSnapshot(gameState, roomId = null, boardBackgroundId = null) {
    if (!gameState) return;
    saveJson(
        SOLO_STORAGE_KEY,
        {
            gameState: serializeGameState(gameState),
            roomId,
            boardBackgroundId: typeof boardBackgroundId === 'string' ? boardBackgroundId : null,
        },
        getDefaultStorage('local'),
    );
}

export function clearSoloGameSnapshot() {
    removeStorageItem(SOLO_STORAGE_KEY, getDefaultStorage('local'));
}
