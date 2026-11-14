import { getDefaultStorage, loadBooleanPref, saveBooleanPref } from '../utils/storage.js';

export const JOIN_ALLOWED_STORAGE_KEY = 'sudoku_joins_allowed';
export const JOIN_AUTO_ACCEPT_STORAGE_KEY = 'sudoku_joins_auto_accept';

export function normalizeJoinPolicy(policy) {
    if (policy === 'disabled' || policy === 'auto' || policy === 'confirm') {
        return policy;
    }
    return 'confirm';
}

export function loadJoinsAllowed(storage = getDefaultStorage('local')) {
    return loadBooleanPref(JOIN_ALLOWED_STORAGE_KEY, true, storage);
}

export function saveJoinsAllowed(allowed, storage = getDefaultStorage('local')) {
    saveBooleanPref(JOIN_ALLOWED_STORAGE_KEY, allowed, storage);
}

export function loadJoinsAutoAccept(storage = getDefaultStorage('local')) {
    return loadBooleanPref(JOIN_AUTO_ACCEPT_STORAGE_KEY, false, storage);
}

export function saveJoinsAutoAccept(autoAccept, storage = getDefaultStorage('local')) {
    saveBooleanPref(JOIN_AUTO_ACCEPT_STORAGE_KEY, autoAccept, storage);
}

export function resolveJoinPolicy(joinsAllowed, joinsAutoAccept) {
    if (!joinsAllowed) return 'disabled';
    return joinsAutoAccept ? 'auto' : 'confirm';
}
