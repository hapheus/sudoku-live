const SOUND_STORAGE_KEY = 'sudoku_sound_enabled';
const SOUND_VOLUME_STORAGE_KEY = 'sudoku_sound_volume';
const DEFAULT_SOUND_VOLUME = 0.65;
const MAX_SOUND_MASTER_GAIN = 0.7;

function clampVolume(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(1, Math.max(0, num));
}

function toPerceptualGain(volume) {
    const clamped = clampVolume(volume, DEFAULT_SOUND_VOLUME);
    if (clamped <= 0) return 0;
    return clamped * clamped;
}

function getDefaultAudioContextClass(win) {
    if (!win) return null;
    return win.AudioContext || win.webkitAudioContext || null;
}

export function loadSoundEnabled(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
        return storage?.getItem(SOUND_STORAGE_KEY) !== 'false';
    } catch {
        return true;
    }
}

export function saveSoundEnabled(enabled, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
        storage?.setItem(SOUND_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
        // Ignore storage quota / privacy errors
    }
}

export function loadSoundVolume(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
        const raw = storage?.getItem(SOUND_VOLUME_STORAGE_KEY);
        if (raw === null || raw === undefined || raw === '') return DEFAULT_SOUND_VOLUME;
        return clampVolume(raw, DEFAULT_SOUND_VOLUME);
    } catch {
        return DEFAULT_SOUND_VOLUME;
    }
}

export function saveSoundVolume(volume, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    try {
        storage?.setItem(SOUND_VOLUME_STORAGE_KEY, String(clampVolume(volume, DEFAULT_SOUND_VOLUME)));
    } catch {
        // Ignore storage quota / privacy errors
    }
}

function scheduleTone(ctx, destination, {
    freq,
    endFreq = null,
    startOffset = 0,
    duration = 0.16,
    type = 'sine',
    volume = 0.25,
    attack = 0.008,
    filterFreq = null,
}) {
    const startTime = (ctx.currentTime || 0) + startOffset;
    const stopTime = startTime + duration + 0.02;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (typeof endFreq === 'number' && endFreq > 0 && endFreq !== freq) {
        osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);
    }

    const peak = Math.max(0.0001, volume);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(peak, startTime + Math.min(attack, duration * 0.4));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    if (filterFreq && typeof ctx.createBiquadFilter === 'function') {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFreq, startTime);
        osc.connect(filter);
        filter.connect(gain);
    } else {
        osc.connect(gain);
    }

    gain.connect(destination);
    osc.start(startTime);
    osc.stop(stopTime);
}

export function createSoundEffectsPlayer({
    contextFactory = null,
    storage = typeof localStorage !== 'undefined' ? localStorage : null,
    win = typeof window !== 'undefined' ? window : null,
    masterVolume = null,
} = {}) {
    let enabled = loadSoundEnabled(storage);
    let volume = loadSoundVolume(storage);
    let destroyed = false;
    let ctx = null;
    let masterGain = null;
    let gestureListenersAttached = false;

    const computeMasterGain = (vol) => {
        const ceiling = typeof masterVolume === 'number'
            ? masterVolume / (DEFAULT_SOUND_VOLUME * DEFAULT_SOUND_VOLUME)
            : MAX_SOUND_MASTER_GAIN;
        return Math.max(0, ceiling * toPerceptualGain(vol));
    };

    const gestureEvents = ['pointerdown', 'touchstart', 'keydown', 'click'];

    const ensureContext = () => {
        if (destroyed) return null;
        if (ctx) return ctx;

        if (typeof contextFactory === 'function') {
            ctx = contextFactory();
        } else {
            const Ctor = getDefaultAudioContextClass(win);
            if (!Ctor) return null;
            try {
                ctx = new Ctor();
            } catch {
                return null;
            }
        }

        if (!ctx || typeof ctx.createOscillator !== 'function' || typeof ctx.createGain !== 'function') {
            ctx = null;
            return null;
        }

        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(computeMasterGain(volume), ctx.currentTime || 0);
        masterGain.connect(ctx.destination);
        return ctx;
    };

    const removeGestureListeners = () => {
        if (!win || !gestureListenersAttached) return;
        gestureListenersAttached = false;
        for (const evt of gestureEvents) {
            win.removeEventListener?.(evt, handleUserGesture, true);
        }
    };

    function handleUserGesture() {
        if (destroyed) {
            removeGestureListeners();
            return;
        }
        const activeCtx = ensureContext();
        if (!activeCtx) return;
        if (activeCtx.state === 'suspended' && typeof activeCtx.resume === 'function') {
            Promise.resolve(activeCtx.resume()).then(
                () => removeGestureListeners(),
                () => {},
            );
        } else {
            removeGestureListeners();
        }
    }

    const attachGestureListeners = () => {
        if (!win || gestureListenersAttached || destroyed) return;
        gestureListenersAttached = true;
        for (const evt of gestureEvents) {
            win.addEventListener?.(evt, handleUserGesture, { capture: true, passive: true });
        }
    };

    if (enabled) {
        attachGestureListeners();
    }

    const withReadyContext = (renderFn) => {
        if (destroyed || !enabled || volume <= 0) return false;
        const activeCtx = ensureContext();
        if (!activeCtx || !masterGain) return false;

        const run = () => {
            if (destroyed || !enabled) return;
            try {
                renderFn(activeCtx, masterGain);
            } catch {
                // Ignore Web Audio scheduling errors
            }
        };

        if (activeCtx.state === 'suspended' && typeof activeCtx.resume === 'function') {
            try {
                const res = activeCtx.resume();
                if (res && typeof res.then === 'function') {
                    res.then(run, () => {});
                } else {
                    run();
                }
            } catch {
                return false;
            }
            return true;
        }

        run();
        return true;
    };

    const playCorrectDigit = () => withReadyContext((activeCtx, dest) => {
        // Warm, soft kalimba/piano pluck on G5 with subtle lower octave body
        scheduleTone(activeCtx, dest, {
            freq: 783.99,
            startOffset: 0,
            duration: 0.14,
            type: 'sine',
            volume: 0.34,
            attack: 0.005,
        });
        scheduleTone(activeCtx, dest, {
            freq: 392.0,
            startOffset: 0,
            duration: 0.12,
            type: 'triangle',
            volume: 0.14,
            attack: 0.006,
            filterFreq: 1400,
        });
    });

    const playWrongDigit = () => withReadyContext((activeCtx, dest) => {
        // Gentle muted two-step wood thud (A3 -> F3), clearly distinct without harsh buzzing
        scheduleTone(activeCtx, dest, {
            freq: 220.0,
            endFreq: 196.0,
            startOffset: 0,
            duration: 0.1,
            type: 'triangle',
            volume: 0.36,
            attack: 0.006,
            filterFreq: 520,
        });
        scheduleTone(activeCtx, dest, {
            freq: 174.61,
            endFreq: 146.83,
            startOffset: 0.085,
            duration: 0.15,
            type: 'triangle',
            volume: 0.34,
            attack: 0.006,
            filterFreq: 460,
        });
    });

    const playUnitCompleted = () => withReadyContext((activeCtx, dest) => {
        // Ascending crystalline chime arpeggio (C5 - E5 - G5 - C6) matching cell wave
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, i) => {
            scheduleTone(activeCtx, dest, {
                freq,
                startOffset: i * 0.055,
                duration: i === notes.length - 1 ? 0.34 : 0.2,
                type: 'sine',
                volume: 0.26,
                attack: 0.008,
            });
            scheduleTone(activeCtx, dest, {
                freq: freq * 0.5,
                startOffset: i * 0.055,
                duration: 0.16,
                type: 'triangle',
                volume: 0.08,
                attack: 0.008,
                filterFreq: 1200,
            });
        });
    });

    const playGameSolved = () => withReadyContext((activeCtx, dest) => {
        // Warm celebratory piano/chime cadence (C5 - E5 - G5 - B5 - C6 + warm root pad)
        const melody = [
            { freq: 523.25, offset: 0, duration: 0.26 },
            { freq: 659.25, offset: 0.085, duration: 0.26 },
            { freq: 783.99, offset: 0.17, duration: 0.28 },
            { freq: 987.77, offset: 0.255, duration: 0.28 },
            { freq: 1046.5, offset: 0.35, duration: 0.72 },
        ];
        melody.forEach((note) => {
            scheduleTone(activeCtx, dest, {
                freq: note.freq,
                startOffset: note.offset,
                duration: note.duration,
                type: 'sine',
                volume: 0.28,
                attack: 0.01,
            });
        });
        // Supporting warm chord bed on resolution
        [261.63, 392.0, 523.25, 659.25].forEach((freq) => {
            scheduleTone(activeCtx, dest, {
                freq,
                startOffset: 0.35,
                duration: 0.78,
                type: 'triangle',
                volume: 0.1,
                attack: 0.02,
                filterFreq: 1600,
            });
        });
    });

    const playSpectatorCheer = () => withReadyContext((activeCtx, dest) => {
        // Light, playful sparkle chime (G5 -> B5 -> D6) for floating emoji reactions
        const notes = [783.99, 987.77, 1174.66];
        notes.forEach((freq, i) => {
            scheduleTone(activeCtx, dest, {
                freq,
                endFreq: freq * 1.02,
                startOffset: i * 0.045,
                duration: i === notes.length - 1 ? 0.22 : 0.13,
                type: 'sine',
                volume: 0.22,
                attack: 0.005,
            });
        });
    });

    const play = (effect) => {
        switch (effect) {
        case 'correct':
            return playCorrectDigit();
        case 'wrong':
            return playWrongDigit();
        case 'unit':
            return playUnitCompleted();
        case 'solved':
            return playGameSolved();
        case 'cheer':
            return playSpectatorCheer();
        default:
            return false;
        }
    };

    const setEnabled = (nextEnabled) => {
        const resolved = Boolean(nextEnabled);
        enabled = resolved;
        saveSoundEnabled(resolved, storage);
        if (resolved) {
            attachGestureListeners();
        } else {
            removeGestureListeners();
        }
    };

    const setVolume = (nextVolume) => {
        const resolved = clampVolume(nextVolume, volume);
        volume = resolved;
        saveSoundVolume(resolved, storage);
        if (masterGain && ctx) {
            try {
                masterGain.gain.setValueAtTime(computeMasterGain(resolved), ctx.currentTime || 0);
            } catch {
                // Ignore Web Audio gain scheduling errors
            }
        }
    };

    const destroy = () => {
        if (destroyed) return;
        destroyed = true;
        removeGestureListeners();
        if (ctx && typeof ctx.close === 'function') {
            try {
                ctx.close();
            } catch {
                // Ignore close errors
            }
        }
        ctx = null;
        masterGain = null;
    };

    return {
        play,
        playCorrectDigit,
        playWrongDigit,
        playUnitCompleted,
        playGameSolved,
        playSpectatorCheer,
        unlock: handleUserGesture,
        isEnabled: () => enabled,
        setEnabled,
        setVolume,
        getVolume: () => volume,
        destroy,
    };
}
