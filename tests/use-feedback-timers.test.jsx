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
});
