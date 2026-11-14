import { useEffect } from 'react';
import {
    getCellCoords,
    getVariantSpec,
    inferVariantFromBoardLength,
} from '../domain/sudoku-variants.js';

const SHIFT_KEY_MAP = {
    ArrowUp: ['row', -1],
    ArrowDown: ['row', 1],
    ArrowLeft: ['col', -1],
    ArrowRight: ['col', 1],
};

function resolveNavigationTarget(key, row, col, specInfo) {
    const maxIdx = specInfo.gridSize - 1;
    if (key === 'ArrowUp' && row > 0) return (row - 1) * specInfo.gridSize + col;
    if (key === 'ArrowDown' && row < maxIdx) return (row + 1) * specInfo.gridSize + col;
    if (key === 'ArrowLeft' && col > 0) return row * specInfo.gridSize + (col - 1);
    if (key === 'ArrowRight' && col < maxIdx) return row * specInfo.gridSize + (col + 1);
    if (key === 'Home') return row * specInfo.gridSize;
    if (key === 'End') return row * specInfo.gridSize + maxIdx;
    return null;
}

export function useKeyboardNavigation({
    isHelpOpen,
    pendingConfirm,
    navTab,
    isPlayingGame,
    isSpectating,
    selectedIndex,
    stateRef,
    cellRefs,
    setSelectedIndex,
    setActiveDigit,
    setIsHelpOpen,
    setNotesMode,
    broadcastCursor,
    broadcastActiveDigit,
    sendSpectatorHint,
    applyPlayerDigit,
    handleUndo,
    handleShift,
    focusCell,
}) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (isHelpOpen || pendingConfirm) return;
            if (navTab === 'settings') return;
            if (navTab === 'play' && !isPlayingGame) return;
            if (navTab === 'watch' && !isSpectating) return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

            const curState = stateRef.current.gameState;
            const activeVariant = curState.variant || inferVariantFromBoardLength(curState.board?.length);
            const specInfo = getVariantSpec(activeVariant);

            if (e.key === 'Escape') {
                if (selectedIndex !== null || stateRef.current.activeDigit !== null) {
                    e.preventDefault();
                    setSelectedIndex(null);
                    setActiveDigit(null);
                    if (!isSpectating) {
                        broadcastCursor(null);
                        broadcastActiveDigit(null);
                    }
                }
                return;
            }

            if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                setIsHelpOpen(true);
                return;
            }

            if (e.key >= '1' && e.key <= String(specInfo.maxDigit)) {
                const digit = parseInt(e.key, 10);
                if (isSpectating) {
                    sendSpectatorHint(digit);
                } else {
                    applyPlayerDigit(digit);
                }
                return;
            }

            if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
                if (isSpectating) {
                    sendSpectatorHint(undefined);
                } else {
                    applyPlayerDigit(0);
                }
                return;
            }

            if ((e.key === 'n' || e.key === 'N') && !isSpectating) {
                setNotesMode((prev) => !prev);
                return;
            }

            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !isSpectating) {
                e.preventDefault();
                handleUndo();
                return;
            }

            if (selectedIndex === null || selectedIndex >= specInfo.totalCells) return;

            if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && !isSpectating) {
                const shiftAction = SHIFT_KEY_MAP[e.key];
                if (shiftAction) {
                    e.preventDefault();
                    handleShift(shiftAction[0], shiftAction[1]);
                    return;
                }
            }

            const { row, col } = getCellCoords(selectedIndex, specInfo.id);
            const nextIndex = resolveNavigationTarget(e.key, row, col, specInfo);
            if (nextIndex !== null) {
                e.preventDefault();
                focusCell(nextIndex);
                cellRefs.current[nextIndex]?.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [
        applyPlayerDigit,
        broadcastActiveDigit,
        broadcastCursor,
        cellRefs,
        focusCell,
        handleShift,
        handleUndo,
        isHelpOpen,
        isPlayingGame,
        isSpectating,
        navTab,
        pendingConfirm,
        selectedIndex,
        sendSpectatorHint,
        setActiveDigit,
        setIsHelpOpen,
        setNotesMode,
        setSelectedIndex,
        stateRef,
    ]);
}
