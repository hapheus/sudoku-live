const MUSIC_STORAGE_KEY = 'sudoku_music_enabled';
const DEFAULT_MUSIC_VOLUME = 0.45;

const discoveredTrackModules = import.meta.glob(
    [
        '../assets/music/*.mp3',
        '../assets/music/*.m4a',
        '../assets/music/*.aac',
        '../assets/music/*.ogg',
        '../assets/music/*.wav',
    ],
    { eager: true, import: 'default' },
);

export function getMusicTracks(modules = discoveredTrackModules) {
    return Object.entries(modules || {})
        .filter(([, src]) => typeof src === 'string' && src.length > 0)
        .sort(([pathA], [pathB]) => pathA.localeCompare(pathB, undefined, { numeric: true, sensitivity: 'base' }))
        .map(([filePath, src]) => {
            const fileName = filePath.split('/').pop() || filePath;
            const title = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
            return {
                id: fileName,
                title: title || fileName,
                src,
            };
        });
}

export function shuffleTracks(tracks, random = Math.random) {
    if (!Array.isArray(tracks)) return [];
    const copy = [...tracks];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const raw = typeof random === 'function' ? random() : Math.random();
        const j = Math.min(i, Math.max(0, Math.floor(raw * (i + 1))));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

export function loadMusicEnabled(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
        return storage?.getItem(MUSIC_STORAGE_KEY) !== 'false';
    } catch {
        return true;
    }
}

export function saveMusicEnabled(enabled, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
        storage?.setItem(MUSIC_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
        // Ignore storage quota / privacy errors
    }
}

export function createBackgroundMusicPlayer({
    tracks = getMusicTracks(),
    shuffle = true,
    random = Math.random,
    audioFactory = null,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    win = typeof window !== 'undefined' ? window : null,
    doc = typeof document !== 'undefined' ? document : null,
    defaultVolume = DEFAULT_MUSIC_VOLUME,
} = {}) {
    let enabled = loadMusicEnabled(storage);
    let playlist = shuffle && tracks.length > 1 ? shuffleTracks(tracks, random) : [...tracks];
    let currentIndex = 0;
    let destroyed = false;
    let waitingForGesture = false;
    let consecutiveErrors = 0;
    let audio = null;

    const gestureEvents = ['pointerdown', 'touchstart', 'keydown', 'click'];

    const createAudio = () => {
        if (audio) return audio;
        if (typeof audioFactory === 'function') {
            audio = audioFactory();
        } else if (typeof Audio !== 'undefined') {
            audio = new Audio();
        }
        if (!audio) return null;

        audio.preload = 'auto';
        audio.volume = defaultVolume;
        if ('playsInline' in audio) {
            audio.playsInline = true;
        }
        audio.setAttribute?.('playsinline', '');
        audio.loop = playlist.length === 1;
        if (playlist.length > 0) {
            audio.src = playlist[currentIndex].src;
        }
        return audio;
    };

    const removeGestureListeners = () => {
        if (!win || !waitingForGesture) return;
        waitingForGesture = false;
        for (const evt of gestureEvents) {
            win.removeEventListener(evt, handleUserGesture, true);
        }
    };

    const attachGestureListeners = () => {
        if (!win || waitingForGesture || destroyed) return;
        waitingForGesture = true;
        for (const evt of gestureEvents) {
            win.addEventListener(evt, handleUserGesture, { capture: true, passive: true });
        }
    };

    const tryPlay = () => {
        if (destroyed || !enabled || playlist.length === 0) return;
        if (doc && doc.visibilityState === 'hidden') return;

        const el = createAudio();
        if (!el || typeof el.play !== 'function') return;

        if (!el.src && playlist[currentIndex]) {
            el.src = playlist[currentIndex].src;
        }
        el.loop = playlist.length === 1;

        try {
            const result = el.play();
            if (result && typeof result.then === 'function') {
                result.then(
                    () => {
                        consecutiveErrors = 0;
                        removeGestureListeners();
                    },
                    () => {
                        if (!destroyed && enabled) {
                            attachGestureListeners();
                        }
                    },
                );
            } else {
                consecutiveErrors = 0;
                removeGestureListeners();
            }
        } catch {
            if (!destroyed && enabled) {
                attachGestureListeners();
            }
        }
    };

    function handleUserGesture() {
        if (destroyed || !enabled) {
            removeGestureListeners();
            return;
        }
        tryPlay();
    }

    const playTrackAt = (index) => {
        if (destroyed || playlist.length === 0) return;
        currentIndex = ((index % playlist.length) + playlist.length) % playlist.length;
        const el = createAudio();
        if (!el) return;

        el.loop = playlist.length === 1;
        el.src = playlist[currentIndex].src;
        if (typeof el.currentTime === 'number') {
            try {
                el.currentTime = 0;
            } catch {
                // Ignore if media isn't seekable yet
            }
        }
        if (enabled) {
            tryPlay();
        }
    };

    const advanceToNextTrack = () => {
        if (destroyed || playlist.length === 0) return;
        if (playlist.length === 1) {
            playTrackAt(0);
            return;
        }
        const nextIndex = currentIndex + 1;
        if (nextIndex < playlist.length) {
            playTrackAt(nextIndex);
            return;
        }
        if (shuffle) {
            const previousTrack = playlist[currentIndex];
            playlist = shuffleTracks(tracks, random);
            if (previousTrack && playlist[0]?.id === previousTrack.id && playlist.length > 1) {
                const raw = typeof random === 'function' ? random() : Math.random();
                const swapIndex = 1 + Math.min(playlist.length - 2, Math.max(0, Math.floor(raw * (playlist.length - 1))));
                [playlist[0], playlist[swapIndex]] = [playlist[swapIndex], playlist[0]];
            }
        }
        playTrackAt(0);
    };

    const handleEnded = () => {
        if (destroyed || !enabled || playlist.length === 0) return;
        consecutiveErrors = 0;
        if (playlist.length === 1) {
            if (typeof audio?.currentTime === 'number') {
                try {
                    audio.currentTime = 0;
                } catch {
                    // Ignore
                }
            }
            tryPlay();
            return;
        }
        advanceToNextTrack();
    };

    const handleError = () => {
        if (destroyed || !enabled || playlist.length <= 1) return;
        consecutiveErrors += 1;
        if (consecutiveErrors < playlist.length) {
            advanceToNextTrack();
        }
    };

    const handleVisibilityChange = () => {
        if (destroyed || !doc) return;
        if (doc.visibilityState === 'hidden') {
            audio?.pause?.();
        } else if (doc.visibilityState === 'visible' && enabled && audio?.paused) {
            tryPlay();
        }
    };

    const start = () => {
        if (destroyed || playlist.length === 0) return;
        const el = createAudio();
        if (el) {
            el.addEventListener?.('ended', handleEnded);
            el.addEventListener?.('error', handleError);
        }
        doc?.addEventListener?.('visibilitychange', handleVisibilityChange);
        if (enabled) {
            tryPlay();
        }
    };

    const setEnabled = (nextEnabled) => {
        const resolved = Boolean(nextEnabled);
        enabled = resolved;
        saveMusicEnabled(resolved, storage);
        if (!resolved) {
            removeGestureListeners();
            audio?.pause?.();
        } else {
            tryPlay();
        }
    };

    const destroy = () => {
        if (destroyed) return;
        destroyed = true;
        removeGestureListeners();
        doc?.removeEventListener?.('visibilitychange', handleVisibilityChange);
        if (audio) {
            audio.removeEventListener?.('ended', handleEnded);
            audio.removeEventListener?.('error', handleError);
            audio.pause?.();
            audio.src = '';
            audio = null;
        }
    };

    return {
        start,
        setEnabled,
        playNext: advanceToNextTrack,
        isEnabled: () => enabled,
        getCurrentIndex: () => currentIndex,
        getCurrentTrack: () => playlist[currentIndex] || null,
        getTracks: () => [...playlist],
        destroy,
    };
}
