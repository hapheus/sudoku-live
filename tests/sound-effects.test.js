import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createSoundEffectsPlayer,
    loadSoundEnabled,
    loadSoundVolume,
    saveSoundEnabled,
    saveSoundVolume,
} from '../src/services/sound-effects.js';

function createMockAudioContext({ initialState = 'running' } = {}) {
    const oscillators = [];
    const gains = [];
    let state = initialState;

    const ctx = {
        currentTime: 10,
        destination: { kind: 'destination' },
        get state() {
            return state;
        },
        resume: vi.fn(() => {
            state = 'running';
            return Promise.resolve();
        }),
        close: vi.fn(),
        createOscillator: vi.fn(() => {
            const osc = {
                type: 'sine',
                frequency: {
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                },
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
            };
            oscillators.push(osc);
            return osc;
        }),
        createGain: vi.fn(() => {
            const gain = {
                gain: {
                    setValueAtTime: vi.fn(),
                    linearRampToValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                },
                connect: vi.fn(),
            };
            gains.push(gain);
            return gain;
        }),
        createBiquadFilter: vi.fn(() => ({
            type: 'lowpass',
            frequency: { setValueAtTime: vi.fn() },
            connect: vi.fn(),
        })),
        __oscillators: oscillators,
        __gains: gains,
    };

    return ctx;
}

describe('SoundEffectsPlayer', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('defaults to enabled and persists enabled state in localStorage', () => {
        expect(loadSoundEnabled()).toBe(true);
        saveSoundEnabled(false);
        expect(localStorage.getItem('sudoku_sound_enabled')).toBe('false');
        expect(loadSoundEnabled()).toBe(false);
    });

    it('synthesizes distinct Web Audio sound effects for all 5 gameplay events', () => {
        const mockCtx = createMockAudioContext();
        const player = createSoundEffectsPlayer({
            contextFactory: () => mockCtx,
        });

        expect(player.playCorrectDigit()).toBe(true);
        const afterCorrect = mockCtx.__oscillators.length;
        expect(afterCorrect).toBe(2);

        expect(player.playWrongDigit()).toBe(true);
        const afterWrong = mockCtx.__oscillators.length;
        expect(afterWrong - afterCorrect).toBe(2);
        expect(mockCtx.createBiquadFilter).toHaveBeenCalled();

        expect(player.playUnitCompleted()).toBe(true);
        const afterUnit = mockCtx.__oscillators.length;
        expect(afterUnit - afterWrong).toBe(8);

        expect(player.playGameSolved()).toBe(true);
        const afterSolved = mockCtx.__oscillators.length;
        expect(afterSolved - afterUnit).toBe(9);

        expect(player.playSpectatorCheer()).toBe(true);
        const afterCheer = mockCtx.__oscillators.length;
        expect(afterCheer - afterSolved).toBe(3);

        expect(player.playShift()).toBe(true);
        const afterShift = mockCtx.__oscillators.length;
        expect(afterShift - afterCheer).toBe(3);

        expect(player.play('shift')).toBe(true);
        expect(mockCtx.__oscillators.length - afterShift).toBe(3);

        player.destroy();
        expect(mockCtx.close).toHaveBeenCalledTimes(1);
    });

    it('resumes a suspended AudioContext before scheduling notes', async () => {
        const mockCtx = createMockAudioContext({ initialState: 'suspended' });
        const player = createSoundEffectsPlayer({
            contextFactory: () => mockCtx,
        });

        expect(player.playCorrectDigit()).toBe(true);
        expect(mockCtx.resume).toHaveBeenCalledTimes(1);

        await Promise.resolve();
        expect(mockCtx.__oscillators.length).toBe(2);

        player.destroy();
    });

    it('stops playing sounds when disabled and resumes when re-enabled', () => {
        const mockCtx = createMockAudioContext();
        const player = createSoundEffectsPlayer({
            contextFactory: () => mockCtx,
        });

        player.setEnabled(false);
        expect(localStorage.getItem('sudoku_sound_enabled')).toBe('false');
        expect(player.playCorrectDigit()).toBe(false);
        expect(player.playWrongDigit()).toBe(false);
        expect(player.playUnitCompleted()).toBe(false);
        expect(player.playGameSolved()).toBe(false);
        expect(player.playSpectatorCheer()).toBe(false);
        expect(mockCtx.__oscillators.length).toBe(0);

        player.setEnabled(true);
        expect(localStorage.getItem('sudoku_sound_enabled')).toBe('true');
        expect(player.playSpectatorCheer()).toBe(true);
        expect(mockCtx.__oscillators.length).toBe(3);

        player.destroy();
    });

    it('persists and clamps sound volume and updates masterGain live', () => {
        expect(loadSoundVolume()).toBe(0.65);

        saveSoundVolume(1.5);
        expect(localStorage.getItem('sudoku_sound_volume')).toBe('1');
        expect(loadSoundVolume()).toBe(1);

        saveSoundVolume(-0.4);
        expect(localStorage.getItem('sudoku_sound_volume')).toBe('0');
        expect(loadSoundVolume()).toBe(0);

        localStorage.removeItem('sudoku_sound_volume');
        const mockCtx = createMockAudioContext();
        const player = createSoundEffectsPlayer({
            contextFactory: () => mockCtx,
        });

        expect(player.getVolume()).toBe(0.65);
        expect(player.playCorrectDigit()).toBe(true);

        const masterGain = mockCtx.__gains[0];
        expect(masterGain.gain.setValueAtTime.mock.calls[0][0]).toBeCloseTo(0.7 * 0.65 * 0.65, 5);
        expect(masterGain.gain.setValueAtTime.mock.calls[0][1]).toBe(10);

        player.setVolume(0.8);
        expect(player.getVolume()).toBe(0.8);
        expect(localStorage.getItem('sudoku_sound_volume')).toBe('0.8');
        const lastCall = masterGain.gain.setValueAtTime.mock.calls.at(-1);
        expect(lastCall[0]).toBeCloseTo(0.7 * 0.8 * 0.8, 5);
        expect(lastCall[1]).toBe(10);

        const oscCountBeforeMute = mockCtx.__oscillators.length;
        player.setVolume(0);
        expect(player.playCorrectDigit()).toBe(false);
        expect(mockCtx.__oscillators.length).toBe(oscCountBeforeMute);

        player.destroy();
    });

    it('supports retro 8-bit chiptune mode and fist-bump/retro transition effects', () => {
        const mockCtx = createMockAudioContext();
        const player = createSoundEffectsPlayer({
            contextFactory: () => mockCtx,
        });

        expect(player.isRetroMode()).toBe(false);
        expect(player.playFistBump()).toBe(true);
        const afterFistBump = mockCtx.__oscillators.length;
        expect(afterFistBump).toBeGreaterThan(0);

        player.setRetroMode(true);
        expect(player.isRetroMode()).toBe(true);

        expect(player.playRetroActivate()).toBe(true);
        const retroOscs = mockCtx.__oscillators.slice(afterFistBump);
        expect(retroOscs.length).toBeGreaterThanOrEqual(4);
        expect(retroOscs.some((osc) => osc.type === 'square')).toBe(true);

        const beforeCorrect = mockCtx.__oscillators.length;
        expect(player.playCorrectDigit()).toBe(true);
        const retroCorrectOscs = mockCtx.__oscillators.slice(beforeCorrect);
        expect(retroCorrectOscs.some((osc) => osc.type === 'square')).toBe(true);

        const beforeWrong = mockCtx.__oscillators.length;
        expect(player.play('wrong')).toBe(true);
        expect(mockCtx.__oscillators.slice(beforeWrong).some((osc) => osc.type === 'square' || osc.type === 'sawtooth')).toBe(true);

        expect(player.play('fist-bump')).toBe(true);
        expect(player.playRetroExit()).toBe(true);

        player.setRetroMode(false);
        expect(player.isRetroMode()).toBe(false);
        player.destroy();
    });
});
