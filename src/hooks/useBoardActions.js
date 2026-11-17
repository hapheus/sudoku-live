import { useCallback } from 'react';
import {
    clearAllNotes,
    fillCandidateNotes,
    findLogicalHint,
    setCellValue,
    shiftCol,
    shiftRow,
    toggleCellNote,
    undoLastMove,
} from '../domain/sudoku-engine.js';
import {
    formatCellCoord,
    getCellCoords,
    getVariantSpec,
    inferVariantFromBoardLength,
} from '../domain/sudoku-variants.js';

const CELL_UPDATE_EVENT = 'cell-update';

function formatLogicalHintMessage(hint, activeVariant, messages, isPreview) {
    const { row, col } = getCellCoords(hint.index, activeVariant);
    const cell = formatCellCoord(hint.index, activeVariant);
    const unitLabels = {
        box: messages?.hintUnitBox || 'box',
        row: messages?.hintUnitRow || 'row',
        col: messages?.hintUnitCol || 'column',
    };
    const unitLabel = unitLabels[hint.unitType] || unitLabels.col;

    const previewTemplates = {
        full_house: messages?.hintPreviewFullHouse || 'Hint: Check {cell} (last empty cell in {unit}). Tap Hint again to fill.',
        hidden_single: messages?.hintPreviewHiddenSingle || 'Hint: Check {cell} (only spot for one digit in {unit}). Tap Hint again to fill.',
        naked_single: messages?.hintPreviewNakedSingle || 'Hint: Check {cell} (only one candidate left here). Tap Hint again to fill.',
    };
    const solveTemplates = {
        full_house: messages?.hintReasonFullHouse || 'Hint: {cell} = {digit} (last empty cell in {unit}).',
        hidden_single: messages?.hintReasonHiddenSingle || 'Hint: {cell} = {digit} (only spot for {digit} in {unit}).',
        naked_single: messages?.hintReasonNakedSingle || 'Hint: {cell} = {digit} (only possible candidate for this cell).',
    };

    const template = isPreview
        ? (previewTemplates[hint.technique] || messages?.hintPreviewFallback || 'Hint: Check {cell}. Tap Hint again to fill.')
        : (solveTemplates[hint.technique] || messages?.hintReasonFallback || 'Hint: {cell} = {digit}.');

    return template
        .replaceAll('{cell}', cell)
        .replaceAll('{row}', String(row + 1))
        .replaceAll('{col}', String(col + 1))
        .replaceAll('{digit}', String(hint.digit))
        .replaceAll('{unit}', unitLabel);
}

export function useBoardActions({
    stateRef,
    onlineClientRef,
    soundEffectsRef,
    selectedIndex,
    notesMode,
    setGameState,
    setSelectedIndex,
    setActiveDigit,
    setPendingHint,
    setHintsMap,
    clearPendingHint,
    clearHintsForCell,
    triggerHintHighlight,
    triggerUnitCelebration,
    playMoveSoundFeedback,
    persistSnapshotIfNeeded,
    syncLobbyProgress,
    buildSyncPayload,
    announce,
    showFeedback,
    onLocalCellSolveForFistBump = null,
    onTicTacToeShift = null,
    isRetroMode = false,
}) {
    const isOnlineBroadcaster = (cur) => (
        (cur.mode === 'solo' || cur.mode === 'online') && Boolean(cur.onlineGameId) && !cur.isSpectating
    );

    const broadcastCursor = useCallback((idx) => {
        const cur = stateRef.current;
        if (!cur.isSpectating && (cur.myRole === 'host' || cur.myRole === 'guest') && cur.onlineGameId) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cursor', {
                senderId: onlineClientRef.current?.clientId,
                role: cur.myRole,
                index: idx,
            });
        }
    }, [onlineClientRef, stateRef]);

    const broadcastActiveDigit = useCallback((digit) => {
        const cur = stateRef.current;
        if (!cur.isSpectating && (cur.myRole === 'host' || cur.myRole === 'guest') && cur.onlineGameId) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'active-digit', {
                senderId: onlineClientRef.current?.clientId,
                role: cur.myRole,
                digit: digit ?? null,
            });
        }
    }, [onlineClientRef, stateRef]);

    const broadcastHintHighlight = useCallback((hint, highlightMode = 'solve') => {
        const cur = stateRef.current;
        if (!hint || !Number.isInteger(hint.index)) return;
        if (!cur.isSpectating && (cur.myRole === 'host' || cur.myRole === 'guest') && cur.onlineGameId) {
            const contextEntries = hint.contextDelays instanceof Map
                ? Array.from(hint.contextDelays.entries())
                : [[hint.index, 0]];
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'hint-highlight', {
                senderId: onlineClientRef.current?.clientId,
                role: cur.myRole,
                mode: highlightMode,
                index: hint.index,
                digit: hint.digit ?? null,
                technique: hint.technique ?? null,
                unitType: hint.unitType ?? null,
                unitIndex: hint.unitIndex ?? null,
                contextEntries,
            });
        }
    }, [onlineClientRef, stateRef]);

    const commitCellDigit = useCallback((targetIndex, digit, { clearPending = true } = {}) => {
        const cur = stateRef.current;
        const specInfo = getVariantSpec(cur.gameState.variant || inferVariantFromBoardLength(cur.gameState.board?.length));
        const owner = (cur.myRole === 'host' || cur.myRole === 'guest') ? cur.myRole : null;
        const prevGameState = cur.gameState;
        const prevBoard = prevGameState.board;
        const nextState = setCellValue(prevGameState, targetIndex, digit, { owner });

        setGameState(nextState);
        stateRef.current.gameState = nextState;

        if (clearPending && nextState !== prevGameState) {
            clearPendingHint();
        }
        if (digit !== 0) {
            clearHintsForCell(targetIndex);
            const unitCompleted = triggerUnitCelebration(prevBoard, nextState, targetIndex);
            if (nextState !== prevGameState) {
                playMoveSoundFeedback(nextState, targetIndex, digit, unitCompleted);
            }
            const expected = nextState.solution?.[targetIndex];
            const isCorrect = expected > 0 ? digit === expected : !nextState.conflicts?.includes(targetIndex);
            if (isCorrect) {
                onLocalCellSolveForFistBump?.(targetIndex, digit);
            }
            const totalPlaced = nextState.board.filter((v) => v === digit).length;
            if (totalPlaced >= specInfo.gridSize && cur.activeDigit === digit) {
                setActiveDigit(null);
                broadcastActiveDigit(null);
            }
        }
        if (nextState.status === 'solved') {
            setSelectedIndex(null);
            setActiveDigit(null);
            stateRef.current.selectedIndex = null;
            stateRef.current.activeDigit = null;
        }
        if (isOnlineBroadcaster(cur)) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, CELL_UPDATE_EVENT, {
                index: targetIndex,
                value: digit,
                notes: nextState.notes[targetIndex],
                owner,
            });
            syncLobbyProgress(nextState);
        }
        persistSnapshotIfNeeded(nextState);
        return nextState;
    }, [
        broadcastActiveDigit,
        clearHintsForCell,
        clearPendingHint,
        onlineClientRef,
        persistSnapshotIfNeeded,
        playMoveSoundFeedback,
        setActiveDigit,
        setGameState,
        setSelectedIndex,
        stateRef,
        syncLobbyProgress,
        triggerUnitCelebration,
        onLocalCellSolveForFistBump,
    ]);

    const writeDigitToCell = useCallback((targetIndex, digit) => {
        const cur = stateRef.current;
        if (cur.isSpectating || cur.mode === 'watch' || targetIndex === null || cur.gameState.status === 'solved') {
            return;
        }
        if (cur.gameState.givens[targetIndex]) {
            showFeedback('Fixed starting clue — choose an empty cell.');
            return;
        }

        const specInfo = getVariantSpec(cur.gameState.variant || inferVariantFromBoardLength(cur.gameState.board?.length));
        if (digit !== 0 && (digit < 1 || digit > specInfo.maxDigit)) {
            return;
        }

        try {
            if (notesMode && digit !== 0) {
                const nextState = toggleCellNote(cur.gameState, targetIndex, digit);
                setGameState(nextState);
                stateRef.current.gameState = nextState;
                if (isOnlineBroadcaster(cur)) {
                    onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, CELL_UPDATE_EVENT, {
                        index: targetIndex,
                        value: null,
                        notes: nextState.notes[targetIndex],
                    });
                }
                persistSnapshotIfNeeded(nextState);
            } else {
                commitCellDigit(targetIndex, digit);
            }
        } catch (err) {
            showFeedback(err.message);
        }
    }, [commitCellDigit, notesMode, onlineClientRef, persistSnapshotIfNeeded, setGameState, showFeedback, stateRef]);

    const applyPlayerDigit = useCallback((digit) => {
        const cur = stateRef.current;
        if (cur.isSpectating || cur.mode === 'watch' || cur.gameState.status === 'solved') {
            return;
        }

        const specInfo = getVariantSpec(cur.gameState.variant || inferVariantFromBoardLength(cur.gameState.board?.length));
        if (digit !== 0 && (digit < 1 || digit > specInfo.maxDigit)) {
            return;
        }

        const isGivenSelected = selectedIndex !== null && Boolean(cur.gameState.givens[selectedIndex]);
        if (selectedIndex === null || (digit !== 0 && isGivenSelected)) {
            if (digit === 0) {
                if (isGivenSelected) {
                    showFeedback('Fixed starting clue — choose an empty cell.');
                } else if (cur.activeDigit !== null) {
                    setActiveDigit(null);
                    broadcastActiveDigit(null);
                    showFeedback('Digit lock cleared.');
                } else {
                    showFeedback('Select a cell to erase.');
                }
                return;
            }

            if (isGivenSelected) {
                setSelectedIndex(null);
                setActiveDigit(digit);
                broadcastCursor(null);
                broadcastActiveDigit(digit);
                showFeedback(`Digit ${digit} locked — tap an empty cell to place it.`);
                return;
            }

            const nextActive = cur.activeDigit === digit ? null : digit;
            setActiveDigit(nextActive);
            broadcastActiveDigit(nextActive);
            showFeedback(
                nextActive
                    ? `Digit ${nextActive} locked — tap an empty cell to place it.`
                    : 'Digit lock cleared.',
            );
            return;
        }

        writeDigitToCell(selectedIndex, digit);
    }, [
        broadcastActiveDigit,
        broadcastCursor,
        selectedIndex,
        setActiveDigit,
        setSelectedIndex,
        showFeedback,
        stateRef,
        writeDigitToCell,
    ]);

    const focusCell = useCallback((idx) => {
        setSelectedIndex(idx);
        broadcastCursor(idx);
    }, [broadcastCursor, setSelectedIndex]);

    const handleCellSelect = useCallback((idx) => {
        setSelectedIndex(idx);
        broadcastCursor(idx);

        const cur = stateRef.current;
        if (!cur.isSpectating && cur.mode !== 'watch' && cur.gameState.status !== 'solved' && cur.activeDigit !== null) {
            if (cur.gameState.board[idx] === 0) {
                writeDigitToCell(idx, cur.activeDigit);
            } else {
                setActiveDigit(null);
                broadcastActiveDigit(null);
            }
        }
    }, [broadcastActiveDigit, broadcastCursor, setActiveDigit, setSelectedIndex, stateRef, writeDigitToCell]);

    const broadcastNoteChanges = useCallback((prevNotes, nextState) => {
        const cur = stateRef.current;
        if (!isOnlineBroadcaster(cur)) return;
        const totalCells = nextState.board.length;
        for (let i = 0; i < totalCells; i++) {
            if (prevNotes[i].join(',') !== nextState.notes[i].join(',')) {
                onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, CELL_UPDATE_EVENT, {
                    index: i,
                    value: nextState.board[i] === 0 ? null : nextState.board[i],
                    notes: nextState.notes[i],
                });
            }
        }
    }, [onlineClientRef, stateRef]);

    const handleFillCandidates = useCallback(() => {
        const cur = stateRef.current;
        if (cur.isSpectating || cur.mode === 'watch' || cur.gameState.status === 'solved') return;
        const prevNotes = cur.gameState.notes.map((n) => [...n]);
        const nextState = fillCandidateNotes(cur.gameState);
        if (nextState === cur.gameState) {
            showFeedback('Candidate notes are already up to date.');
            return;
        }
        setGameState(nextState);
        stateRef.current.gameState = nextState;
        broadcastNoteChanges(prevNotes, nextState);
        persistSnapshotIfNeeded(nextState);
        showFeedback('Filled candidate notes for empty cells.');
    }, [broadcastNoteChanges, persistSnapshotIfNeeded, setGameState, showFeedback, stateRef]);

    const handleClearNotes = useCallback(() => {
        const cur = stateRef.current;
        if (cur.isSpectating || cur.mode === 'watch' || cur.gameState.status === 'solved') return;
        const prevNotes = cur.gameState.notes.map((n) => [...n]);
        const nextState = clearAllNotes(cur.gameState);
        if (nextState === cur.gameState) {
            showFeedback('No pencil notes to clear.');
            return;
        }
        setGameState(nextState);
        stateRef.current.gameState = nextState;
        broadcastNoteChanges(prevNotes, nextState);
        persistSnapshotIfNeeded(nextState);
        showFeedback('Cleared all pencil notes.');
    }, [broadcastNoteChanges, persistSnapshotIfNeeded, setGameState, showFeedback, stateRef]);

    const handleUndo = useCallback(() => {
        const cur = stateRef.current;
        if (cur.isSpectating || cur.mode === 'watch' || !cur.gameState.history?.length) return;

        const prevBoard = [...cur.gameState.board];
        const prevGivens = [...cur.gameState.givens];
        const prevNotes = cur.gameState.notes.map((n) => [...n]);
        const nextState = undoLastMove(cur.gameState);
        setGameState(nextState);
        stateRef.current.gameState = nextState;
        clearPendingHint();

        if (isOnlineBroadcaster(cur)) {
            const givensChanged = prevGivens.some((val, idx) => val !== nextState.givens[idx]);
            if (givensChanged) {
                onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'sync', buildSyncPayload());
            } else {
                const totalCells = nextState.board.length;
                for (let i = 0; i < totalCells; i++) {
                    const boardChanged = prevBoard[i] !== nextState.board[i];
                    const notesChanged = prevNotes[i].join(',') !== nextState.notes[i].join(',');
                    if (boardChanged || notesChanged) {
                        onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, CELL_UPDATE_EVENT, {
                            index: i,
                            value: nextState.board[i],
                            notes: nextState.notes[i],
                            owner: nextState.cellOwners?.[i] || null,
                        });
                    }
                }
            }
            syncLobbyProgress(nextState);
        }

        persistSnapshotIfNeeded(nextState);
    }, [
        buildSyncPayload,
        clearPendingHint,
        onlineClientRef,
        persistSnapshotIfNeeded,
        setGameState,
        stateRef,
        syncLobbyProgress,
    ]);

    const handleShift = useCallback((axis, direction) => {
        const cur = stateRef.current;
        if (isRetroMode || cur.ticTacToeActive || cur.isSpectating || cur.mode === 'watch' || cur.gameState.status === 'solved') return;
        const activeIdx = cur.selectedIndex;
        if (activeIdx === null || activeIdx === undefined) return;

        const activeVariant = cur.gameState.variant || inferVariantFromBoardLength(cur.gameState.board?.length);
        const specInfo = getVariantSpec(activeVariant);
        if (activeIdx < 0 || activeIdx >= specInfo.totalCells) return;

        const { row, col } = getCellCoords(activeIdx, specInfo.id);
        const dir = direction < 0 ? -1 : 1;
        const nextState = axis === 'row'
            ? shiftRow(cur.gameState, row, dir)
            : shiftCol(cur.gameState, col, dir);

        if (nextState === cur.gameState) return;

        let nextSelectedIndex;
        if (axis === 'row') {
            const bandStart = Math.floor(row / specInfo.boxRows) * specInfo.boxRows;
            const targetRow = bandStart + ((row - bandStart + dir + specInfo.boxRows) % specInfo.boxRows);
            nextSelectedIndex = targetRow * specInfo.gridSize + col;
        } else {
            const stackStart = Math.floor(col / specInfo.boxCols) * specInfo.boxCols;
            const targetCol = stackStart + ((col - stackStart + dir + specInfo.boxCols) % specInfo.boxCols);
            nextSelectedIndex = row * specInfo.gridSize + targetCol;
        }

        setGameState(nextState);
        stateRef.current.gameState = nextState;
        clearPendingHint();
        focusCell(nextSelectedIndex);
        soundEffectsRef.current?.playShift();

        if (isOnlineBroadcaster(cur)) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'sync', buildSyncPayload());
            syncLobbyProgress(nextState);
        }

        const from = axis === 'row' ? row : col;
        const to = axis === 'row' ? Math.floor(nextSelectedIndex / specInfo.gridSize) : nextSelectedIndex % specInfo.gridSize;
        onTicTacToeShift?.({ axis, from, to, direction: dir });
        persistSnapshotIfNeeded(nextState);
    }, [
        buildSyncPayload,
        onTicTacToeShift,
        clearPendingHint,
        focusCell,
        isRetroMode,
        onlineClientRef,
        persistSnapshotIfNeeded,
        setGameState,
        soundEffectsRef,
        stateRef,
        syncLobbyProgress,
    ]);

    const handleLocalHint = useCallback(() => {
        const cur = stateRef.current;
        if (cur.isSpectating || cur.mode === 'watch' || cur.gameState.status === 'solved') return;

        const totalCells = cur.gameState.board.length;
        const activeVariant = cur.gameState.variant || inferVariantFromBoardLength(totalCells);
        const activePending = cur.pendingHint;
        const canResolvePending = Boolean(
            activePending
            && activePending.index >= 0
            && activePending.index < totalCells
            && !cur.gameState.givens[activePending.index]
            && cur.gameState.board[activePending.index] !== activePending.digit,
        );

        if (!canResolvePending) {
            const hint = findLogicalHint(cur.gameState, { preferredIndex: selectedIndex });
            if (!hint || !hint.digit) return;

            setPendingHint(hint);
            stateRef.current.pendingHint = hint;
            setSelectedIndex(hint.index);
            broadcastCursor(hint.index);
            triggerHintHighlight(hint, 'preview');
            broadcastHintHighlight(hint, 'preview');
            showFeedback(formatLogicalHintMessage(hint, activeVariant, cur.messages, true));
            return;
        }

        const hint = activePending;
        setPendingHint(null);
        stateRef.current.pendingHint = null;
        setSelectedIndex(hint.index);
        broadcastCursor(hint.index);
        commitCellDigit(hint.index, hint.digit, { clearPending: false });
        triggerHintHighlight(hint, 'solve');
        broadcastHintHighlight(hint, 'solve');
        showFeedback(formatLogicalHintMessage(hint, activeVariant, cur.messages, false));
    }, [
        broadcastCursor,
        broadcastHintHighlight,
        commitCellDigit,
        selectedIndex,
        setPendingHint,
        setSelectedIndex,
        showFeedback,
        stateRef,
        triggerHintHighlight,
    ]);

    const applySpectatorHint = useCallback((idx, digit) => {
        const cur = stateRef.current;
        if (cur.isSpectating || cur.mode === 'watch' || cur.gameState.status === 'solved') return;
        setSelectedIndex(idx);
        broadcastCursor(idx);
        commitCellDigit(idx, digit);
    }, [broadcastCursor, commitCellDigit, setSelectedIndex, stateRef]);

    const sendSpectatorHint = useCallback((value) => {
        const cur = stateRef.current;
        const client = onlineClientRef.current;
        if (!cur.isSpectating || !cur.onlineGameId || !client) return;
        if (selectedIndex === null) {
            showFeedback('Select an empty cell on the board first.');
            return;
        }
        if (cur.gameState.board[selectedIndex] !== 0) {
            showFeedback('That cell already has a digit — pick an empty cell.');
            return;
        }

        const activeVariant = cur.gameState.variant || inferVariantFromBoardLength(cur.gameState.board?.length);
        const specInfo = getVariantSpec(activeVariant);
        if (typeof value === 'number' && (value < 1 || value > specInfo.maxDigit)) {
            return;
        }

        const senderId = client.clientId;
        const existing = cur.hintsMap.get(senderId);

        if (value === undefined || (existing && existing.index === selectedIndex && existing.value === value)) {
            setHintsMap((prev) => {
                const next = new Map(prev);
                next.delete(senderId);
                return next;
            });
            client.sendWhisperEvent('hint', { senderId, index: null, value: null });
            announce(value === undefined ? 'Hint cleared.' : 'Hint removed.');
        } else {
            setHintsMap((prev) => {
                const next = new Map(prev);
                next.set(senderId, { senderId, index: selectedIndex, value });
                return next;
            });
            client.sendWhisperEvent('hint', { senderId, index: selectedIndex, value });
            const { row, col } = getCellCoords(selectedIndex, activeVariant);
            announce(value
                ? `Suggested ${value} at Row ${row + 1}, Column ${col + 1}.`
                : `Nudged players to check Row ${row + 1}, Column ${col + 1}.`);
        }
    }, [announce, onlineClientRef, selectedIndex, setHintsMap, showFeedback, stateRef]);

    return {
        broadcastCursor,
        broadcastActiveDigit,
        broadcastHintHighlight,
        writeDigitToCell,
        applyPlayerDigit,
        focusCell,
        handleCellSelect,
        handleFillCandidates,
        handleClearNotes,
        handleUndo,
        handleShift,
        handleLocalHint,
        applySpectatorHint,
        sendSpectatorHint,
    };
}
