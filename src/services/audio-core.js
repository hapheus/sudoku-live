/**
 * Shared Web Audio helpers: volume clamping, perceptual gain, context lookup,
 * and one-shot user-gesture unlock listener management.
 */

export const AUDIO_GESTURE_EVENTS = ['pointerdown', 'touchstart', 'keydown', 'click'];

export function clampVolume(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(1, Math.max(0, num));
}

export function toPerceptualGain(volume, fallback = 0.5) {
    const clamped = clampVolume(volume, fallback);
    if (clamped <= 0) return 0;
    return clamped * clamped;
}

export function getDefaultAudioContextClass(win = typeof window !== 'undefined' ? window : null) {
    if (!win) return null;
    return win.AudioContext || win.webkitAudioContext || null;
}

export function createGestureListenerManager({
    doc = typeof document !== 'undefined' ? document : null,
    target = doc,
    onGesture,
    events = AUDIO_GESTURE_EVENTS,
    capture = false,
} = {}) {
    let attached = false;

    const remove = () => {
        if (!target || !attached) return;
        for (const eventName of events) {
            target.removeEventListener?.(eventName, onGesture, capture);
        }
        attached = false;
    };

    const attach = () => {
        if (!target || attached || typeof onGesture !== 'function') return;
        for (const eventName of events) {
            target.addEventListener?.(eventName, onGesture, { capture, passive: true });
        }
        attached = true;
    };

    return { attach, remove };
}
