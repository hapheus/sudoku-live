import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFeedbackTimers } from '../src/hooks/useFeedbackTimers.js';

describe('useFeedbackTimers', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('announces and auto-clears actionFeedback after 3200ms', () => {
        const { result } = renderHook(() => useFeedbackTimers({
            onBroadcastHintClear: vi.fn(),
        }));

        act(() => {
            result.current.showFeedback('Saved');
        });
        expect(result.current.actionFeedback).toBe('Saved');
        expect(result.current.announcement).toBe('Saved');

        act(() => {
            vi.advanceTimersByTime(3200);
        });
        expect(result.current.actionFeedback).toBe('');
    });

    it('triggers and clears hintHighlight in solve mode', () => {
        const { result } = renderHook(() => useFeedbackTimers({
            onBroadcastHintClear: vi.fn(),
        }));

        act(() => {
            result.current.triggerHintHighlight({ index: 4, contextDelays: new Map([[4, 0]]) }, 'solve');
        });
        expect(result.current.hintHighlight.targetIndex).toBe(4);
        expect(result.current.hintHighlight.mode).toBe('solve');

        act(() => {
            vi.advanceTimersByTime(1700);
        });
        expect(result.current.hintHighlight.targetIndex).toBeNull();
    });

    it('triggers and auto-clears fistBump after 1800ms', () => {
        const { result } = renderHook(() => useFeedbackTimers({
            onBroadcastHintClear: vi.fn(),
        }));

        expect(result.current.fistBump).toBeNull();

        act(() => {
            result.current.triggerFistBump({ index: 12, phraseKey: 'fistBumpAwesome' });
        });
        expect(result.current.fistBump).toEqual({
            id: 1,
            index: 12,
            phraseKey: 'fistBumpAwesome',
        });

        act(() => {
            vi.advanceTimersByTime(1800);
        });
        expect(result.current.fistBump).toBeNull();
    });
});
