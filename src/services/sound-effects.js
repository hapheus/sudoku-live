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

const SOUND_STORAGE_KEY = 'sudoku_sound_enabled';
const SOUND_VOLUME_STORAGE_KEY = 'sudoku_sound_volume';
const DEFAULT_SOUND_VOLUME = 0.65;
const MAX_SOUND_MASTER_GAIN = 0.7;

export function loadSoundEnabled(storage = getDefaultStorage('local')) {
    return loadBooleanPref(SOUND_STORAGE_KEY, true, storage);
}

export function saveSoundEnabled(enabled, storage = getDefaultStorage('local')) {
    saveBooleanPref(SOUND_STORAGE_KEY, enabled, storage);
}

export function loadSoundVolume(storage = getDefaultStorage('local')) {
    return loadNumberPref(SOUND_VOLUME_STORAGE_KEY, DEFAULT_SOUND_VOLUME, { min: 0, max: 1 }, storage);
}

export function saveSoundVolume(volume, storage = getDefaultStorage('local')) {
    saveNumberPref(
        SOUND_VOLUME_STORAGE_KEY,
        volume,
        { min: 0, max: 1, fallback: DEFAULT_SOUND_VOLUME },
        storage,
    );
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
    let retroMode = false;
    let destroyed = false;
    let ctx = null;
    let masterGain = null;

    const computeMasterGain = (vol) => {
        const ceiling = typeof masterVolume === 'number'
            ? masterVolume / (DEFAULT_SOUND_VOLUME * DEFAULT_SOUND_VOLUME)
            : MAX_SOUND_MASTER_GAIN;
        return Math.max(0, ceiling * toPerceptualGain(vol, DEFAULT_SOUND_VOLUME));
    };

    const gestureManager = createGestureListenerManager({
        target: win,
        capture: true,
        onGesture: handleUserGesture,
    });

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

    const removeGestureListeners = () => gestureManager.remove();

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
        if (!destroyed) gestureManager.attach();
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

    const scheduleChiptuneNotes = (activeCtx, dest, notes, {
        step = 0.055,
        duration = 0.075,
        type = 'square',
        volume: noteVol = 0.14,
        filterFreq = 2600,
    } = {}) => {
        notes.forEach((freq, idx) => {
            scheduleTone(activeCtx, dest, {
                freq,
                startOffset: idx * step,
                duration: idx === notes.length - 1 ? duration * 1.6 : duration,
                type,
                volume: noteVol,
                attack: 0.003,
                filterFreq,
            });
        });
    };

    const playCorrectDigit = () => withReadyContext((activeCtx, dest) => {
        if (retroMode) {
            // Classic 8-bit coin blip (B5 -> E6)
            scheduleChiptuneNotes(activeCtx, dest, [987.77, 1318.51], {
                step: 0.042,
                duration: 0.07,
                type: 'square',
                volume: 0.14,
            });
            return;
        }
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
        if (retroMode) {
            // 8-bit NES-style descending buzz
            scheduleTone(activeCtx, dest, {
                freq: 196.0,
                endFreq: 110.0,
                startOffset: 0,
                duration: 0.16,
                type: 'sawtooth',
                volume: 0.18,
                attack: 0.004,
                filterFreq: 900,
            });
            return;
        }
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
        if (retroMode) {
            scheduleChiptuneNotes(activeCtx, dest, [523.25, 659.25, 783.99, 1046.5], {
                step: 0.05,
                duration: 0.085,
                type: 'square',
                volume: 0.14,
            });
            return;
        }
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
        if (retroMode) {
            // Classic 8-bit stage clear fanfare
            scheduleChiptuneNotes(activeCtx, dest, [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5], {
                step: 0.075,
                duration: 0.11,
                type: 'square',
                volume: 0.15,
            });
            return;
        }
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
        if (retroMode) {
            scheduleChiptuneNotes(activeCtx, dest, [659.25, 783.99, 1318.51, 1046.5, 1174.66, 1567.98], {
                step: 0.04,
                duration: 0.06,
                type: 'square',
                volume: 0.12,
            });
            return;
        }
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

    const playFistBump = () => withReadyContext((activeCtx, dest) => {
        if (retroMode) {
            scheduleChiptuneNotes(activeCtx, dest, [392.0, 523.25, 783.99, 1046.5], {
                step: 0.04,
                duration: 0.08,
                type: 'square',
                volume: 0.16,
            });
            return;
        }
        // Tactile low-mid "bump" + bright celebratory two-note chord
        scheduleTone(activeCtx, dest, {
            freq: 185.0,
            endFreq: 92.5,
            startOffset: 0,
            duration: 0.09,
            type: 'triangle',
            volume: 0.36,
            attack: 0.004,
            filterFreq: 680,
        });
        [587.33, 880.0].forEach((freq, idx) => {
            scheduleTone(activeCtx, dest, {
                freq,
                startOffset: 0.035 + idx * 0.035,
                duration: 0.18,
                type: 'sine',
                volume: 0.24,
                attack: 0.005,
            });
        });
    });

    const playRetroActivate = () => withReadyContext((activeCtx, dest) => {
        // Iconic 8-bit power-up arpeggio
        scheduleChiptuneNotes(activeCtx, dest, [329.63, 392.0, 659.25, 523.25, 587.33, 783.99], {
            step: 0.052,
            duration: 0.085,
            type: 'square',
            volume: 0.16,
        });
    });

    const playRetroExit = () => withReadyContext((activeCtx, dest) => {
        // Quick time-warp sweep back to the present
        scheduleTone(activeCtx, dest, {
            freq: 330.0,
            endFreq: 987.77,
            startOffset: 0,
            duration: 0.18,
            type: 'triangle',
            volume: 0.22,
            attack: 0.006,
        });
        scheduleTone(activeCtx, dest, {
            freq: 1046.5,
            startOffset: 0.11,
            duration: 0.16,
            type: 'sine',
            volume: 0.2,
            attack: 0.005,
        });
    });

    const playShift = () => withReadyContext((activeCtx, dest) => {
        // Smooth tactile slide sweep + bright harmonic shimmer for row/column shifts
        scheduleTone(activeCtx, dest, {
            freq: 260,
            endFreq: 520,
            startOffset: 0,
            duration: 0.095,
            type: 'triangle',
            volume: 0.24,
            attack: 0.006,
            filterFreq: 1800,
        });
        scheduleTone(activeCtx, dest, {
            freq: 659.25,
            endFreq: 698.46,
            startOffset: 0.032,
            duration: 0.12,
            type: 'sine',
            volume: 0.18,
            attack: 0.005,
        });
        scheduleTone(activeCtx, dest, {
            freq: 987.77,
            endFreq: 1046.5,
            startOffset: 0.055,
            duration: 0.16,
            type: 'sine',
            volume: 0.15,
            attack: 0.005,
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
        case 'shift':
            return playShift();
        case 'fist-bump':
            return playFistBump();
        case 'retro-activate':
            return playRetroActivate();
        case 'retro-exit':
            return playRetroExit();
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
        playShift,
        playFistBump,
        playRetroActivate,
        playRetroExit,
        setRetroMode: (nextRetro) => {
            retroMode = Boolean(nextRetro);
        },
        isRetroMode: () => retroMode,
        unlock: handleUserGesture,
        isEnabled: () => enabled,
        setEnabled,
        setVolume,
        getVolume: () => volume,
        destroy,
    };
}
