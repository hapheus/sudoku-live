import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useKeyboardNavigation } from '../src/hooks/useKeyboardNavigation.js';

describe('useKeyboardNavigation', () => {
    it('routes digit, shift, undo, and arrow navigation keys when active', () => {
        const applyPlayerDigit = vi.fn();
        const handleShift = vi.fn();
        const handleUndo = vi.fn();
        const focusCell = vi.fn();
        const cellRefs = { current: [] };
        const stateRef = {
            current: {
                gameState: { variant: '3x3', board: Array(81).fill(0) },
                activeDigit: null,
            },
        };

        renderHook(() => useKeyboardNavigation({
            isHelpOpen: false,
            pendingConfirm: null,
            navTab: 'play',
            isPlayingGame: true,
            isSpectating: false,
            selectedIndex: 10,
            stateRef,
            cellRefs,
            setSelectedIndex: vi.fn(),
            setActiveDigit: vi.fn(),
            setIsHelpOpen: vi.fn(),
            setNotesMode: vi.fn(),
            broadcastCursor: vi.fn(),
            broadcastActiveDigit: vi.fn(),
            sendSpectatorHint: vi.fn(),
            applyPlayerDigit,
            handleUndo,
            handleShift,
            focusCell,
        }));

        fireEvent.keyDown(document, { key: '5' });
        expect(applyPlayerDigit).toHaveBeenCalledWith(5);

        fireEvent.keyDown(document, { key: 'ArrowUp', shiftKey: true });
        expect(handleShift).toHaveBeenCalledWith('row', -1);

        fireEvent.keyDown(document, { key: 'z', ctrlKey: true });
        expect(handleUndo).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(document, { key: 'ArrowRight' });
        expect(focusCell).toHaveBeenCalledWith(11);
    });
});
