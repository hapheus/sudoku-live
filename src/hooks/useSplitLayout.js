import { useCallback, useSyncExternalStore } from 'react';

// Keep these in sync with the split-screen media rules in app.css.
export const LANDSCAPE_LAYOUT_QUERY = '(orientation: landscape), (horizontal-viewport-segments: 2)';
const STACKED_LAYOUT_QUERY = '(orientation: landscape) and (vertical-viewport-segments: 2)';
export const SPLIT_LAYOUT_QUERY = `${LANDSCAPE_LAYOUT_QUERY}, (min-width: 900px) and (min-height: 540px)`;

export function useSplitLayout(query = SPLIT_LAYOUT_QUERY) {
    const subscribe = useCallback((notify) => {
        const media = window.matchMedia?.(query);
        if (!media) return () => {};
        media.addEventListener('change', notify);
        return () => media.removeEventListener('change', notify);
    }, [query]);
    const getSnapshot = useCallback(() => Boolean(window.matchMedia?.(query).matches), [query]);
    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function useStackedLayout() {
    return useSplitLayout(window.sudokuShiftDuo ? '(orientation: landscape)' : STACKED_LAYOUT_QUERY);
}
