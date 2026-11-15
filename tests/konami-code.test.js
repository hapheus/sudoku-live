import { describe, expect, it } from 'vitest';
import {
    advanceKonamiState,
    createKonamiState,
    KONAMI_ARROW_SEQUENCE,
    KONAMI_BUTTON_LABELS,
} from '../src/domain/konami-code.js';

describe('Konami Code State Machine', () => {
    it('advances through all 8 arrows and enters the ab phase', () => {
        let state = createKonamiState();
        expect(state).toEqual({ phase: 'arrows', progress: 0 });
        expect(KONAMI_BUTTON_LABELS).toEqual(['A', 'B', 'C', 'D']);

        for (let i = 0; i < KONAMI_ARROW_SEQUENCE.length - 1; i += 1) {
            const result = advanceKonamiState(state, KONAMI_ARROW_SEQUENCE[i]);
            expect(result.completed).toBe(false);
            expect(result.phase).toBe('arrows');
            expect(result.progress).toBe(i + 1);
            state = { phase: result.phase, progress: result.progress };
        }

        const finalArrow = advanceKonamiState(state, 'right');
        expect(finalArrow.completed).toBe(false);
        expect(finalArrow.phase).toBe('ab');
        expect(finalArrow.progress).toBe(8);
    });

    it('completes when B then A is pressed in the ab phase', () => {
        let state = { phase: 'ab', progress: 8 };
        const afterB = advanceKonamiState(state, 'B');
        expect(afterB).toEqual({
            phase: 'ab',
            progress: 9,
            completed: false,
            resetFromAb: false,
        });

        state = { phase: afterB.phase, progress: afterB.progress };
        const afterA = advanceKonamiState(state, 'A');
        expect(afterA).toEqual({
            phase: 'arrows',
            progress: 0,
            completed: true,
            resetFromAb: false,
        });
    });

    it('resets back to arrows immediately on wrong input during the ab phase', () => {
        const afterWrongFirst = advanceKonamiState({ phase: 'ab', progress: 8 }, 'A');
        expect(afterWrongFirst).toEqual({
            phase: 'arrows',
            progress: 0,
            completed: false,
            resetFromAb: true,
        });

        const afterWrongC = advanceKonamiState({ phase: 'ab', progress: 8 }, 'C');
        expect(afterWrongC.phase).toBe('arrows');
        expect(afterWrongC.resetFromAb).toBe(true);

        const afterWrongSecond = advanceKonamiState({ phase: 'ab', progress: 9 }, 'D');
        expect(afterWrongSecond).toEqual({
            phase: 'arrows',
            progress: 0,
            completed: false,
            resetFromAb: true,
        });
    });

    it('preserves prefix overlap on extra up arrows before down', () => {
        let state = createKonamiState();
        state = advanceKonamiState(state, 'up');
        state = advanceKonamiState(state, 'up');
        const thirdUp = advanceKonamiState(state, 'up');
        expect(thirdUp.phase).toBe('arrows');
        expect(thirdUp.progress).toBe(2);

        const wrongDown = advanceKonamiState({ phase: 'arrows', progress: 3 }, 'up');
        expect(wrongDown.phase).toBe('arrows');
        expect(wrongDown.progress).toBe(1);
    });
});
