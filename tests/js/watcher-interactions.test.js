import { describe, it, expect, vi } from 'vitest';
import {
    aggregateHintsByCell,
    renderSpectatorHintsList,
    spawnFloatingEmoji,
} from '../../resources/js/ui/watcher-interactions.js';

describe('WatcherInteractions', () => {
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

    it('renders clickable spectator hint chips for players', () => {
        const container = document.createElement('div');
        const onApplyHint = vi.fn();
        const aggregated = new Map([[12, { index: 12, topValue: 7, count: 2 }]]);

        renderSpectatorHintsList(container, aggregated, { canApply: true, onApplyHint });

        const chip = container.querySelector('.hint-chip');
        expect(chip.textContent).toBe('R2C4 → 7 ×2');
        chip.click();
        expect(onApplyHint).toHaveBeenCalledWith(12, 7);
    });

    it('only spawns allowed emoji reactions', () => {
        const stage = document.createElement('div');

        expect(spawnFloatingEmoji(stage, '🔥')).not.toBeNull();
        expect(spawnFloatingEmoji(stage, '<script>')).toBeNull();
        expect(stage.children).toHaveLength(1);
        expect(stage.children[0].textContent).toBe('🔥');
    });
});
