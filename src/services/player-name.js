import { getDefaultStorage, getStorageItem, setStorageItem } from '../utils/storage.js';

export const PLAYER_NAME_STORAGE_KEY = 'sudoku_player_name';
export const MAX_PLAYER_NAME_LENGTH = 24;
export const VALID_PLAYER_NAME_RE = /^[A-Za-z0-9_-]+$/;

const ADJECTIVES = [
    'Swift', 'Calm', 'Bright', 'Clever', 'Solar', 'Lucky', 'Bold', 'Quiet',
    'Agile', 'Warm', 'Silver', 'Golden', 'Cosmic', 'Gentle', 'Quick', 'Steady',
];

const ANIMALS = [
    'Fox', 'Owl', 'Panda', 'Lynx', 'Hare', 'Otter', 'Falcon', 'Deer',
    'Badger', 'Robin', 'Wolf', 'Seal', 'Heron', 'Finch', 'Koala', 'Raven',
];

function randomIndex(length) {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        return buf[0] % length;
    }
    return Math.floor(Math.random() * length);
}

/**
 * Returns true if raw is a non-empty player name containing only [A-Za-z0-9_-] up to MAX_PLAYER_NAME_LENGTH.
 */
export function isValidPlayerName(raw) {
    return typeof raw === 'string'
        && raw.length >= 1
        && raw.length <= MAX_PLAYER_NAME_LENGTH
        && VALID_PLAYER_NAME_RE.test(raw);
}

/**
 * Strips any characters outside [A-Za-z0-9_-] and caps length for safe display.
 */
export function sanitizePlayerName(raw) {
    if (typeof raw !== 'string') return '';
    return raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, MAX_PLAYER_NAME_LENGTH);
}

/**
 * Generates a readable random player name (e.g. "SwiftFox").
 */
export function generateRandomPlayerName() {
    const adj = ADJECTIVES[randomIndex(ADJECTIVES.length)];
    const animal = ANIMALS[randomIndex(ANIMALS.length)];
    return `${adj}${animal}`;
}

/**
 * Loads the persisted player name or initializes and persists a random one.
 */
export function loadOrCreatePlayerName(storage = getDefaultStorage('local')) {
    const stored = sanitizePlayerName(getStorageItem(PLAYER_NAME_STORAGE_KEY, '', storage));
    if (stored) {
        return stored;
    }
    const generated = generateRandomPlayerName();
    setStorageItem(PLAYER_NAME_STORAGE_KEY, generated, storage);
    return generated;
}

/**
 * Validates and persists a custom player name; returns null if invalid.
 */
export function savePlayerName(name, storage = getDefaultStorage('local')) {
    if (!isValidPlayerName(name)) {
        return null;
    }
    setStorageItem(PLAYER_NAME_STORAGE_KEY, name, storage);
    return name;
}

/**
 * Returns a unique player name by appending " (2)", " (3)", ... when colliding case-insensitively.
 */
export function resolveUniquePlayerName(desiredName, existingNames = []) {
    const base = sanitizePlayerName(desiredName) || 'Player';
    const taken = new Set(
        (existingNames || [])
            .filter((name) => typeof name === 'string')
            .map((name) => name.trim().toLowerCase())
            .filter(Boolean),
    );

    if (!taken.has(base.toLowerCase())) {
        return base;
    }

    let suffix = 2;
    while (taken.has(`${base} (${suffix})`.toLowerCase())) {
        suffix += 1;
    }
    return `${base} (${suffix})`;
}

/**
 * Extracts or deterministically derives a 4-character lowercase hex tag from a client/room ID.
 */
export function extractHexTag4(seed) {
    const raw = typeof seed === 'string' ? seed.replace(/^client_/, '') : '';
    const hexOnly = raw.toLowerCase().replace(/[^0-9a-f]/g, '');
    if (hexOnly.length >= 4) {
        return hexOnly.slice(0, 4);
    }
    let hash = 0x811c9dc5;
    const str = typeof seed === 'string' ? seed : '0000';
    for (let i = 0; i < str.length; i += 1) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(4, '0').slice(0, 4);
}

/**
 * Formats a player handle with its 4-hex-digit tag (e.g. "Franz#abcd").
 */
export function formatPlayerTag(name, seed) {
    const cleanName = sanitizePlayerName(name) || 'Player';
    return `${cleanName}#${extractHexTag4(seed)}`;
}

const ROLE_PRIORITY = { host: 0, guest: 1, spectator: 2 };

/**
 * Assigns deterministic unique `displayName` values to room members (host priority).
 */
export function assignUniqueMemberNames(members = []) {
    if (!Array.isArray(members) || members.length === 0) return [];

    const ordered = members
        .map((member, idx) => ({ member, idx }))
        .sort((a, b) => {
            const pa = ROLE_PRIORITY[a.member?.role] ?? 3;
            const pb = ROLE_PRIORITY[b.member?.role] ?? 3;
            if (pa !== pb) return pa - pb;
            const idA = String(a.member?.id || '');
            const idB = String(b.member?.id || '');
            return idA.localeCompare(idB) || a.idx - b.idx;
        });

    const taken = [];
    const displayByIdx = new Map();
    for (const { member, idx } of ordered) {
        const base = sanitizePlayerName(member?.name) || 'Player';
        const unique = resolveUniquePlayerName(base, taken);
        taken.push(unique);
        displayByIdx.set(idx, unique);
    }

    return members.map((member, idx) => ({
        ...member,
        displayName: displayByIdx.get(idx),
    }));
}
