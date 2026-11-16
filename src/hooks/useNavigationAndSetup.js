import { useCallback } from 'react';
import {
    getVariantSpec,
    inferVariantFromBoardLength,
    normalizeVariant,
} from '../domain/sudoku-variants.js';
import {
    createSudokuGame,
    serializeGameState,
} from '../domain/sudoku-engine.js';
import { selectBoardBackground } from '../services/board-backgrounds.js';
import { saveSoloGameSnapshot } from '../services/online-state-storage.js';
import { hasUnsavedProgress, normalizePathname, updateBrowserUrl } from '../utils/app-routing.js';
import { setStorageItem } from '../utils/storage.js';
import { clearPendingJoinState, respondToQueuedJoinRequests } from './useOnlineSession.js';

function hasPartnerOnline(cur) {
    return cur.currentMembers.some(
        (m) => m.role !== cur.myRole && (m.role === 'host' || m.role === 'guest'),
    );
}

/**
 * Manages navigation tabs, mode switching, legal pages, setup actions, and new puzzle/rematch flows.
 */
export function useNavigationAndSetup({
    isNativeApp,
    stateRef,
    onlineClientRef,
    pendingJoinTimerRef,
    cellRefs,
    setNavTab,
    setIsPlayingGame,
    setMode,
    setDifficulty,
    setVariant,
    setIsSpectating,
    setOnlineGameId,
    setMyRole,
    setGameState,
    setBoardBackground,
    setRematchRequestedBy,
    setCurrentMembers,
    setHintsMap,
    setSelectedIndex,
    setActiveDigit,
    setHostCursorIndex,
    setGuestCursors,
    setRemoteActiveDigit,
    setNotesMode,
    setHostJoinPolicy,
    setIncomingJoinRequests,
    setPendingJoinRequest,
    setPendingConfirm,
    setLegalPage,
    clearUnitCelebration,
    persistSnapshotIfNeeded,
    syncLobbyProgress,
    openWatchDirectory,
    ensureHostOnlineSession,
    startNewSoloGame,
    broadcastCursor,
    broadcastActiveDigit,
    resetTicTacToe = () => {},
    announce,
    showFeedback,
}) {
    const executeSwitchMode = useCallback((newMode) => {
        clearUnitCelebration();
        clearPendingJoinState({
            pendingJoinTimerRef,
            stateRef,
            onlineClientRef,
            setPendingJoinRequest,
        });
        respondToQueuedJoinRequests({
            stateRef,
            onlineClientRef,
            setIncomingJoinRequests,
            accepted: false,
            reason: 'declined',
        });

        onlineClientRef.current?.disconnect();
        setHostCursorIndex(null);
        setGuestCursors(new Map());
        setRemoteActiveDigit(null);
        setActiveDigit(null);
        setHostJoinPolicy('confirm');

        if (newMode === 'watch') {
            setNavTab('watch');
            setMode('watch');
            setIsSpectating(false);
            setOnlineGameId(null);
            setMyRole(null);
            setCurrentMembers([]);
            setHintsMap(new Map());
            stateRef.current.navTab = 'watch';
            stateRef.current.mode = 'watch';
            updateBrowserUrl('/');
            openWatchDirectory();
            return;
        }

        setNavTab('play');
        setIsPlayingGame(false);
        setIsSpectating(false);
        setHintsMap(new Map());
        setOnlineGameId(null);
        setMyRole(null);
        setCurrentMembers([]);
        stateRef.current.navTab = 'play';
        stateRef.current.isPlayingGame = false;
        updateBrowserUrl('/');
        startNewSoloGame(null, null, { restoreSaved: true, startSession: false });
    }, [
        clearUnitCelebration,
        onlineClientRef,
        openWatchDirectory,
        pendingJoinTimerRef,
        setActiveDigit,
        setCurrentMembers,
        setGuestCursors,
        setHintsMap,
        setHostCursorIndex,
        setHostJoinPolicy,
        setIncomingJoinRequests,
        setIsPlayingGame,
        setIsSpectating,
        setMode,
        setMyRole,
        setNavTab,
        setOnlineGameId,
        setPendingJoinRequest,
        setRemoteActiveDigit,
        startNewSoloGame,
        stateRef,
    ]);

    const switchMode = useCallback((newMode) => {
        const cur = stateRef.current;
        if (cur.mode === newMode && !cur.isSpectating) {
            setNavTab(newMode === 'watch' ? 'watch' : 'play');
            return;
        }

        const hasPartner = hasPartnerOnline(cur);
        if (!cur.isSpectating && (cur.mode === 'online' || hasPartner) && hasUnsavedProgress(cur.gameState)) {
            const targetNames = {
                solo: 'Solo',
                watch: 'Watch Live',
            };
            setPendingConfirm({
                title: `Switch to ${targetNames[newMode] || newMode}?`,
                message: 'Leaving this co-op room will disconnect you from the current match.',
                confirmLabel: `Switch to ${targetNames[newMode] || newMode}`,
                cancelLabel: 'Stay in Co-op',
                onConfirm: () => executeSwitchMode(newMode),
            });
            return;
        }

        executeSwitchMode(newMode);
    }, [executeSwitchMode, setNavTab, setPendingConfirm, stateRef]);

    const openLegalPage = useCallback((page) => {
        if (isNativeApp) return;
        setLegalPage(page);
        updateBrowserUrl(page === 'privacy' ? '/privacy' : '/impressum');
    }, [isNativeApp, setLegalPage]);

    const closeLegalPage = useCallback(() => {
        setLegalPage(null);
        updateBrowserUrl('/');
    }, [setLegalPage]);

    const handleSelectNavTab = useCallback((targetTab) => {
        setLegalPage(null);
        if (!isNativeApp && typeof window !== 'undefined') {
            const path = normalizePathname(window.location.pathname);
            if (path === '/privacy' || path === '/impressum') {
                updateBrowserUrl('/');
            }
        }
        if (targetTab === 'settings') {
            setNavTab('settings');
            return;
        }
        if (targetTab === 'watch') {
            if (stateRef.current.mode === 'watch') {
                setNavTab('watch');
            } else {
                switchMode('watch');
            }
            return;
        }
        if (stateRef.current.mode === 'watch') {
            switchMode('solo');
        } else {
            setNavTab('play');
        }
    }, [isNativeApp, setLegalPage, setNavTab, stateRef, switchMode]);

    const exitSpectating = useCallback(() => {
        clearPendingJoinState({
            pendingJoinTimerRef,
            stateRef,
            onlineClientRef,
            setPendingJoinRequest,
        });
        onlineClientRef.current?.leaveGameChannel();
        setOnlineGameId(null);
        setIsSpectating(false);
        setHostJoinPolicy('confirm');
        setNavTab('watch');
        setMode('watch');
        setHostCursorIndex(null);
        setGuestCursors(new Map());
        setRemoteActiveDigit(null);
        setCurrentMembers([]);
        setHintsMap(new Map());
        updateBrowserUrl('/');
        openWatchDirectory();
    }, [
        onlineClientRef,
        openWatchDirectory,
        pendingJoinTimerRef,
        setCurrentMembers,
        setGuestCursors,
        setHintsMap,
        setHostCursorIndex,
        setHostJoinPolicy,
        setIsSpectating,
        setMode,
        setNavTab,
        setOnlineGameId,
        setPendingJoinRequest,
        setRemoteActiveDigit,
        stateRef,
    ]);

    const handleCancelRematch = useCallback(() => {
        const cur = stateRef.current;
        if (!cur.onlineGameId) return;
        setRematchRequestedBy(null);
        persistSnapshotIfNeeded(cur.gameState, null);
        onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'new-puzzle-cancel', { role: cur.myRole });
        showFeedback('New puzzle request cancelled.');
    }, [onlineClientRef, persistSnapshotIfNeeded, setRematchRequestedBy, showFeedback, stateRef]);

    const startNewPuzzleConfirmed = useCallback(() => {
        const cur = stateRef.current;
        const partnerOnline = hasPartnerOnline(cur);
        const isCoopSession = cur.mode === 'online' || partnerOnline;

        if (!isCoopSession) {
            startNewSoloGame();
            return;
        }

        if (!partnerOnline || (cur.rematchRequestedBy && cur.rematchRequestedBy !== cur.myRole)) {
            const targetVariant = normalizeVariant(
                cur.gameState.variant || inferVariantFromBoardLength(cur.gameState.board?.length),
            );
            resetTicTacToe();
            const nextState = createSudokuGame({ difficulty: cur.difficulty, variant: targetVariant });
            const nextBg = selectBoardBackground({ previousId: cur.boardBackground?.id });
            setGameState(nextState);
            setBoardBackground(nextBg);
            stateRef.current.gameState = nextState;
            stateRef.current.boardBackground = nextBg;
            setSelectedIndex(null);
            setActiveDigit(null);
            setHostCursorIndex(null);
            setGuestCursors(new Map());
            setRemoteActiveDigit(null);
            setNotesMode(false);
            setRematchRequestedBy(null);
            setHintsMap(new Map());
            persistSnapshotIfNeeded(nextState, null, nextBg?.id || null);
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'new-puzzle-accept', {
                gameState: serializeGameState(nextState),
                boardBackgroundId: nextBg?.id || null,
            });
            syncLobbyProgress(nextState);
            announce('New co-op puzzle started.');
        } else {
            setRematchRequestedBy(cur.myRole);
            persistSnapshotIfNeeded(cur.gameState, cur.myRole);
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'new-puzzle-request', { role: cur.myRole });
            showFeedback('New puzzle requested. Waiting for your partner.');
        }
    }, [
        announce,
        onlineClientRef,
        persistSnapshotIfNeeded,
        setActiveDigit,
        setBoardBackground,
        setGameState,
        setGuestCursors,
        setHintsMap,
        setHostCursorIndex,
        setNotesMode,
        setRematchRequestedBy,
        setRemoteActiveDigit,
        setSelectedIndex,
        showFeedback,
        startNewSoloGame,
        resetTicTacToe,
        stateRef,
        syncLobbyProgress,
    ]);

    const handleNewPuzzleAction = useCallback(() => {
        const cur = stateRef.current;
        const partnerOnline = hasPartnerOnline(cur);

        if ((cur.mode === 'online' || partnerOnline) && partnerOnline) {
            startNewPuzzleConfirmed();
            return;
        }

        if (hasUnsavedProgress(cur.gameState)) {
            setPendingConfirm({
                title: 'Start a new puzzle?',
                message: 'Your current puzzle progress will be replaced by a new board.',
                confirmLabel: 'Start New Puzzle',
                cancelLabel: 'Keep Current Puzzle',
                onConfirm: () => startNewPuzzleConfirmed(),
            });
            return;
        }

        startNewPuzzleConfirmed();
    }, [setPendingConfirm, startNewPuzzleConfirmed, stateRef]);

    const handleDifficultyChange = useCallback((nextDiff) => {
        const cur = stateRef.current;
        if (nextDiff === cur.difficulty) return;

        const partnerOnline = hasPartnerOnline(cur);
        const applyDifficulty = () => {
            setDifficulty(nextDiff);
            setStorageItem('sudoku_difficulty', nextDiff);
            if (cur.isPlayingGame && cur.mode === 'solo' && !cur.isSpectating) {
                startNewSoloGame(nextDiff, cur.variant);
            }
        };

        if (cur.isPlayingGame && cur.mode === 'solo' && (hasUnsavedProgress(cur.gameState) || partnerOnline)) {
            const label = nextDiff.charAt(0).toUpperCase() + nextDiff.slice(1);
            setPendingConfirm({
                title: `Switch to ${label}?`,
                message: partnerOnline
                    ? 'Changing difficulty starts a new board for you and your partner.'
                    : 'Changing difficulty starts a new board and clears your current progress.',
                confirmLabel: `Start ${label} Puzzle`,
                cancelLabel: 'Keep Current Puzzle',
                onConfirm: applyDifficulty,
            });
            return;
        }

        applyDifficulty();
    }, [setDifficulty, setPendingConfirm, startNewSoloGame, stateRef]);

    const handleVariantChange = useCallback((nextVariantRaw) => {
        const cur = stateRef.current;
        const nextVariant = normalizeVariant(nextVariantRaw);
        if (nextVariant === cur.variant) return;

        const partnerOnline = hasPartnerOnline(cur);
        const applyVariant = () => {
            setVariant(nextVariant);
            setStorageItem('sudoku_variant', nextVariant);
            if (cur.isPlayingGame && cur.mode === 'solo' && !cur.isSpectating) {
                startNewSoloGame(cur.difficulty, nextVariant);
            }
        };

        if (cur.isPlayingGame && cur.mode === 'solo' && (hasUnsavedProgress(cur.gameState) || partnerOnline)) {
            const specInfo = getVariantSpec(nextVariant);
            setPendingConfirm({
                title: `Switch to ${specInfo.label}?`,
                message: partnerOnline
                    ? 'Changing grid size starts a new board for you and your partner.'
                    : 'Changing grid size starts a new board and clears your current progress.',
                confirmLabel: `Play ${specInfo.shortLabel}`,
                cancelLabel: 'Keep Current Puzzle',
                onConfirm: applyVariant,
            });
            return;
        }

        applyVariant();
    }, [setPendingConfirm, setVariant, startNewSoloGame, stateRef]);

    const handlePlayFromSetup = useCallback(() => {
        const cur = stateRef.current;
        const partnerOnline = hasPartnerOnline(cur);
        const isCoop = cur.mode === 'online' || partnerOnline;

        const launchGame = () => {
            const curState = stateRef.current.gameState;
            const curVar = normalizeVariant(curState.variant || inferVariantFromBoardLength(curState.board?.length));
            const matchesSelection = curVar === cur.variant && curState.difficulty === cur.difficulty;

            if (!hasUnsavedProgress(curState) && !isCoop && matchesSelection && curState.status !== 'solved') {
                setNavTab('play');
                setIsPlayingGame(true);
                stateRef.current.navTab = 'play';
                stateRef.current.isPlayingGame = true;
                setSelectedIndex(0);
                stateRef.current.selectedIndex = 0;
                saveSoloGameSnapshot(curState, stateRef.current.onlineGameId, stateRef.current.boardBackground?.id || null);
                ensureHostOnlineSession(curState, stateRef.current.onlineGameId, 'solo');
                broadcastCursor(0);
                broadcastActiveDigit(null);
                requestAnimationFrame(() => cellRefs.current[0]?.focus());
                return;
            }

            if (isCoop) {
                onlineClientRef.current?.disconnect();
                setOnlineGameId(null);
                setMyRole(null);
                setCurrentMembers([]);
                stateRef.current.onlineGameId = null;
                stateRef.current.myRole = null;
                updateBrowserUrl('/');
            }

            setNavTab('play');
            setIsPlayingGame(true);
            stateRef.current.navTab = 'play';
            stateRef.current.isPlayingGame = true;
            startNewSoloGame(cur.difficulty, cur.variant, { startSession: true });
            setSelectedIndex(0);
            stateRef.current.selectedIndex = 0;
            broadcastCursor(0);
            broadcastActiveDigit(null);
            requestAnimationFrame(() => cellRefs.current[0]?.focus());
        };

        if (isCoop && partnerOnline && hasUnsavedProgress(cur.gameState)) {
            setPendingConfirm({
                title: 'Start a new solo puzzle?',
                message: 'Leaving this co-op room will disconnect you from your partner.',
                confirmLabel: 'Start New Puzzle',
                cancelLabel: 'Stay in Co-op',
                onConfirm: launchGame,
            });
            return;
        }

        launchGame();
    }, [
        broadcastActiveDigit,
        broadcastCursor,
        cellRefs,
        ensureHostOnlineSession,
        onlineClientRef,
        setCurrentMembers,
        setIsPlayingGame,
        setMyRole,
        setNavTab,
        setOnlineGameId,
        setPendingConfirm,
        setSelectedIndex,
        startNewSoloGame,
        stateRef,
    ]);

    const handleResumeFromSetup = useCallback(() => {
        const curState = stateRef.current.gameState;
        const resumedVar = normalizeVariant(curState.variant || inferVariantFromBoardLength(curState.board?.length));
        setVariant(resumedVar);
        setStorageItem('sudoku_variant', resumedVar);
        if (curState.difficulty) {
            setDifficulty(curState.difficulty);
            setStorageItem('sudoku_difficulty', curState.difficulty);
        }
        setNavTab('play');
        setIsPlayingGame(true);
        stateRef.current.navTab = 'play';
        stateRef.current.isPlayingGame = true;
        setSelectedIndex(0);
        stateRef.current.selectedIndex = 0;
        if (stateRef.current.myRole === 'host' && !stateRef.current.isSpectating && stateRef.current.onlineGameId) {
            ensureHostOnlineSession(curState, stateRef.current.onlineGameId, stateRef.current.mode);
            broadcastCursor(0);
            broadcastActiveDigit(null);
        }
        requestAnimationFrame(() => cellRefs.current[0]?.focus());
    }, [
        broadcastActiveDigit,
        broadcastCursor,
        cellRefs,
        ensureHostOnlineSession,
        setDifficulty,
        setIsPlayingGame,
        setNavTab,
        setSelectedIndex,
        setVariant,
        stateRef,
    ]);

    const detachCoopToSolo = useCallback((cur, roomId = null) => {
        onlineClientRef.current?.leaveGameChannel();
        onlineClientRef.current?.leaveLobby();
        setMode('solo');
        stateRef.current.mode = 'solo';
        setMyRole('host');
        stateRef.current.myRole = 'host';
        setOnlineGameId(roomId);
        stateRef.current.onlineGameId = roomId;
        setCurrentMembers([]);
        stateRef.current.currentMembers = [];
        setHostCursorIndex(null);
        setGuestCursors(new Map());
        setRemoteActiveDigit(null);
        setRematchRequestedBy(null);
        setHintsMap(new Map());
        updateBrowserUrl(roomId ? `/games/${roomId}` : '/');
        if (cur.gameState && cur.gameState.status !== 'solved') {
            saveSoloGameSnapshot(cur.gameState, roomId, cur.boardBackground?.id || null);
        }
    }, [
        onlineClientRef,
        setCurrentMembers,
        setGuestCursors,
        setHintsMap,
        setHostCursorIndex,
        setMode,
        setMyRole,
        setOnlineGameId,
        setRematchRequestedBy,
        setRemoteActiveDigit,
        stateRef,
    ]);

    const handleContinueSolo = useCallback(() => {
        const cur = stateRef.current;
        if (cur.isSpectating) return;
        const roomId = cur.onlineGameId;
        detachCoopToSolo(cur, roomId);
        if (roomId) ensureHostOnlineSession(cur.gameState, roomId, 'solo');
        showFeedback('Continuing as a solo game.');
        announce('Continuing current board as a solo game.');
    }, [announce, detachCoopToSolo, ensureHostOnlineSession, showFeedback, stateRef]);

    const handleBackToSetup = useCallback(() => {
        setIsPlayingGame(false);
        stateRef.current.isPlayingGame = false;
        const cur = stateRef.current;
        const hasPartner = hasPartnerOnline(cur);
        respondToQueuedJoinRequests({
            stateRef,
            onlineClientRef,
            setIncomingJoinRequests,
            accepted: false,
            reason: 'declined',
        });
        if (cur.myRole === 'guest' || (!hasPartner && cur.mode === 'online')) {
            detachCoopToSolo(cur);
            return;
        }
        if (!hasPartner && cur.myRole === 'host') {
            onlineClientRef.current?.leaveLobby();
        }
    }, [detachCoopToSolo, onlineClientRef, setIncomingJoinRequests, setIsPlayingGame, stateRef]);

    return {
        switchMode,
        openLegalPage,
        closeLegalPage,
        handleSelectNavTab,
        exitSpectating,
        handleCancelRematch,
        handleNewPuzzleAction,
        handleDifficultyChange,
        handleVariantChange,
        handlePlayFromSetup,
        handleResumeFromSetup,
        handleContinueSolo,
        handleBackToSetup,
    };
}
