import { describe, expect, it } from 'vitest';
import { createCoopFistBumpTracker } from '../src/domain/coop-fist-bump.js';

describe('createCoopFistBumpTracker', () => {
    it('matches when local and remote solve the same cell with the same digit within 500ms (local first)', () => {
        const tracker = createCoopFistBumpTracker({ windowMs: 500 });

        expect(tracker.recordLocalSolve(10, 7, 1000)).toEqual({ matched: false });
        expect(tracker.recordRemoteSolve(10, 7, 1450)).toEqual({
            matched: true,
            index: 10,
            value: 7,
        });
    });

    it('matches when remote arrives first and local solves within 500ms (remote first)', () => {
        const tracker = createCoopFistBumpTracker({ windowMs: 500 });

        expect(tracker.recordRemoteSolve(14, 3, 2000)).toEqual({ matched: false });
        expect(tracker.recordLocalSolve(14, 3, 2500)).toEqual({
            matched: true,
            index: 14,
            value: 3,
        });
    });

    it('does not match when timing exceeds 500ms or digits differ', () => {
        const tracker = createCoopFistBumpTracker({ windowMs: 500 });

        tracker.recordLocalSolve(5, 4, 1000);
        expect(tracker.recordRemoteSolve(5, 4, 1501)).toEqual({ matched: false });

        tracker.recordLocalSolve(6, 2, 2000);
        expect(tracker.recordRemoteSolve(6, 9, 2100)).toEqual({ matched: false });
    });

    it('deduplicates repeated fist-bump triggers for the same cell and digit', () => {
        const tracker = createCoopFistBumpTracker({ windowMs: 500, dedupeMs: 1000 });

        expect(tracker.claimEffect(10, 7, 1000)).toBe(true);
        expect(tracker.claimEffect(10, 7, 1200)).toBe(false);
        expect(tracker.claimEffect(10, 7, 2100)).toBe(true);
    });
});
