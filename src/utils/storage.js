/**
 * Safe storage accessors and typed preference helpers.
 */

export function getDefaultStorage(kind = 'local') {
    if (kind === 'session') {
        return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    }
    return typeof localStorage !== 'undefined' ? localStorage : null;
}

export function getStorageItem(key, fallback = null, storage = getDefaultStorage('local')) {
    if (!key || !storage) return fallback;
    try {
        const value = storage.getItem(key);
        return value === null || value === undefined ? fallback : value;
    } catch {
        return fallback;
    }
}

export function setStorageItem(key, value, storage = getDefaultStorage('local')) {
    if (!key || !storage) return;
    try {
        storage.setItem(key, String(value));
    } catch {
        // Ignore storage quota / privacy errors
    }
}

export function removeStorageItem(key, storage = getDefaultStorage('local')) {
    if (!key || !storage) return;
    try {
        storage.removeItem(key);
    } catch {
        // Ignore storage errors
    }
}

export function loadBooleanPref(key, defaultValue = false, storage = getDefaultStorage('local')) {
    const raw = getStorageItem(key, null, storage);
    if (raw === null) return Boolean(defaultValue);
    return defaultValue ? raw !== 'false' : raw === 'true';
}

export function saveBooleanPref(key, value, storage = getDefaultStorage('local')) {
    setStorageItem(key, value ? 'true' : 'false', storage);
}

export function loadNumberPref(
    key,
    fallback,
    { min = -Infinity, max = Infinity } = {},
    storage = getDefaultStorage('local'),
) {
    const raw = getStorageItem(key, null, storage);
    if (raw === null || raw === '') return fallback;
    const num = Number(raw);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, num));
}

export function saveNumberPref(
    key,
    value,
    { min = -Infinity, max = Infinity, fallback = 0 } = {},
    storage = getDefaultStorage('local'),
) {
    const num = Number(value);
    const clamped = Number.isFinite(num) ? Math.min(max, Math.max(min, num)) : fallback;
    setStorageItem(key, String(clamped), storage);
}

export function loadJson(key, fallback = null, storage = getDefaultStorage('local')) {
    const raw = getStorageItem(key, null, storage);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

export function saveJson(key, value, storage = getDefaultStorage('local')) {
    if (!key || !storage) return;
    try {
        storage.setItem(key, JSON.stringify(value));
    } catch {
        // Ignore storage quota / privacy errors
    }
}
