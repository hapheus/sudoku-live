import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameTimersAndModals } from '../src/hooks/useGameTimersAndModals.js';

describe('useGameTimersAndModals', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('increments elapsedSeconds every second during active play and closes confirm dialog on Escape', () => {
        const setGameState = vi.fn((updater) => {
            updater({ status: 'in_progress', elapsedSeconds: 4 });
        });
        const setPendingConfirm = vi.fn();
        const confirmCancelRef = { current: { focus: vi.fn() } };
        const stateRef = {
            current: {
                isHelpOpen: false,
                pendingConfirm: false,
                isSpectating: false,
                mode: 'solo',
                onlineGameId: 'room-1',
                boardBackground: { id: 'bg1' },
            },
        };

        renderHook(() => useGameTimersAndModals({
            navTab: 'play',
            isPlayingGame: true,
            isNativeApp: false,
            pendingConfirm: { title: 'Confirm' },
            confirmCancelRef,
            stateRef,
            onlineClientRef: { current: null },
            setGameState,
            setPendingConfirm,
            setLegalPage: vi.fn(),
            syncLobbyProgress: vi.fn(),
        }));

        expect(confirmCancelRef.current.focus).toHaveBeenCalledTimes(1);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(setPendingConfirm).toHaveBeenCalledWith(null);

        vi.advanceTimersByTime(1000);
        expect(setGameState).toHaveBeenCalledTimes(1);
    });
});
