import { describe, expect, it, vi } from 'vitest';
import {
    clampVolume,
    createGestureListenerManager,
    getDefaultAudioContextClass,
    toPerceptualGain,
} from '../src/services/audio-core.js';

describe('audio-core utilities', () => {
    it('clamps volume to [0, 1] and falls back for invalid numbers', () => {
        expect(clampVolume(-0.4, 0.5)).toBe(0);
        expect(clampVolume(1.5, 0.5)).toBe(1);
        expect(clampVolume(0.7, 0.5)).toBe(0.7);
        expect(clampVolume('bad', 0.5)).toBe(0.5);
        expect(clampVolume(Number.NaN, 0.45)).toBe(0.45);
    });

    it('computes squared perceptual gain curve', () => {
        expect(toPerceptualGain(0, 0.5)).toBe(0);
        expect(toPerceptualGain(0.5, 0.5)).toBeCloseTo(0.25, 6);
        expect(toPerceptualGain(1, 0.5)).toBe(1);
    });

    it('resolves AudioContext or webkitAudioContext from window', () => {
        const FakeCtx = function FakeCtx() {};
        const FakeWebkitCtx = function FakeWebkitCtx() {};

        expect(getDefaultAudioContextClass(null)).toBeNull();
        expect(getDefaultAudioContextClass({ AudioContext: FakeCtx })).toBe(FakeCtx);
        expect(getDefaultAudioContextClass({ webkitAudioContext: FakeWebkitCtx })).toBe(FakeWebkitCtx);
    });

    it('attaches and removes gesture listeners cleanly without duplicates', () => {
        const listeners = new Map();
        const doc = {
            addEventListener: vi.fn((event, handler) => {
                listeners.set(event, handler);
            }),
            removeEventListener: vi.fn((event, handler) => {
                if (listeners.get(event) === handler) {
                    listeners.delete(event);
                }
            }),
        };
        const onGesture = vi.fn();
        const manager = createGestureListenerManager({ doc, onGesture });

        manager.attach();
        manager.attach();
        expect(doc.addEventListener).toHaveBeenCalledTimes(4);

        manager.remove();
        expect(doc.removeEventListener).toHaveBeenCalledTimes(4);
        expect(listeners.size).toBe(0);
    });
});
