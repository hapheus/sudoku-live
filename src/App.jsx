import { LANDSCAPE_LAYOUT_QUERY, useSplitLayout } from './hooks/useSplitLayout.js';
import { LandscapeArtwork } from './components/LandscapeArtwork.jsx';
import { selectLandscapeArtwork } from './services/landscape-artwork.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createCoopFistBumpTracker } from './domain/coop-fist-bump.js';
import { advanceKonamiState, createKonamiState } from './domain/konami-code.js';
import {
    formatCellCoord,
    inferVariantFromBoardLength,
    normalizeVariant,
} from './domain/sudoku-variants.js';
import { createSudokuGame } from './domain/sudoku-engine.js';
import { selectBoardBackground } from './services/board-backgrounds.js';
import { formatPlayerTag } from './services/player-name.js';
import { getOrCreateClientId } from './services/ws-config.js';
import { ALLOWED_REACTIONS, aggregateHintsByCell } from './utils/watcher-helpers.js';
import {
    hasUnsavedProgress,
    isNativeCapacitorApp,
    parseInitialRoute,
} from './utils/app-routing.js';
import { getStorageItem } from './utils/storage.js';
import { useAppPreferences } from './hooks/useAppPreferences.js';
import { useAudioPlayers } from './hooks/useAudioPlayers.js';
import { useBoardActions } from './hooks/useBoardActions.js';
import { useFeedbackTimers } from './hooks/useFeedbackTimers.js';
import { useGameTimersAndModals } from './hooks/useGameTimersAndModals.js';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation.js';
import { useNavigationAndSetup } from './hooks/useNavigationAndSetup.js';
import { useOnlineSession } from './hooks/useOnlineSession.js';
import { useTicTacToe } from './hooks/useTicTacToe.js';
import { AlertBannerDialog } from './components/AlertBannerDialog.jsx';
import { GamePlayView } from './components/GamePlayView.jsx';
import { SetupView } from './components/SetupView.jsx';
import { WatchDirectory } from './components/WatchDirectory.jsx';
import { PlayerControls } from './components/PlayerControls.jsx';
import { WatcherInteractions } from './components/WatcherInteractions.jsx';
import { HelpDialog } from './components/HelpDialog.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { SettingsPanel } from './components/SettingsPanel.jsx';
import { LegalPage } from './components/LegalPage.jsx';

function getRestartState(messages, isCoopSession, partnerOnline, gameState, rematchRequestedBy, myRole) {
    let restartLabel = messages.newPuzzle;
    let restartDisabled = false;
    const isWaitingForRematch = isCoopSession && Boolean(rematchRequestedBy && rematchRequestedBy === myRole);
    if (isCoopSession) {
        if (!partnerOnline && gameState.status !== 'solved') {
            restartLabel = messages.newPuzzle;
        } else if (isWaitingForRematch) {
            restartLabel = messages.waitingPartner;
            restartDisabled = true;
        } else if (rematchRequestedBy) {
            restartLabel = messages.acceptNewPuzzle;
        }
    }

    return { restartLabel, restartDisabled, isWaitingForRematch };
}

export function App() {
    const isNativeApp = isNativeCapacitorApp();
    const splitLayout = useSplitLayout();
    const landscapeLayout = useSplitLayout(LANDSCAPE_LAYOUT_QUERY);
    const [landscapeArtwork] = useState(() => selectLandscapeArtwork());
    const closeGuide = useCallback(() => setIsHelpOpen(false), []);
    const initialRoute = useMemo(() => parseInitialRoute(), []);

    const [legalPage, setLegalPage] = useState(() => (
        isNativeApp ? null : (initialRoute.initialLegalPage || null)
    ));
    const [navTab, setNavTab] = useState(() => (
        initialRoute.initialMode === 'watch' || initialRoute.initialWatch ? 'watch' : 'play'
    ));
    const [isPlayingGame, setIsPlayingGame] = useState(() => Boolean(
        initialRoute.initialGameId && !initialRoute.initialWatch,
    ));
    const {
        theme,
        setTheme,
        language,
        setLanguage,
        playerName,
        setPlayerName,
        randomizePlayerName,
        joinsAllowed,
        setJoinsAllowed,
        joinsAutoAccept,
        setJoinsAutoAccept,
        joinPolicy,
        messages,
    } = useAppPreferences();
    const {
        musicEnabled,
        musicVolume,
        soundEnabled,
        soundVolume,
        soundEffectsRef,
        handleMusicEnabledChange,
        handleMusicVolumeChange,
        handleSoundEnabledChange,
        handleSoundVolumeChange,
    } = useAudioPlayers();

    const [difficulty, setDifficulty] = useState(() => getStorageItem('sudoku_difficulty', 'medium') || 'medium');
    const [variant, setVariant] = useState(() => normalizeVariant(getStorageItem('sudoku_variant', '3x3') || '3x3'));
    const [mode, setMode] = useState(initialRoute.initialMode);
    const [isSpectating, setIsSpectating] = useState(initialRoute.initialWatch);
    const [onlineGameId, setOnlineGameId] = useState(initialRoute.initialGameId);
    const [myRole, setMyRole] = useState(null);
    const [spectatedGameMode, setSpectatedGameMode] = useState(null);
    const [hostJoinPolicy, setHostJoinPolicy] = useState('confirm');
    const [gameState, setGameState] = useState(() => createSudokuGame({
        difficulty: getStorageItem('sudoku_difficulty', 'medium') || 'medium',
        variant: normalizeVariant(getStorageItem('sudoku_variant', '3x3') || '3x3'),
    }));
    const [boardBackground, setBoardBackground] = useState(() => selectBoardBackground());
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [activeDigit, setActiveDigit] = useState(null);
    const [hostCursorIndex, setHostCursorIndex] = useState(null);
    const [guestCursors, setGuestCursors] = useState(() => new Map());
    const [remoteActiveDigit, setRemoteActiveDigit] = useState(null);
    const [notesMode, setNotesMode] = useState(false);
    const [rematchRequestedBy, setRematchRequestedBy] = useState(null);
    const [currentMembers, setCurrentMembers] = useState([]);
    const [activeLobbyRooms, setActiveLobbyRooms] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [pendingConfirm, setPendingConfirm] = useState(null);
    const [incomingJoinRequests, setIncomingJoinRequests] = useState([]);
    const incomingJoinRequest = incomingJoinRequests[0] || null;
    const [pendingJoinRequest, setPendingJoinRequest] = useState(null);
    const [hintsMap, setHintsMap] = useState(() => new Map());
    const [floatingReactions, setFloatingReactions] = useState([]);

    const cellRefs = useRef([]);
    const reactionSeq = useRef(0);
    const pendingJoinTimerRef = useRef(null);
    const [konamiState, setKonamiState] = useState(() => createKonamiState());
    const [isRetroMode, setIsRetroMode] = useState(false);
    const [remoteRetroMode, setRemoteRetroMode] = useState(false);
    const effectiveRetroMode = isSpectating ? remoteRetroMode : isRetroMode;
    const retroYear = useMemo(() => new Date().getFullYear(), []);
    const coopFistBumpTrackerRef = useRef(createCoopFistBumpTracker({ windowMs: 500, dedupeMs: 1200 }));

    const confirmCancelRef = useRef(null);
    const onlineClientRef = useRef(null);
    const messagesRef = useRef(messages);
    messagesRef.current = messages;

    const handleBroadcastHintClear = useCallback(() => {
        const cur = stateRef.current;
        if (!cur.isSpectating && (cur.myRole === 'host' || cur.myRole === 'guest') && cur.onlineGameId) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'hint-highlight', { mode: 'clear' });
        }
    }, []);

    const {
        announcement,
        actionFeedback,
        unitCelebration,
        hintHighlight,
        pendingHint,
        setPendingHint,
        fistBump,
        announce,
        showFeedback,
        clearHintHighlight,
        clearUnitCelebration,
        clearPendingHint,
        triggerHintHighlight,
        triggerUnitCelebration,
        triggerFistBump,
    } = useFeedbackTimers({
        messagesRef,
        onBroadcastHintClear: handleBroadcastHintClear,
    });

    // Live refs to avoid stale closures inside WebSocket event handlers
    const stateRef = useRef({});
    stateRef.current = {
        navTab,
        isPlayingGame,
        mode,
        difficulty,
        variant,
        isSpectating,
        onlineGameId,
        myRole,
        playerName,
        joinPolicy,
        gameState,
        boardBackground,
        rematchRequestedBy,
        currentMembers,
        hintsMap,
        selectedIndex,
        activeDigit,
        isHelpOpen,
        pendingConfirm,
        incomingJoinRequests,
        pendingJoinRequest,
        pendingHint,
        activeLobbyRooms,
        messages,
    };

    const ticTacToe = useTicTacToe({ stateRef, onlineClientRef });
    stateRef.current.ticTacToeActive = Boolean(ticTacToe.challenge.game);
    stateRef.current.ticTacToeChallenge = ticTacToe.challenge;
    stateRef.current.isRetroMode = isRetroMode;
    const setTicTacToeRoom = ticTacToe.setRoom;

    useEffect(() => {
        setTicTacToeRoom(onlineGameId);
    }, [onlineGameId, setTicTacToeRoom]);

    useEffect(() => () => {
        if (pendingJoinTimerRef.current) {
            clearTimeout(pendingJoinTimerRef.current);
        }
    }, []);

    const playMoveSoundFeedback = useCallback((nextState, index, digit, unitCompleted) => {
        const sfx = soundEffectsRef.current;
        if (!sfx || !nextState || !Number.isInteger(digit) || digit <= 0) return;

        const expected = nextState.solution?.[index];
        const isCorrect = expected > 0 ? digit === expected : !nextState.conflicts?.includes(index);

        if (nextState.status === 'solved' && isCorrect) {
            sfx.playGameSolved();
        } else if (!isCorrect) {
            sfx.playWrongDigit();
        } else if (unitCompleted) {
            sfx.playUnitCompleted();
        } else {
            sfx.playCorrectDigit();
        }
    }, [soundEffectsRef]);

    useEffect(() => {
        soundEffectsRef.current?.setRetroMode?.(effectiveRetroMode);
        if (typeof document !== 'undefined') {
            if (effectiveRetroMode) {
                document.documentElement.dataset.retro = 'true';
            } else {
                delete document.documentElement.dataset.retro;
            }
        }
        return () => {
            if (typeof document !== 'undefined') {
                delete document.documentElement.dataset.retro;
            }
        };
    }, [effectiveRetroMode, soundEffectsRef]);

    const triggerFistBumpEffect = useCallback(({ index, phraseKey = 'fistBumpAwesome', value = null }) => {
        const dedupeVal = Number.isInteger(value) ? value : 0;
        if (!coopFistBumpTrackerRef.current.claimEffect(index, dedupeVal)) {
            return;
        }
        soundEffectsRef.current?.playFistBump?.();
        triggerFistBump({ index, phraseKey });
        const cur = stateRef.current;
        const activeVariant = cur.gameState.variant || inferVariantFromBoardLength(cur.gameState.board?.length);
        const cellCoord = formatCellCoord(index, activeVariant);
        const phrase = cur.messages?.[phraseKey] || 'Awesome!';
        const template = cur.messages?.fistBumpAnnouncement || 'Fist bump! Both players solved {cell} at the same time — {phrase}';
        announce(template.replace('{cell}', cellCoord).replace('{phrase}', phrase));
    }, [announce, soundEffectsRef, triggerFistBump]);

    const broadcastAndTriggerFistBump = useCallback((index, value) => {
        const cur = stateRef.current;
        if (!cur.onlineGameId || cur.isSpectating || (cur.myRole !== 'host' && cur.myRole !== 'guest')) {
            return;
        }
        const phraseKey = index % 2 === 0 ? 'fistBumpAwesome' : 'fistBumpAmazing';
        triggerFistBumpEffect({ index, phraseKey, value });
        onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'fist-bump', {
            index,
            value,
            phraseKey,
            senderId: onlineClientRef.current?.clientId,
        });
    }, [triggerFistBumpEffect]);

    const handleLocalCellSolveForFistBump = useCallback((index, value) => {
        const cur = stateRef.current;
        if (!cur.onlineGameId || cur.isSpectating || (cur.myRole !== 'host' && cur.myRole !== 'guest')) {
            return;
        }
        const match = coopFistBumpTrackerRef.current.recordLocalSolve(index, value);
        if (match.matched) {
            broadcastAndTriggerFistBump(index, value);
        }
    }, [broadcastAndTriggerFistBump]);

    const handleRemoteCellSolveForFistBump = useCallback((data, patchedState) => {
        const cur = stateRef.current;
        if (!cur.onlineGameId || cur.isSpectating || (cur.myRole !== 'host' && cur.myRole !== 'guest')) {
            return;
        }
        if (!data || !Number.isInteger(data.index) || !Number.isInteger(data.value) || data.value <= 0) {
            return;
        }
        const expected = patchedState?.solution?.[data.index];
        const isCorrect = expected > 0 ? data.value === expected : !patchedState?.conflicts?.includes(data.index);
        if (!isCorrect) return;
        const match = coopFistBumpTrackerRef.current.recordRemoteSolve(data.index, data.value);
        if (match.matched) {
            broadcastAndTriggerFistBump(data.index, data.value);
        }
    }, [broadcastAndTriggerFistBump]);

    const triggerFloatingReaction = useCallback((emoji) => {
        if (!ALLOWED_REACTIONS.has(emoji)) return;
        soundEffectsRef.current?.playSpectatorCheer();
        const id = ++reactionSeq.current;
        const left = 15 + Math.floor(Math.random() * 68);
        setFloatingReactions((prev) => [...prev, { id, emoji, left }]);
        setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
        }, 1850);
    }, [soundEffectsRef]);

    const {
        persistSnapshotIfNeeded,
        syncLobbyProgress,
        openWatchDirectory,
        handleRespondJoinRequest,
        clearHintsForCell,
        buildSyncPayload,
        spectateGame,
        cancelPendingJoinRequest,
        joinWatchGame,
        ensureHostOnlineSession,
        startNewSoloGame,
        handleReconnect,
    } = useOnlineSession({
        initialRoute,
        playerName,
        joinPolicy,
        hostJoinPolicy,
        stateRef,
        onlineClientRef,
        pendingJoinTimerRef,
        setConnectionStatus,
        setNavTab,
        setIsPlayingGame,
        setMode,
        setDifficulty,
        setVariant,
        setIsSpectating,
        setSpectatedGameMode,
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
        setActiveLobbyRooms,
        setRemoteRetroMode,
        triggerHintHighlight,
        clearHintHighlight,
        clearUnitCelebration,
        clearPendingHint,
        triggerUnitCelebration,
        playMoveSoundFeedback,
        triggerFloatingReaction,
        triggerFistBumpEffect,
        handleRemoteCellSolveForFistBump,
        ticTacToe,
        announce,
        showFeedback,
    });

    useEffect(() => {
        syncLobbyProgress();
    }, [ticTacToe.challenge.game, syncLobbyProgress]);

    useGameTimersAndModals({
        navTab,
        isPlayingGame,
        isNativeApp,
        pendingConfirm,
        confirmCancelRef,
        stateRef,
        onlineClientRef,
        setGameState,
        setPendingConfirm,
        setLegalPage,
        syncLobbyProgress,
    });

    const {
        broadcastCursor,
        broadcastActiveDigit,
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
    } = useBoardActions({
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
        onLocalCellSolveForFistBump: handleLocalCellSolveForFistBump,
        onTicTacToeShift: ticTacToe.onShift,
        isRetroMode,
    });

    const handleKonamiInput = useCallback((input) => {
        if (isRetroMode) return;
        setKonamiState((prev) => {
            const next = advanceKonamiState(prev, input);
            if (next.completed) {
                setIsRetroMode(true);
                soundEffectsRef.current?.setRetroMode?.(true);
                soundEffectsRef.current?.playRetroActivate?.();
                const cur = stateRef.current;
                if (cur.onlineGameId && !cur.isSpectating) {
                    onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'retro-mode', {
                        enabled: true,
                        senderId: onlineClientRef.current?.clientId,
                    });
                }
                const msg = messagesRef.current?.retroModeActivated || '1981 Retro Mode activated! No shifting back then.';
                showFeedback(msg);
            }
            return { phase: next.phase, progress: next.progress };
        });
    }, [isRetroMode, showFeedback, soundEffectsRef]);

    const handleShiftWithKonami = useCallback((axis, dir) => {
        if (isRetroMode) return;
        const rowDirection = dir < 0 ? 'up' : 'down';
        const colDirection = dir < 0 ? 'left' : 'right';
        const directionKey = axis === 'row' ? rowDirection : colDirection;
        handleShift(axis, dir);
        handleKonamiInput(directionKey);
    }, [handleKonamiInput, handleShift, isRetroMode]);

    const handleExitRetro = useCallback(() => {
        setIsRetroMode(false);
        setKonamiState(createKonamiState());
        soundEffectsRef.current?.setRetroMode?.(false);
        soundEffectsRef.current?.playRetroExit?.();
        const cur = stateRef.current;
        if (cur.onlineGameId && !cur.isSpectating) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'retro-mode', {
                enabled: false,
                senderId: onlineClientRef.current?.clientId,
            });
        }
        const template = messagesRef.current?.retroModeDeactivated || 'Welcome back to {year}!';
        showFeedback(template.replace('{year}', String(retroYear)));
    }, [retroYear, showFeedback, soundEffectsRef]);

    const {
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
    } = useNavigationAndSetup({
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
        resetTicTacToe: ticTacToe.reset,
        announce,
        showFeedback,
    });

    useKeyboardNavigation({
        isHelpOpen,
        pendingConfirm,
        navTab,
        isPlayingGame: isPlayingGame && !ticTacToe.challenge.game,
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
    });

    const showHints = mode === 'solo' || mode === 'online' || isSpectating;
    const hintsByCell = useMemo(
        () => (showHints ? aggregateHintsByCell(hintsMap) : new Map()),
        [hintsMap, showHints],
    );
    const highlightedDigit = selectedIndex !== null && gameState.board[selectedIndex] > 0
        ? gameState.board[selectedIndex]
        : activeDigit;

    const myClientId = onlineClientRef.current?.clientId || null;
    const partnerOnline = currentMembers.some(
        (m) => (m.role === 'host' || m.role === 'guest') && (myClientId && m.id ? m.id !== myClientId : m.role !== myRole),
    );
    const isCoopSession = !isSpectating && (mode === 'online' || partnerOnline || myRole === 'guest');
    const hostOnline = currentMembers.some((m) => m.role === 'host');
    const canJoinSpectated = isSpectating && hostOnline && hostJoinPolicy !== 'disabled' && gameState.status !== 'solved' && !ticTacToe.challenge.game && Boolean(onlineGameId);
    const canResumeGame = !isSpectating && mode !== 'watch' && (hasUnsavedProgress(gameState) || isCoopSession);

    const watchPartnerCursorIndices = useMemo(
        () => Array.from(guestCursors.values()),
        [guestCursors],
    );
    const playPartnerCursorIndices = useMemo(() => {
        const indices = Array.from(guestCursors.values());
        if (myRole !== 'host' && hostCursorIndex !== null) {
            indices.push(hostCursorIndex);
        }
        return indices;
    }, [guestCursors, hostCursorIndex, myRole]);

    const activeBoardVariant = gameState.variant || inferVariantFromBoardLength(gameState.board?.length);

    const { restartLabel, restartDisabled, isWaitingForRematch } = getRestartState(
        messages, isCoopSession, partnerOnline, gameState, rematchRequestedBy, myRole,
    );

    const showLegalPage = !isNativeApp && Boolean(legalPage);
    const showBottomNav = showLegalPage || !((navTab === 'play' && isPlayingGame) || (navTab === 'watch' && isSpectating));
    const showGlobalRetroBar = isRetroMode && (showLegalPage || navTab !== 'play' || !isPlayingGame);

    const inlineGuide = splitLayout && !showBottomNav && isHelpOpen;
    const sharedGameViewProps = {
        guide: inlineGuide ? <HelpDialog isOpen panel onClose={closeGuide} messages={messages} /> : null,
        connectionStatus: connectionStatus,
        mode: mode,
        myRole: myRole,
        myClientId: onlineClientRef.current?.clientId || null,
        currentMembers: currentMembers,
        spectatedGameMode: spectatedGameMode,
        gameState: gameState,
        ticTacToeGame: ticTacToe.challenge.game,
        onTicTacToeMove: ticTacToe.onMove,
        onReconnect: handleReconnect,
        onContinueSolo: handleContinueSolo,
        selectedIndex: selectedIndex,
        hintsByCell: hintsByCell,
        floatingReactions: floatingReactions,
        cellRefs: cellRefs,
        onCellSelect: handleCellSelect,
        unitCelebration: unitCelebration,
        hintHighlight: hintHighlight,
        fistBump: fistBump,
        boardBackground: boardBackground,
        actionFeedback: actionFeedback,
        isCoopSession: isCoopSession,
        restartLabel: restartLabel,
        restartDisabled: restartDisabled,
        onPlayAgain: handleNewPuzzleAction,
        onBackToSetup: handleBackToSetup,
        activeBoardVariant: activeBoardVariant,
        onSelectHint: (idx) => {
                            focusCell(idx);
                            cellRefs.current[idx]?.focus();
                        },
        messages: messages,
    };

    return (
        <>
            <div id="sudoku-app" className={`app-container ${showBottomNav ? 'app-container--with-nav landscape-screen' : 'app-container--gameplay'}`}>
                <div className="landscape-screen__content">
                <div id="game-announcements" className="sr-only" aria-live="polite" aria-atomic="true">
                    {announcement}
                </div>

                {showGlobalRetroBar && (
                    <div id="retro-global-bar" className="retro-global-bar" role="region" aria-label={messages.retroLabel || '1981'}>
                        <span className="retro-global-bar__badge" aria-hidden="true">
                            {messages.retroLabel || '1981'}
                        </span>
                        <button
                            type="button"
                            id="retro-global-exit-btn"
                            className="shift-btn shift-btn--retro-exit"
                            onClick={handleExitRetro}
                        >
                            {(messages.retroBackToYear || 'Back to {year}').replace('{year}', String(retroYear))}
                        </button>
                    </div>
                )}

                {showLegalPage && (
                    <LegalPage
                        page={legalPage}
                        language={language}
                        onBack={closeLegalPage}
                        onSwitchPage={openLegalPage}
                        messages={messages}
                    />
                )}

                {pendingConfirm && (
                    <AlertBannerDialog
                        id="confirm-dialog"
                        titleId="confirm-title"
                        title={pendingConfirm.title}
                        message={pendingConfirm.message}
                        cancelLabel={pendingConfirm.cancelLabel}
                        confirmLabel={pendingConfirm.confirmLabel}
                        confirmVariant="confirm"
                        cancelRef={confirmCancelRef}
                        onCancel={() => setPendingConfirm(null)}
                        onConfirm={() => {
                            const action = pendingConfirm.onConfirm;
                            setPendingConfirm(null);
                            action?.();
                        }}
                    />
                )}

                {incomingJoinRequest && myRole === 'host' && !isSpectating && (
                    <AlertBannerDialog
                        id="join-request-banner"
                        titleId="join-request-title"
                        title={messages.joinRequestTitle || 'Player wants to join'}
                        message={incomingJoinRequest.requesterName
                            ? (messages.joinRequestMessageNamed || '{name} would like to join this puzzle in Co-op mode.')
                                .replace('{name}', incomingJoinRequest.requesterName)
                            : (messages.joinRequestMessage || 'Another player would like to join this puzzle in Co-op mode.')}
                        cancelId="decline-join-btn"
                        confirmId="accept-join-btn"
                        cancelLabel={messages.joinRequestDecline || 'Decline'}
                        confirmLabel={messages.joinRequestAccept || 'Allow'}
                        confirmVariant="accept"
                        onCancel={() => handleRespondJoinRequest(false)}
                        onConfirm={() => handleRespondJoinRequest(true)}
                    />
                )}

                {!showLegalPage && navTab === 'play' && !isPlayingGame && (
                    <SetupView
                        variant={variant}
                        difficulty={difficulty}
                        musicEnabled={musicEnabled}
                        canResumeGame={canResumeGame}
                        isNativeApp={isNativeApp}
                        onVariantChange={handleVariantChange}
                        onDifficultyChange={handleDifficultyChange}
                        onMusicEnabledChange={handleMusicEnabledChange}
                        onPlay={handlePlayFromSetup}
                        onResume={handleResumeFromSetup}
                        onOpenLegalPage={openLegalPage}
                        messages={messages}
                    />
                )}

                {!showLegalPage && navTab === 'play' && isPlayingGame && (
                    <GamePlayView
                        mainClassName="game-screen"
                        mainAriaLabel={messages.gameTitle}
                        topBar={(
                            <div className="game-top-bar">
                                {myRole !== 'guest' ? (
                                    <button
                                        type="button"
                                        id="back-to-setup-btn"
                                        className="game-top-bar__back-btn"
                                        onClick={handleBackToSetup}
                                    >
                                        <span aria-hidden="true">←</span>
                                        <span>{messages.backToSetup}</span>
                                    </button>
                                ) : <span />}

                                <div className="game-top-bar__actions">
                                    <button
                                        type="button"
                                        id="game-help-btn"
                                        className="game-top-bar__icon-btn"
                                        aria-label={messages.openGuide || 'Open Guide'}
                                        title={messages.openGuide || 'Open Guide'}
                                        onClick={() => setIsHelpOpen(true)}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <circle cx="12" cy="12" r="10" />
                                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                            <path d="M12 17h.01" />
                                        </svg>
                                    </button>
                                    <button
                                        type="button"
                                        id="game-settings-btn"
                                        className="game-top-bar__icon-btn"
                                        aria-label={messages.navSettings || 'Settings'}
                                        title={messages.navSettings || 'Settings'}
                                        onClick={() => handleSelectNavTab('settings')}
                                    >
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
                                            <circle cx="12" cy="12" r="3" />
                                        </svg>
                                    </button>
                                    {gameState.status !== 'solved' && (
                                        <>
                                            <button
                                                type="button"
                                                id="restart-btn"
                                                className="btn-secondary game-top-bar__new-btn"
                                                disabled={restartDisabled}
                                                onClick={handleNewPuzzleAction}
                                            >
                                                {restartLabel}
                                            </button>
                                            {isWaitingForRematch && (
                                                <button
                                                    type="button"
                                                    id="cancel-restart-btn"
                                                    className="btn-secondary"
                                                    onClick={handleCancelRematch}
                                                >
                                                    {messages.cancelRequest}
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                        {...sharedGameViewProps}

                        isSpectating={false}

                        activeDigit={activeDigit}

                        playerCursorIndex={null}
                        partnerCursorIndices={playPartnerCursorIndices}

                        onApplyHint={applySpectatorHint}
                        bottomControls={(
                            <PlayerControls
                                board={gameState.board}
                                variant={activeBoardVariant}
                                notesMode={notesMode}
                                canUndo={Boolean(gameState.history?.length) && gameState.status !== 'solved'}
                                activeDigit={activeDigit}
                                highlightedDigit={highlightedDigit}
                                isSolved={gameState.status === 'solved'}
                                isHintArmed={Boolean(pendingHint)}
                                canShift={selectedIndex !== null && !isSpectating}
                                konamiPhase={konamiState.phase}
                                isRetroMode={isRetroMode}
                                retroYear={retroYear}
                                onUndo={handleUndo}
                                onErase={() => applyPlayerDigit(0)}
                                onToggleNotes={() => setNotesMode((prev) => !prev)}
                                onFillCandidates={handleFillCandidates}
                                onClearNotes={handleClearNotes}
                                onLocalHint={handleLocalHint}
                                onShiftRow={(dir) => handleShiftWithKonami('row', dir)}
                                onShiftCol={(dir) => handleShiftWithKonami('col', dir)}
                                onKonamiButton={handleKonamiInput}
                                onExitRetro={handleExitRetro}
                                onDigit={applyPlayerDigit}
                                messages={messages}
                            />
                        )}

                    />
                )}

                {!showLegalPage && navTab === 'watch' && !isSpectating && (
                    <WatchDirectory
                        rooms={activeLobbyRooms}
                        connectionStatus={connectionStatus}
                        onReconnect={handleReconnect}
                        onRefresh={openWatchDirectory}
                        onWatchGame={spectateGame}
                        onJoinGame={joinWatchGame}
                        pendingJoinGameId={pendingJoinRequest?.gameId || null}
                        onCancelJoinRequest={cancelPendingJoinRequest}
                        messages={messages}
                    />
                )}

                {!showLegalPage && navTab === 'watch' && isSpectating && (
                    <GamePlayView
                        mainClassName="watch-screen"
                        mainAriaLabel={messages.navWatch}
                        topBar={(
                            <div id="spectator-bar" className="spectator-bar">
                                {hostJoinPolicy !== 'disabled' && (
                                    <span>
                                        <strong>{messages.spectatingBar}</strong> — {messages.spectatingReadOnly}
                                    </span>
                                )}
                                <div className="spectator-bar__actions">
                                    {canJoinSpectated && (
                                        pendingJoinRequest?.gameId === onlineGameId ? (
                                            <button
                                                type="button"
                                                id="cancel-join-from-watch-btn"
                                                className="spectator-bar__back-btn"
                                                onClick={cancelPendingJoinRequest}
                                            >
                                                {`${messages.watchJoinPending || 'Waiting...'} (${messages.cancelJoinRequest || 'Cancel'})`}
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                id="join-from-watch-btn"
                                                className="spectator-bar__join-btn"
                                                disabled={Boolean(pendingJoinRequest)}
                                                onClick={() => joinWatchGame(onlineGameId)}
                                            >
                                                {messages.joinGame}
                                            </button>
                                        )
                                    )}
                                    <button
                                        type="button"
                                        id="exit-watch-btn"
                                        className="spectator-bar__back-btn"
                                        onClick={exitSpectating}
                                    >
                                        {messages.backToLobby}
                                    </button>
                                </div>
                            </div>
                        )}
                        {...sharedGameViewProps}

                        isSpectating

                        activeDigit={selectedIndex === null ? remoteActiveDigit : activeDigit}

                        playerCursorIndex={hostCursorIndex}
                        partnerCursorIndices={watchPartnerCursorIndices}

                        onApplyHint={() => {}}
                        bottomControls={(
                            <WatcherInteractions
                                selectedIndex={selectedIndex}
                                board={gameState.board}
                                variant={activeBoardVariant}
                                onSendHint={sendSpectatorHint}
                                onSendReaction={(emoji) => {
                                    if (!onlineGameId) return;
                                    triggerFloatingReaction(emoji);
                                    onlineClientRef.current?.sendWhisperEvent('reaction', {
                                        emoji,
                                        senderId: onlineClientRef.current?.clientId,
                                    });
                                    announce(`Sent ${emoji} reaction.`);
                                }}
                                messages={messages}
                            />
                        )}

                    />
                )}

                {!showLegalPage && navTab === 'settings' && (
                    <SettingsPanel
                        theme={theme}
                        language={language}
                        playerName={playerName}
                        playerTag={formatPlayerTag(playerName, onlineClientRef.current?.clientId || getOrCreateClientId())}
                        joinsAllowed={joinsAllowed}
                        joinsAutoAccept={joinsAutoAccept}
                        musicEnabled={musicEnabled}
                        musicVolume={musicVolume}
                        soundEnabled={soundEnabled}
                        soundVolume={soundVolume}
                        onChangeTheme={setTheme}
                        onChangeLanguage={setLanguage}
                        onChangePlayerName={setPlayerName}
                        onRandomizePlayerName={randomizePlayerName}
                        onChangeJoinsAllowed={setJoinsAllowed}
                        onChangeJoinsAutoAccept={setJoinsAutoAccept}
                        onChangeMusicEnabled={handleMusicEnabledChange}
                        onChangeMusicVolume={handleMusicVolumeChange}
                        onChangeSoundEnabled={handleSoundEnabledChange}
                        onChangeSoundVolume={handleSoundVolumeChange}
                        onOpenGuide={() => setIsHelpOpen(true)}
                        messages={messages}
                    />
                )}

                </div>
                {showBottomNav && <LandscapeArtwork artwork={landscapeArtwork} active={landscapeLayout} />}
                <HelpDialog
                    isOpen={isHelpOpen && !inlineGuide}
                    onClose={closeGuide}
                    messages={messages}
                />
            </div>

            {showBottomNav && (
                <BottomNav
                    activeTab={showLegalPage ? null : navTab}
                    isWatchActive={mode === 'watch' || isSpectating}
                    onSelectTab={handleSelectNavTab}
                    messages={messages}
                />
            )}
        </>
    );
}
