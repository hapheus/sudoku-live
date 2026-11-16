import { describe, expect, it, beforeEach } from 'vitest';
import {
    PLAYER_NAME_STORAGE_KEY,
    MAX_PLAYER_NAME_LENGTH,
    generateRandomPlayerName,
    isValidPlayerName,
    sanitizePlayerName,
    loadOrCreatePlayerName,
    savePlayerName,
    resolveUniquePlayerName,
    assignUniqueMemberNames,
    extractHexTag4,
    formatPlayerTag,
} from '../src/services/player-name.js';
import { formatGameDuration } from '../src/utils/format-duration.js';

describe('player-name service', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('generates readable random player names within max length', () => {
        const names = new Set();
        for (let i = 0; i < 20; i += 1) {
            const name = generateRandomPlayerName();
            expect(typeof name).toBe('string');
            expect(name.length).toBeGreaterThanOrEqual(4);
            expect(name.length).toBeLessThanOrEqual(MAX_PLAYER_NAME_LENGTH);
            names.add(name);
        }
        expect(names.size).toBeGreaterThan(1);
    });

    it('validates and sanitizes player names to [A-Za-z0-9_-] only', () => {
        expect(isValidPlayerName('Alice_01-x')).toBe(true);
        expect(isValidPlayerName('Alice Bob')).toBe(false);
        expect(isValidPlayerName('Alice!')).toBe(false);
        expect(isValidPlayerName('<script>')).toBe(false);
        expect(isValidPlayerName('')).toBe(false);
        expect(isValidPlayerName(null)).toBe(false);

        expect(sanitizePlayerName('   Alice   Bob  ')).toBe('AliceBob');
        expect(sanitizePlayerName('Bob!@#$_1-2')).toBe('Bob_1-2');
        expect(sanitizePlayerName({ evil: true })).toBe('');
        expect(sanitizePlayerName('   ')).toBe('');
        expect(sanitizePlayerName(null)).toBe('');
        const longName = 'A'.repeat(40);
        expect(sanitizePlayerName(longName)).toBe('A'.repeat(MAX_PLAYER_NAME_LENGTH));
    });

    it('initializes with a random player name and persists it locally', () => {
        expect(localStorage.getItem(PLAYER_NAME_STORAGE_KEY)).toBeNull();
        const first = loadOrCreatePlayerName(localStorage);
        expect(first.length).toBeGreaterThan(0);
        expect(localStorage.getItem(PLAYER_NAME_STORAGE_KEY)).toBe(first);

        const second = loadOrCreatePlayerName(localStorage);
        expect(second).toBe(first);
    });

    it('regenerates and persists when stored player name is blank or invalid', () => {
        localStorage.setItem(PLAYER_NAME_STORAGE_KEY, '   ');
        const name = loadOrCreatePlayerName(localStorage);
        expect(name.length).toBeGreaterThan(0);
        expect(localStorage.getItem(PLAYER_NAME_STORAGE_KEY)).toBe(name);
    });

    it('saves custom player names locally and rejects invalid or empty names', () => {
        expect(savePlayerName('Clara_1', localStorage)).toBe('Clara_1');
        expect(localStorage.getItem(PLAYER_NAME_STORAGE_KEY)).toBe('Clara_1');
        expect(loadOrCreatePlayerName(localStorage)).toBe('Clara_1');

        expect(savePlayerName('  Clara  ', localStorage)).toBeNull();
        expect(savePlayerName('   ', localStorage)).toBeNull();
        expect(localStorage.getItem(PLAYER_NAME_STORAGE_KEY)).toBe('Clara_1');
    });

    it('adds automatic duplicate suffixes case-insensitively', () => {
        expect(resolveUniquePlayerName('Alice', [])).toBe('Alice');
        expect(resolveUniquePlayerName('Alice', ['Bob', 'Charlie'])).toBe('Alice');
        expect(resolveUniquePlayerName('Alice', ['alice'])).toBe('Alice (2)');
        expect(resolveUniquePlayerName('Alice', ['Alice', 'Alice (2)'])).toBe('Alice (3)');
        expect(resolveUniquePlayerName('   ', ['Player'])).toBe('Player (2)');
    });

    it('assigns unique displayName to room members with host priority', () => {
        const members = [
            { id: 'c2', role: 'guest', name: 'SwiftFox' },
            { id: 'c1', role: 'host', name: 'SwiftFox' },
            { id: 'c3', role: 'spectator', name: 'swiftfox' },
            { id: 'c4', role: 'spectator', name: 'CalmOwl' },
        ];
        const resolved = assignUniqueMemberNames(members);
        const byId = new Map(resolved.map((m) => [m.id, m.displayName]));
        expect(byId.get('c1')).toBe('SwiftFox');
        expect(byId.get('c2')).toBe('SwiftFox (2)');
        expect(byId.get('c3')).toBe('swiftfox (3)');
        expect(byId.get('c4')).toBe('CalmOwl');
    });

    it('formats player tag with 4 lowercase hex digits', () => {
        expect(extractHexTag4('client_abcd1234')).toBe('abcd');
        expect(extractHexTag4('room-xyz')).toMatch(/^[0-9a-f]{4}$/);
        expect(formatPlayerTag('Franz', 'client_abcd1234')).toBe('Franz#abcd');
    });
});

describe('formatGameDuration', () => {
    it('formats seconds into MM:SS and H:MM:SS cleanly', () => {
        expect(formatGameDuration(0)).toBe('00:00');
        expect(formatGameDuration(9)).toBe('00:09');
        expect(formatGameDuration(65)).toBe('01:05');
        expect(formatGameDuration(3661)).toBe('1:01:01');
        expect(formatGameDuration(-5)).toBe('00:00');
        expect(formatGameDuration(Number.NaN)).toBe('00:00');
    });
});
