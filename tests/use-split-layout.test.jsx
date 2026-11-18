import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SPLIT_LAYOUT_QUERY, useSplitLayout } from '../src/hooks/useSplitLayout.js';

afterEach(() => vi.unstubAllGlobals());
it('tracks split layout changes and removes its listener on unmount', () => {
    let notify;
    const media = { matches: false, addEventListener: vi.fn((_, listener) => { notify = listener; }), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    const { result, unmount } = renderHook(() => useSplitLayout());
    expect(result.current).toBe(false);
    act(() => { media.matches = true; notify(); });
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith(SPLIT_LAYOUT_QUERY);
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith('change', notify);
});
