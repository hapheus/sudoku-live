export const JOIN_ALLOWED_STORAGE_KEY = 'sudoku_joins_allowed';
export const JOIN_AUTO_ACCEPT_STORAGE_KEY = 'sudoku_joins_auto_accept';

export function normalizeJoinPolicy(policy) {
    if (policy === 'disabled' || policy === 'auto' || policy === 'confirm') {
        return policy;
    }
    return 'confirm';
}

export function loadJoinsAllowed(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
        return storage?.getItem(JOIN_ALLOWED_STORAGE_KEY) !== 'false';
    } catch {
        return true;
    }
}

export function saveJoinsAllowed(allowed, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
        storage?.setItem(JOIN_ALLOWED_STORAGE_KEY, allowed ? 'true' : 'false');
    } catch {
        // Ignore storage quota / privacy errors
    }
}

export function loadJoinsAutoAccept(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
        return storage?.getItem(JOIN_AUTO_ACCEPT_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

export function saveJoinsAutoAccept(autoAccept, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
        storage?.setItem(JOIN_AUTO_ACCEPT_STORAGE_KEY, autoAccept ? 'true' : 'false');
    } catch {
        // Ignore storage quota / privacy errors
    }
}

export function resolveJoinPolicy(joinsAllowed, joinsAutoAccept) {
    if (!joinsAllowed) return 'disabled';
    return joinsAutoAccept ? 'auto' : 'confirm';
}
