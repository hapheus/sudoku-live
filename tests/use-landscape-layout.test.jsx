import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useLandscapeLayout } from '../src/hooks/useLandscapeLayout.js';

afterEach(() => vi.unstubAllGlobals());
it('tracks orientation changes and removes its listener on unmount', () => {
    let notify;
    const media = { matches: false, addEventListener: vi.fn((_, listener) => { notify = listener; }), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    const { result, unmount } = renderHook(() => useLandscapeLayout());
    expect(result.current).toBe(false);
    act(() => { media.matches = true; notify(); });
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith("(orientation: landscape)");
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', notify);
});
