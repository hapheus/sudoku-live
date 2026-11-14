import { describe, it, expect } from 'vitest';
import {
    BOARD_SELECTION_STRATEGIES,
    DEFAULT_BOARD_SELECTION_STRATEGY,
    getBoardBackgroundById,
    getBoardBackgrounds,
    getSeasonForDate,
    selectBoardBackground,
} from '../src/services/board-backgrounds.js';

const SAMPLE_BACKGROUNDS = [
    {
        id: 'alpine_sunset.webp',
        title: 'Alpine Sunset',
        src: '/assets/alpine_sunset.webp',
        seasons: ['summer', 'autumn'],
        order: 1,
    },
    {
        id: 'winter_peaks.webp',
        title: 'Winter Peaks',
        src: '/assets/winter_peaks.webp',
        seasons: ['winter'],
        order: 2,
    },
    {
        id: 'spring_meadow.webp',
        title: 'Spring Meadow',
        src: '/assets/spring_meadow.webp',
        seasons: ['spring'],
        order: 3,
    },
];

describe('board-backgrounds service', () => {
    it('discovers optimized board artwork bundled under src/assets/boards', () => {
        const discovered = getBoardBackgrounds();
        expect(discovered.length).toBeGreaterThanOrEqual(1);
        const alpine = discovered.find((bg) => bg.id === 'alpenpanorama_mit_see_im_sonnenuntergang.webp');
        expect(alpine).toBeDefined();
        expect(alpine.title).toBe('Alpenpanorama mit See im Sonnenuntergang');
        expect(typeof alpine.src).toBe('string');
        expect(alpine.src.length).toBeGreaterThan(0);
    });

    it('normalizes and sorts discovered modules by metadata order and filename', () => {
        const list = getBoardBackgrounds(
            {
                '../assets/boards/z_photo.webp': '/img/z.webp',
                '../assets/boards/b_autumn_trail.png': '/img/b.png',
                '../assets/boards/a_featured.jpg': '/img/a.jpg',
            },
            {
                'b_autumn_trail.png': { title: 'Herbstweg', seasons: ['autumn'], order: 1 },
            },
        );

        expect(list.map((b) => b.id)).toEqual([
            'b_autumn_trail.png',
            'a_featured.jpg',
            'z_photo.webp',
        ]);
        expect(list[0]).toMatchObject({ title: 'Herbstweg', seasons: ['autumn'], order: 1 });
        expect(list[1]).toMatchObject({ title: 'a featured', seasons: null });
    });

    it('defaults to random selection and avoids immediate repeats when multiple images exist', () => {
        expect(DEFAULT_BOARD_SELECTION_STRATEGY).toBe('random');
        const picked = selectBoardBackground({
            backgrounds: SAMPLE_BACKGROUNDS,
            previousId: 'alpine_sunset.webp',
            random: () => 0,
        });
        expect(picked.id).toBe('winter_peaks.webp');

        const deterministicA = selectBoardBackground({
            backgrounds: SAMPLE_BACKGROUNDS,
            seed: 'room-xyz-123',
        });
        const deterministicB = selectBoardBackground({
            backgrounds: SAMPLE_BACKGROUNDS,
            seed: 'room-xyz-123',
        });
        expect(deterministicA.id).toBe(deterministicB.id);
    });

    it('computes meteorological seasons and filters seasonal images cleanly', () => {
        expect(getSeasonForDate(new Date('2026-04-15T12:00:00Z'))).toBe('spring');
        expect(getSeasonForDate(new Date('2026-07-15T12:00:00Z'))).toBe('summer');
        expect(getSeasonForDate(new Date('2026-10-15T12:00:00Z'))).toBe('autumn');
        expect(getSeasonForDate(new Date('2026-01-15T12:00:00Z'))).toBe('winter');

        const winterPick = selectBoardBackground({
            backgrounds: SAMPLE_BACKGROUNDS,
            strategy: 'seasonal',
            date: new Date('2026-01-10T12:00:00Z'),
        });
        expect(winterPick.id).toBe('winter_peaks.webp');

        const springPick = selectBoardBackground({
            backgrounds: SAMPLE_BACKGROUNDS,
            strategy: 'seasonal',
            date: new Date('2026-05-01T12:00:00Z'),
        });
        expect(springPick.id).toBe('spring_meadow.webp');

        // Falls back cleanly to all images if no image matches the active season
        const fallbackPick = selectBoardBackground({
            backgrounds: SAMPLE_BACKGROUNDS.filter((b) => b.id !== 'winter_peaks.webp'),
            strategy: 'seasonal',
            date: new Date('2026-12-20T12:00:00Z'),
            random: () => 0,
        });
        expect(fallbackPick.id).toBe('alpine_sunset.webp');
    });

    it('supports sequential rotation and custom strategy lookup', () => {
        expect(Object.keys(BOARD_SELECTION_STRATEGIES)).toEqual(['random', 'seasonal', 'sequential']);

        const first = selectBoardBackground({ backgrounds: SAMPLE_BACKGROUNDS, strategy: 'sequential' });
        const second = selectBoardBackground({ backgrounds: SAMPLE_BACKGROUNDS, strategy: 'sequential', previousId: first.id });
        const third = selectBoardBackground({ backgrounds: SAMPLE_BACKGROUNDS, strategy: 'sequential', previousId: second.id });
        const wrapped = selectBoardBackground({ backgrounds: SAMPLE_BACKGROUNDS, strategy: 'sequential', previousId: third.id });

        expect([first.id, second.id, third.id, wrapped.id]).toEqual([
            'alpine_sunset.webp',
            'winter_peaks.webp',
            'spring_meadow.webp',
            'alpine_sunset.webp',
        ]);

        expect(getBoardBackgroundById('winter_peaks.webp', SAMPLE_BACKGROUNDS)).toEqual(SAMPLE_BACKGROUNDS[1]);
        expect(getBoardBackgroundById('missing.webp', SAMPLE_BACKGROUNDS)).toBeNull();
    });
});
