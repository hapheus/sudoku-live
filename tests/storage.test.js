import { describe, expect, it } from 'vitest';
import {
    getDefaultStorage,
    getStorageItem,
    loadBooleanPref,
    loadJson,
    loadNumberPref,
    removeStorageItem,
    saveBooleanPref,
    saveJson,
    saveNumberPref,
    setStorageItem,
} from '../src/utils/storage.js';

describe('storage utilities', () => {
    it('safely reads, writes, and removes items even when storage throws', () => {
        const throwingStorage = {
            getItem: () => { throw new Error('blocked'); },
            setItem: () => { throw new Error('quota'); },
            removeItem: () => { throw new Error('blocked'); },
        };

        expect(getStorageItem('k', 'fallback', throwingStorage)).toBe('fallback');
        expect(() => setStorageItem('k', 'v', throwingStorage)).not.toThrow();
        expect(() => removeStorageItem('k', throwingStorage)).not.toThrow();
        expect(getStorageItem('k', 'fallback', null)).toBe('fallback');
    });

    it('loads and saves boolean preferences with configurable defaults', () => {
        const map = new Map();
        const storage = {
            getItem: (k) => (map.has(k) ? map.get(k) : null),
            setItem: (k, v) => map.set(k, v),
        };

        expect(loadBooleanPref('opt_in', false, storage)).toBe(false);
        expect(loadBooleanPref('opt_out', true, storage)).toBe(true);

        saveBooleanPref('opt_in', true, storage);
        saveBooleanPref('opt_out', false, storage);

        expect(loadBooleanPref('opt_in', false, storage)).toBe(true);
        expect(loadBooleanPref('opt_out', true, storage)).toBe(false);
    });

    it('loads and saves clamped/validated number preferences', () => {
        const map = new Map();
        const storage = {
            getItem: (k) => (map.has(k) ? map.get(k) : null),
            setItem: (k, v) => map.set(k, v),
        };

        expect(loadNumberPref('vol', 0.45, { min: 0, max: 1 }, storage)).toBe(0.45);
        saveNumberPref('vol', 1.8, { min: 0, max: 1, fallback: 0.45 }, storage);
        expect(loadNumberPref('vol', 0.45, { min: 0, max: 1 }, storage)).toBe(1);

        map.set('vol', 'not-a-number');
        expect(loadNumberPref('vol', 0.45, { min: 0, max: 1 }, storage)).toBe(0.45);
    });

    it('loads and saves JSON payloads safely', () => {
        const map = new Map();
        const storage = {
            getItem: (k) => (map.has(k) ? map.get(k) : null),
            setItem: (k, v) => map.set(k, v),
        };

        saveJson('snap', { a: 1, b: 'two' }, storage);
        expect(loadJson('snap', null, storage)).toEqual({ a: 1, b: 'two' });

        map.set('broken', '{invalid');
        expect(loadJson('broken', { fallback: true }, storage)).toEqual({ fallback: true });
        expect(getDefaultStorage('local')).toBe(globalThis.localStorage);
    });
});
