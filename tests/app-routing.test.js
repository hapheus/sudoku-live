import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    hasUnsavedProgress,
    isNativeCapacitorApp,
    parseInitialRoute,
    replaceBrowserUrl,
    updateBrowserUrl,
} from '../src/utils/app-routing.js';

describe('app-routing utilities', () => {
    afterEach(() => {
        delete window.Capacitor;
        window.history.replaceState({}, '', '/');
    });

    it('parses legal, watch, online, and solo routes', () => {
        window.history.replaceState({}, '', '/privacy');
        expect(parseInitialRoute()).toEqual({
            initialMode: 'solo',
            initialGameId: null,
            initialWatch: false,
            initialLegalPage: 'privacy',
        });

        window.history.replaceState({}, '', '/games/room-abc123?watch=1');
        expect(parseInitialRoute()).toEqual({
            initialMode: 'watch',
            initialGameId: 'room-abc123',
            initialWatch: true,
            initialLegalPage: null,
        });

        window.history.replaceState({}, '', '/?game=room-xyz789');
        expect(parseInitialRoute()).toEqual({
            initialMode: 'online',
            initialGameId: 'room-xyz789',
            initialWatch: false,
            initialLegalPage: null,
        });

        window.history.replaceState({}, '', '/');
        expect(parseInitialRoute()).toEqual({
            initialMode: 'solo',
            initialGameId: null,
            initialWatch: false,
            initialLegalPage: null,
        });
    });

    it('pushes and replaces browser URLs unless running natively', () => {
        const pushSpy = vi.spyOn(window.history, 'pushState');
        const replaceSpy = vi.spyOn(window.history, 'replaceState');

        updateBrowserUrl('/games/abc123');
        expect(pushSpy).toHaveBeenCalledWith({}, '', '/games/abc123');

        replaceBrowserUrl('/?mode=solo');
        expect(replaceSpy).toHaveBeenCalledWith({}, '', '/?mode=solo');

        window.Capacitor = { isNativePlatform: () => true };
        expect(isNativeCapacitorApp()).toBe(true);
        pushSpy.mockClear();
        updateBrowserUrl('/ignored');
        expect(pushSpy).not.toHaveBeenCalled();

        pushSpy.mockRestore();
        replaceSpy.mockRestore();
    });

    it('detects unsaved progress accurately', () => {
        expect(hasUnsavedProgress(null)).toBe(false);
        expect(hasUnsavedProgress({ status: 'solved' })).toBe(false);
        expect(hasUnsavedProgress({
            status: 'in_progress',
            givens: [true, false],
            filledCount: 1,
            notes: [[], []],
            history: [],
        })).toBe(false);
        expect(hasUnsavedProgress({
            status: 'in_progress',
            givens: [true, false],
            filledCount: 2,
            notes: [[], []],
            history: [],
        })).toBe(true);
        expect(hasUnsavedProgress({
            status: 'in_progress',
            givens: [true, false],
            filledCount: 1,
            notes: [[], [3]],
            history: [],
        })).toBe(true);
    });
});
