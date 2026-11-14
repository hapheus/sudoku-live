import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createBackgroundMusicPlayer,
    getMusicTracks,
} from '../src/services/background-music.js';

function createMockAudio({ rejectInitialPlay = false } = {}) {
    const listeners = new Map();
    let shouldReject = rejectInitialPlay;

    const audio = {
        src: '',
        preload: '',
        volume: 1,
        loop: false,
        playsInline: false,
        paused: true,
        currentTime: 0,
        setAttribute: vi.fn(),
        addEventListener: vi.fn((type, fn) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(fn);
        }),
        removeEventListener: vi.fn((type, fn) => {
            listeners.get(type)?.delete(fn);
        }),
        play: vi.fn(() => {
            if (shouldReject) {
                shouldReject = false;
                return Promise.reject(new Error('NotAllowedError'));
            }
            audio.paused = false;
            return Promise.resolve();
        }),
        pause: vi.fn(() => {
            audio.paused = true;
        }),
        emit(type) {
            for (const fn of listeners.get(type) || []) {
                fn();
            }
        },
        allowNextPlay() {
            shouldReject = false;
        },
    };
    return audio;
}

describe('BackgroundMusicPlayer', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('discovers bundled MP3 tracks from src/assets/music and sorts naturally', () => {
        const bundled = getMusicTracks();
        expect(bundled.some((t) => t.id === 'petals_on_glass.mp3')).toBe(true);

        const sorted = getMusicTracks({
            '../assets/music/10_finale.mp3': '/assets/10.mp3',
            '../assets/music/2_second.mp3': '/assets/2.mp3',
            '../assets/music/1_first.mp3': '/assets/1.mp3',
        });
        expect(sorted.map((t) => t.id)).toEqual([
            '1_first.mp3',
            '2_second.mp3',
            '10_finale.mp3',
        ]);
    });

    it('loops a single track continuously', async () => {
        const audio = createMockAudio();
        const player = createBackgroundMusicPlayer({
            tracks: [{ id: 'petals_on_glass.mp3', title: 'petals on glass', src: '/petals.mp3' }],
            audioFactory: () => audio,
        });

        player.start();
        await Promise.resolve();

        expect(audio.src).toBe('/petals.mp3');
        expect(audio.loop).toBe(true);
        expect(audio.play).toHaveBeenCalledTimes(1);

        audio.currentTime = 42;
        audio.emit('ended');
        expect(audio.currentTime).toBe(0);
        expect(audio.play).toHaveBeenCalledTimes(2);

        player.destroy();
    });

    it('plays multiple tracks sequentially in an endless loop', async () => {
        const audio = createMockAudio();
        const tracks = [
            { id: '01.mp3', title: '01', src: '/01.mp3' },
            { id: '02.mp3', title: '02', src: '/02.mp3' },
            { id: '03.mp3', title: '03', src: '/03.mp3' },
        ];
        const player = createBackgroundMusicPlayer({
            tracks,
            audioFactory: () => audio,
        });

        player.start();
        await Promise.resolve();

        expect(audio.loop).toBe(false);
        expect(player.getCurrentTrack()?.id).toBe('01.mp3');
        expect(audio.src).toBe('/01.mp3');

        audio.emit('ended');
        await Promise.resolve();
        expect(player.getCurrentTrack()?.id).toBe('02.mp3');
        expect(audio.src).toBe('/02.mp3');

        audio.emit('ended');
        await Promise.resolve();
        expect(player.getCurrentTrack()?.id).toBe('03.mp3');
        expect(audio.src).toBe('/03.mp3');

        audio.emit('ended');
        await Promise.resolve();
        expect(player.getCurrentTrack()?.id).toBe('01.mp3');
        expect(audio.src).toBe('/01.mp3');

        player.destroy();
    });

    it('unlocks playback on first user gesture when initial autoplay is blocked', async () => {
        const audio = createMockAudio({ rejectInitialPlay: true });
        const player = createBackgroundMusicPlayer({
            tracks: [{ id: '01.mp3', title: '01', src: '/01.mp3' }],
            audioFactory: () => audio,
        });

        player.start();
        await Promise.resolve();
        await Promise.resolve();

        expect(audio.play).toHaveBeenCalledTimes(1);
        expect(audio.paused).toBe(true);

        window.dispatchEvent(new Event('pointerdown'));
        await Promise.resolve();

        expect(audio.play).toHaveBeenCalledTimes(2);
        expect(audio.paused).toBe(false);

        player.destroy();
    });

    it('supports enabling/disabling music persistently and pausing while tab is hidden', async () => {
        const audio = createMockAudio();
        let visibilityState = 'visible';
        const docListeners = new Map();
        const mockDoc = {
            get visibilityState() {
                return visibilityState;
            },
            addEventListener: (type, fn) => {
                if (!docListeners.has(type)) docListeners.set(type, new Set());
                docListeners.get(type).add(fn);
            },
            removeEventListener: (type, fn) => {
                docListeners.get(type)?.delete(fn);
            },
            emit(type) {
                for (const fn of docListeners.get(type) || []) fn();
            },
        };

        const player = createBackgroundMusicPlayer({
            tracks: [{ id: '01.mp3', title: '01', src: '/01.mp3' }],
            audioFactory: () => audio,
            doc: mockDoc,
        });

        player.start();
        await Promise.resolve();
        expect(audio.paused).toBe(false);

        visibilityState = 'hidden';
        mockDoc.emit('visibilitychange');
        expect(audio.pause).toHaveBeenCalled();
        expect(audio.paused).toBe(true);

        visibilityState = 'visible';
        mockDoc.emit('visibilitychange');
        await Promise.resolve();
        expect(audio.paused).toBe(false);

        player.setEnabled(false);
        expect(localStorage.getItem('sudoku_music_enabled')).toBe('false');
        expect(audio.paused).toBe(true);

        player.setEnabled(true);
        await Promise.resolve();
        expect(localStorage.getItem('sudoku_music_enabled')).toBe('true');
        expect(audio.paused).toBe(false);

        player.destroy();
    });
});
