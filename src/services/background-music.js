import {
    getDefaultStorage,
    loadBooleanPref,
    loadNumberPref,
    saveBooleanPref,
    saveNumberPref,
} from '../utils/storage.js';
import {
    clampVolume,
    createGestureListenerManager,
    getDefaultAudioContextClass,
    toPerceptualGain,
} from './audio-core.js';

const MUSIC_STORAGE_KEY = 'sudoku_music_enabled';
const MUSIC_VOLUME_STORAGE_KEY = 'sudoku_music_volume';
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

export function loadMusicEnabled(storage = getDefaultStorage('local')) {
    return loadBooleanPref(MUSIC_STORAGE_KEY, false, storage);
}

export function saveMusicEnabled(enabled, storage = getDefaultStorage('local')) {
    saveBooleanPref(MUSIC_STORAGE_KEY, enabled, storage);
}

export function loadMusicVolume(storage = getDefaultStorage('local')) {
    return loadNumberPref(MUSIC_VOLUME_STORAGE_KEY, DEFAULT_MUSIC_VOLUME, { min: 0, max: 1 }, storage);
}

export function saveMusicVolume(volume, storage = getDefaultStorage('local')) {
    saveNumberPref(
        MUSIC_VOLUME_STORAGE_KEY,
        volume,
        { min: 0, max: 1, fallback: DEFAULT_MUSIC_VOLUME },
        storage,
    );
}

export function createBackgroundMusicPlayer({
    tracks = getMusicTracks(),
    shuffle = true,
    random = Math.random,
    audioFactory = null,
    contextFactory = null,
    storage = getDefaultStorage('local'),
    win = typeof window !== 'undefined' ? window : null,
    doc = typeof document !== 'undefined' ? document : null,
    defaultVolume = null,
} = {}) {
    let enabled = loadMusicEnabled(storage);
    let volume = typeof defaultVolume === 'number'
        ? clampVolume(defaultVolume, DEFAULT_MUSIC_VOLUME)
        : loadMusicVolume(storage);
    let playlist = shuffle && tracks.length > 1 ? shuffleTracks(tracks, random) : [...tracks];
    let currentIndex = 0;
    let destroyed = false;
    let consecutiveErrors = 0;
    let audio = null;
    let audioCtx = null;
    let sourceNode = null;
    let gainNode = null;

    const gestureManager = createGestureListenerManager({
        target: win,
        capture: true,
        onGesture: handleUserGesture,
    });

    const applyOutputVolume = (vol) => {
        const gainValue = toPerceptualGain(vol, DEFAULT_MUSIC_VOLUME);
        if (audio) {
            audio.muted = vol <= 0;
            // When routed through a Web Audio GainNode, keep HTMLAudioElement.volume at 1
            // so desktop browsers do not double-attenuate and iOS uses GainNode exclusively.
            audio.volume = gainNode ? 1 : vol;
        }
        if (gainNode && audioCtx) {
            const now = audioCtx.currentTime || 0;
            try {
                if (typeof gainNode.gain.setTargetAtTime === 'function') {
                    gainNode.gain.setTargetAtTime(gainValue, now, 0.015);
                } else if (typeof gainNode.gain.setValueAtTime === 'function') {
                    gainNode.gain.setValueAtTime(gainValue, now);
                } else {
                    gainNode.gain.value = gainValue;
                }
            } catch {
                gainNode.gain.value = gainValue;
            }
        }
    };

    const ensureAudioGraph = () => {
        if (destroyed || !audio || gainNode) return Boolean(gainNode);

        let candidateCtx = null;
        if (typeof contextFactory === 'function') {
            candidateCtx = contextFactory();
        } else {
            const Ctor = getDefaultAudioContextClass(win);
            if (Ctor) {
                try {
                    candidateCtx = new Ctor();
                } catch {
                    candidateCtx = null;
                }
            }
        }

        if (
            !candidateCtx
            || typeof candidateCtx.createMediaElementSource !== 'function'
            || typeof candidateCtx.createGain !== 'function'
        ) {
            return false;
        }

        try {
            const srcNode = candidateCtx.createMediaElementSource(audio);
            const gain = candidateCtx.createGain();
            srcNode.connect(gain);
            gain.connect(candidateCtx.destination);
            audioCtx = candidateCtx;
            sourceNode = srcNode;
            gainNode = gain;
            applyOutputVolume(volume);
            return true;
        } catch {
            audioCtx = null;
            sourceNode = null;
            gainNode = null;
            return false;
        }
    };

    const resumeAudioContextIfNeeded = () => {
        if (!audioCtx || audioCtx.state === 'running' || typeof audioCtx.resume !== 'function') {
            return false;
        }
        try {
            const res = audioCtx.resume();
            if (res && typeof res.then === 'function') {
                res.then(
                    () => {
                        if (!destroyed && enabled && audio && !audio.paused) {
                            removeGestureListeners();
                        }
                    },
                    () => {
                        if (!destroyed && enabled) {
                            attachGestureListeners();
                        }
                    },
                );
            }
            return true;
        } catch {
            return false;
        }
    };

    const createAudio = () => {
        if (audio) return audio;
        if (typeof audioFactory === 'function') {
            audio = audioFactory();
        } else if (typeof Audio !== 'undefined') {
            audio = new Audio();
        }
        if (!audio) return null;

        audio.preload = 'auto';
        audio.volume = volume;
        audio.muted = volume <= 0;
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

    const removeGestureListeners = () => gestureManager.remove();

    const attachGestureListeners = () => {
        if (!destroyed) gestureManager.attach();
    };

    const tryPlay = () => {
        if (destroyed || !enabled || playlist.length === 0) return;
        if (doc && doc.visibilityState === 'hidden') return;

        const el = createAudio();
        if (!el || typeof el.play !== 'function') return;

        ensureAudioGraph();
        applyOutputVolume(volume);
        resumeAudioContextIfNeeded();

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
                        if (!audioCtx || audioCtx.state === 'running') {
                            removeGestureListeners();
                        } else {
                            attachGestureListeners();
                        }
                    },
                    () => {
                        if (!destroyed && enabled) {
                            attachGestureListeners();
                        }
                    },
                );
            } else {
                consecutiveErrors = 0;
                if (!audioCtx || audioCtx.state === 'running') {
                    removeGestureListeners();
                } else {
                    attachGestureListeners();
                }
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
        ensureAudioGraph();
        resumeAudioContextIfNeeded();
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
        } else if (doc.visibilityState === 'visible' && enabled) {
            resumeAudioContextIfNeeded();
            if (audio?.paused) {
                tryPlay();
            }
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

    const setVolume = (nextVolume) => {
        const resolved = clampVolume(nextVolume, volume);
        volume = resolved;
        saveMusicVolume(resolved, storage);
        if (audio) {
            ensureAudioGraph();
            resumeAudioContextIfNeeded();
            applyOutputVolume(resolved);
        }
    };

    const destroy = () => {
        if (destroyed) return;
        destroyed = true;
        removeGestureListeners();
        doc?.removeEventListener?.('visibilitychange', handleVisibilityChange);
        if (sourceNode && typeof sourceNode.disconnect === 'function') {
            try {
                sourceNode.disconnect();
            } catch {
                // Ignore disconnect errors
            }
        }
        if (gainNode && typeof gainNode.disconnect === 'function') {
            try {
                gainNode.disconnect();
            } catch {
                // Ignore disconnect errors
            }
        }
        if (audioCtx && typeof audioCtx.close === 'function') {
            try {
                audioCtx.close();
            } catch {
                // Ignore close errors
            }
        }
        sourceNode = null;
        gainNode = null;
        audioCtx = null;
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
        setVolume,
        getVolume: () => volume,
        playNext: advanceToNextTrack,
        isEnabled: () => enabled,
        getCurrentIndex: () => currentIndex,
        getCurrentTrack: () => playlist[currentIndex] || null,
        getTracks: () => [...playlist],
        destroy,
    };
}
