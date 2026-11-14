import { describe, expect, it } from 'vitest';
import { createEventDeduper } from '../src/services/event-deduper.js';

describe('event-deduper', () => {
    it('tracks seen event IDs and evicts oldest beyond maxSize', () => {
        const deduper = createEventDeduper(2);

        expect(deduper.remember('')).toBe(false);
        expect(deduper.remember(null)).toBe(false);

        expect(deduper.remember('e1')).toBe(false);
        expect(deduper.remember('e1')).toBe(true);
        expect(deduper.remember('e2')).toBe(false);
        expect(deduper.remember('e3')).toBe(false);

        // e1 was evicted when e3 was added
        expect(deduper.remember('e1')).toBe(false);
        expect(deduper.remember('e3')).toBe(true);
    });
});
