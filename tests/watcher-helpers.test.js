import { describe, it, expect } from 'vitest';
import { ALLOWED_REACTIONS, aggregateHintsByCell } from '../src/utils/watcher-helpers.js';

describe('Watcher Helpers', () => {
    it('aggregates spectator hints and picks top suggested digit per cell', () => {
        const hints = new Map([
            ['s1', { senderId: 's1', index: 12, value: 7 }],
            ['s2', { senderId: 's2', index: 12, value: 7 }],
            ['s3', { senderId: 's3', index: 12, value: 4 }],
            ['s4', { senderId: 's4', index: 20, value: null }],
            ['s5', { senderId: 's5', index: 999, value: 1 }],
        ]);

        const aggregated = aggregateHintsByCell(hints);
        expect(aggregated.get(12)).toEqual({ index: 12, topValue: 7, count: 3 });
        expect(aggregated.get(20)).toEqual({ index: 20, topValue: null, count: 1 });
        expect(aggregated.has(999)).toBe(false);
    });

    it('whitelists allowed emoji reactions', () => {
        expect(ALLOWED_REACTIONS.has('🔥')).toBe(true);
        expect(ALLOWED_REACTIONS.has('<script>')).toBe(false);
    });
});
