import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppPreferences } from '../src/hooks/useAppPreferences.js';

describe('useAppPreferences', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('lang');
    });

    it('initializes defaults and persists theme and language updates', () => {
        const { result } = renderHook(() => useAppPreferences());

        expect(result.current.theme).toBe('dark');
        expect(result.current.language).toBe('en');
        expect(result.current.joinPolicy).toBe('confirm');
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(document.documentElement.lang).toBe('en');

        act(() => {
            result.current.setTheme('light');
            result.current.setLanguage('de');
            result.current.setJoinsAutoAccept(true);
        });

        expect(document.documentElement.dataset.theme).toBe('light');
        expect(document.documentElement.lang).toBe('de');
        expect(localStorage.getItem('sudoku_theme')).toBe('light');
        expect(localStorage.getItem('sudoku_lang')).toBe('de');
        expect(result.current.joinPolicy).toBe('auto');
    });
});
