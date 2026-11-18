import { useSyncExternalStore } from 'react';

const LANDSCAPE_QUERY = '(orientation: landscape)';

function subscribe(notify) {
    const media = window.matchMedia?.(LANDSCAPE_QUERY);
    if (!media) return () => {};
    media.addEventListener('change', notify);
    return () => media.removeEventListener('change', notify);
}

function isLandscape() {
    return Boolean(window.matchMedia?.(LANDSCAPE_QUERY).matches);
}

export function useLandscapeLayout() {
    return useSyncExternalStore(subscribe, isLandscape, () => false);
}
