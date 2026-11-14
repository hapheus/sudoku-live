import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    getCellCoords,
    getVariantSpec,
    inferVariantFromBoardLength,
    normalizeVariant,
} from './domain/sudoku-generator.js';
import {
    applyRemoteCellPatch,
    clearAllNotes,
    createSudokuGame,
    detectNewlyCompletedUnits,
    fillCandidateNotes,
    findLogicalHint,
    hydrateGameState,
    serializeGameState,
    setCellValue,
    toggleCellNote,
    undoLastMove,
} from './domain/sudoku-engine.js';
import { generateEventId, generateGameId, isValidGameId, OnlineGameClient } from './services/online-game-client.js';
import { createBackgroundMusicPlayer, loadMusicEnabled, loadMusicVolume } from './services/background-music.js';
import { createSoundEffectsPlayer, loadSoundEnabled, loadSoundVolume } from './services/sound-effects.js';
import {
    loadJoinsAllowed,
    loadJoinsAutoAccept,
    normalizeJoinPolicy,
    resolveJoinPolicy,
    saveJoinsAllowed,
    saveJoinsAutoAccept,
} from './services/join-settings.js';
import {
    loadOnlineGameSnapshot,
    loadParticipantSession,
    loadSoloGameSnapshot,
    saveOnlineGameSnapshot,
    saveParticipantSession,
    saveSoloGameSnapshot,
} from './services/online-state-storage.js';
import {
    getBoardBackgroundById,
    selectBoardBackground,
} from './services/board-backgrounds.js';
import { ALLOWED_REACTIONS, aggregateHintsByCell } from './utils/watcher-helpers.js';
import { VariantSelector } from './components/VariantSelector.jsx';
import { DifficultySelector } from './components/DifficultySelector.jsx';
import { getMessages } from './locales/index.js';
import { WatchDirectory } from './components/WatchDirectory.jsx';
import { StatusBanner } from './components/StatusBanner.jsx';
import { SudokuBoard } from './components/SudokuBoard.jsx';
import { SpectatorHintsFeed } from './components/SpectatorHintsFeed.jsx';
import { PlayerControls } from './components/PlayerControls.jsx';
import { WatcherInteractions } from './components/WatcherInteractions.jsx';
import { HelpDialog } from './components/HelpDialog.jsx';
import { SolveSummary } from './components/SolveSummary.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { SettingsPanel } from './components/SettingsPanel.jsx';
import { LegalPage } from './components/LegalPage.jsx';

const GAME_PING_INTERVAL_MS = 5000;
const APP_STORE_URL = 'https://apps.apple.com/app/id6834748729';

function isNativeCapacitorApp() {
    return typeof window !== 'undefined' && Boolean(window.Capacitor?.isNativePlatform?.());
}

function hasUnsavedProgress(state) {
    if (!state || state.status === 'solved') return false;
    const givenCount = Array.isArray(state.givens) ? state.givens.filter(Boolean).length : 0;
    const hasNotes = Array.isArray(state.notes) && state.notes.some((arr) => Array.isArray(arr) && arr.length > 0);
    return Boolean((state.history && state.history.length > 0) || state.filledCount > givenCount || hasNotes);
}

function parseInitialRoute() {
    if (typeof window === 'undefined') {
        return { initialMode: 'solo', initialGameId: null, initialWatch: false, initialLegalPage: null };
    }

    const isNative = isNativeCapacitorApp();
    const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    if (!isNative && pathname === '/privacy') {
        return { initialMode: 'solo', initialGameId: null, initialWatch: false, initialLegalPage: 'privacy' };
    }
    if (!isNative && pathname === '/impressum') {
        return { initialMode: 'solo', initialGameId: null, initialWatch: false, initialLegalPage: 'impressum' };
    }

    const params = new URLSearchParams(window.location.search);
    const pathMatch = window.location.pathname.match(/^\/games\/([A-Za-z0-9_-]{6,64})\/?$/);
    const queryGame = params.get('game');
    const gameId = pathMatch?.[1] || (isValidGameId(queryGame) ? queryGame : null);
    const watch = params.get('watch') === '1' && Boolean(gameId);

    if (watch && gameId) {
        return { initialMode: 'watch', initialGameId: gameId, initialWatch: true, initialLegalPage: null };
    }
    if (gameId) {
        return { initialMode: 'online', initialGameId: gameId, initialWatch: false, initialLegalPage: null };
    }
    return { initialMode: 'solo', initialGameId: null, initialWatch: false, initialLegalPage: null };
}

function updateBrowserUrl(path) {
    if (typeof window === 'undefined') return;
    const isNative = isNativeCapacitorApp();
    if (isNative || !window.location.protocol.startsWith('http')) {
        return;
    }
    window.history.pushState({}, '', path);
}

function replaceBrowserUrl(path) {
    if (typeof window === 'undefined') return;
    const isNative = isNativeCapacitorApp();
    if (isNative || !window.location.protocol.startsWith('http')) {
        return;
    }
    window.history.replaceState({}, '', path);
}

export function App() {
    const isNativeApp = isNativeCapacitorApp();
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
    const [theme, setTheme] = useState(() => (
        localStorage.getItem('sudoku_theme') === 'light' ? 'light' : 'dark'
    ));
    const [language, setLanguage] = useState(() => (
        localStorage.getItem('sudoku_lang') === 'de' ? 'de' : 'en'
    ));
    const [joinsAllowed, setJoinsAllowed] = useState(() => loadJoinsAllowed());
    const [joinsAutoAccept, setJoinsAutoAccept] = useState(() => loadJoinsAutoAccept());
    const joinPolicy = useMemo(() => resolveJoinPolicy(joinsAllowed, joinsAutoAccept), [joinsAllowed, joinsAutoAccept]);
    const [musicEnabled, setMusicEnabled] = useState(() => loadMusicEnabled());
    const [musicVolume, setMusicVolume] = useState(() => loadMusicVolume());
    const [soundEnabled, setSoundEnabled] = useState(() => loadSoundEnabled());
    const [soundVolume, setSoundVolume] = useState(() => loadSoundVolume());
    const messages = useMemo(() => getMessages(language), [language]);

    const [difficulty, setDifficulty] = useState(() => localStorage.getItem('sudoku_difficulty') || 'medium');
    const [variant, setVariant] = useState(() => normalizeVariant(localStorage.getItem('sudoku_variant') || '3x3'));
    const [mode, setMode] = useState(initialRoute.initialMode);
    const [isSpectating, setIsSpectating] = useState(initialRoute.initialWatch);
    const [onlineGameId, setOnlineGameId] = useState(initialRoute.initialGameId);
    const [myRole, setMyRole] = useState(null);
    const [spectatedGameMode, setSpectatedGameMode] = useState(null);
    const [hostJoinPolicy, setHostJoinPolicy] = useState('confirm');
    const [gameState, setGameState] = useState(() => createSudokuGame({
        difficulty: localStorage.getItem('sudoku_difficulty') || 'medium',
        variant: normalizeVariant(localStorage.getItem('sudoku_variant') || '3x3'),
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
    const [announcement, setAnnouncement] = useState('');
    const [actionFeedback, setActionFeedback] = useState('');
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [pendingConfirm, setPendingConfirm] = useState(null);
    const [incomingJoinRequests, setIncomingJoinRequests] = useState([]);
    const incomingJoinRequest = incomingJoinRequests[0] || null;
    const [pendingJoinRequest, setPendingJoinRequest] = useState(null);
    const [hintsMap, setHintsMap] = useState(() => new Map());
    const [floatingReactions, setFloatingReactions] = useState([]);
    const [unitCelebration, setUnitCelebration] = useState(() => ({ id: 0, cellDelays: new Map() }));
    const [hintHighlight, setHintHighlight] = useState(() => ({ id: 0, mode: 'solve', targetIndex: null, contextDelays: new Map() }));
    const [pendingHint, setPendingHint] = useState(null);

    const cellRefs = useRef([]);
    const reactionSeq = useRef(0);
    const feedbackTimerRef = useRef(null);
    const unitCelebrationTimerRef = useRef(null);
    const hintHighlightTimerRef = useRef(null);
    const pendingJoinTimerRef = useRef(null);
    const confirmCancelRef = useRef(null);
    const onlineClientRef = useRef(null);
    const musicPlayerRef = useRef(null);
    const soundEffectsRef = useRef(null);

    // Live refs to avoid stale closures inside WebSocket event handlers
    const stateRef = useRef({
        navTab,
        isPlayingGame,
        mode,
        difficulty,
        variant,
        isSpectating,
        onlineGameId,
        myRole,
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
    });
    stateRef.current = {
        navTab,
        isPlayingGame,
        mode,
        difficulty,
        variant,
        isSpectating,
        onlineGameId,
        myRole,
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

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
        localStorage.setItem('sudoku_theme', theme);
        const themeMeta = document.querySelector('meta[name="theme-color"]');
        if (themeMeta) {
            themeMeta.setAttribute('content', theme === 'light' ? '#f6f2ea' : '#13161b');
        }
    }, [theme]);

    useEffect(() => {
        document.documentElement.lang = language;
        localStorage.setItem('sudoku_lang', language);
    }, [language]);

    useEffect(() => {
        saveJoinsAllowed(joinsAllowed);
    }, [joinsAllowed]);

    useEffect(() => {
        saveJoinsAutoAccept(joinsAutoAccept);
    }, [joinsAutoAccept]);

    useEffect(() => {
        const player = createBackgroundMusicPlayer();
        musicPlayerRef.current = player;
        player.start();
        return () => {
            player.destroy();
            musicPlayerRef.current = null;
        };
    }, []);

    useEffect(() => {
        musicPlayerRef.current?.setEnabled(musicEnabled);
    }, [musicEnabled]);

    useEffect(() => {
        musicPlayerRef.current?.setVolume(musicVolume);
    }, [musicVolume]);

    useEffect(() => {
        const sfx = createSoundEffectsPlayer();
        soundEffectsRef.current = sfx;
        return () => {
            sfx.destroy();
            soundEffectsRef.current = null;
        };
    }, []);

    useEffect(() => {
        soundEffectsRef.current?.setEnabled(soundEnabled);
    }, [soundEnabled]);

    useEffect(() => {
        soundEffectsRef.current?.setVolume(soundVolume);
    }, [soundVolume]);

    useEffect(() => () => {
        if (unitCelebrationTimerRef.current) {
            clearTimeout(unitCelebrationTimerRef.current);
        }
        if (hintHighlightTimerRef.current) {
            clearTimeout(hintHighlightTimerRef.current);
        }
        if (feedbackTimerRef.current) {
            clearTimeout(feedbackTimerRef.current);
        }
        if (pendingJoinTimerRef.current) {
            clearTimeout(pendingJoinTimerRef.current);
        }
    }, []);

    const announce = useCallback((msg) => {
        if (msg) setAnnouncement(msg);
    }, []);

    const showFeedback = useCallback((msg) => {
        if (!msg) return;
        setActionFeedback(msg);
        setAnnouncement(msg);
        if (feedbackTimerRef.current) {
            clearTimeout(feedbackTimerRef.current);
        }
        feedbackTimerRef.current = setTimeout(() => {
            setActionFeedback('');
        }, 3200);
    }, []);

    const clearUnitCelebration = useCallback(() => {
        if (unitCelebrationTimerRef.current) {
            clearTimeout(unitCelebrationTimerRef.current);
            unitCelebrationTimerRef.current = null;
        }
        if (hintHighlightTimerRef.current) {
            clearTimeout(hintHighlightTimerRef.current);
            hintHighlightTimerRef.current = null;
        }
        setPendingHint(null);
        stateRef.current.pendingHint = null;
        setUnitCelebration((prev) => (prev.cellDelays.size > 0 ? { id: prev.id, cellDelays: new Map() } : prev));
        setHintHighlight((prev) => (prev.contextDelays.size > 0 || prev.targetIndex !== null
            ? { id: prev.id, mode: 'solve', targetIndex: null, contextDelays: new Map() }
            : prev));
    }, []);

    const clearPendingHint = useCallback((shouldBroadcast = true) => {
        const hadPending = Boolean(stateRef.current.pendingHint);
        if (hadPending) {
            setPendingHint(null);
            stateRef.current.pendingHint = null;
        }
        setHintHighlight((prev) => (prev.mode === 'preview' && (prev.contextDelays.size > 0 || prev.targetIndex !== null)
            ? { id: prev.id, mode: 'solve', targetIndex: null, contextDelays: new Map() }
            : prev));
        if (shouldBroadcast && hadPending) {
            const cur = stateRef.current;
            if (!cur.isSpectating && (cur.myRole === 'host' || cur.myRole === 'guest') && cur.onlineGameId) {
                onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'hint-highlight', { mode: 'clear' });
            }
        }
    }, []);

    const triggerHintHighlight = useCallback((hintResult, highlightMode = 'solve') => {
        if (!hintResult || !Number.isInteger(hintResult.index)) return;
        if (hintHighlightTimerRef.current) {
            clearTimeout(hintHighlightTimerRef.current);
            hintHighlightTimerRef.current = null;
        }
        const delays = hintResult.contextDelays instanceof Map ? hintResult.contextDelays : new Map([[hintResult.index, 0]]);
        const maxDelay = delays.size > 0 ? Math.max(0, ...delays.values()) : 0;
        setHintHighlight((prev) => ({
            id: prev.id + 1,
            mode: highlightMode,
            targetIndex: hintResult.index,
            contextDelays: delays,
        }));
        if (highlightMode !== 'preview') {
            hintHighlightTimerRef.current = setTimeout(() => {
                hintHighlightTimerRef.current = null;
                setHintHighlight((prev) => ({ id: prev.id, mode: 'solve', targetIndex: null, contextDelays: new Map() }));
            }, maxDelay + 1650);
        }
    }, []);

    const triggerUnitCelebration = useCallback((prevBoard, nextState, pivotIndex = null) => {
        if (!prevBoard || !nextState?.board) return false;
        const result = detectNewlyCompletedUnits(prevBoard, nextState.board, nextState.variant, pivotIndex);
        if (!result.hasAny) return false;

        if (unitCelebrationTimerRef.current) {
            clearTimeout(unitCelebrationTimerRef.current);
        }
        const maxDelay = Math.max(0, ...result.cellDelays.values());
        setUnitCelebration((prev) => ({ id: prev.id + 1, cellDelays: result.cellDelays }));
        unitCelebrationTimerRef.current = setTimeout(() => {
            unitCelebrationTimerRef.current = null;
            setUnitCelebration((prev) => ({ id: prev.id, cellDelays: new Map() }));
        }, maxDelay + 760);

        if (nextState.status !== 'solved') {
            const m = stateRef.current.messages;
            const parts = [];
            if (result.rows.length > 0 && m?.unitCompletedRow) parts.push(m.unitCompletedRow);
            if (result.cols.length > 0 && m?.unitCompletedCol) parts.push(m.unitCompletedCol);
            if (result.boxes.length > 0 && m?.unitCompletedBox) parts.push(m.unitCompletedBox);
            if (parts.length > 0) {
                announce(parts.join(', '));
            }
        }
        return true;
    }, [announce]);

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
    }, []);

    const triggerFloatingReaction = useCallback((emoji) => {
        if (!ALLOWED_REACTIONS.has(emoji)) return;
        soundEffectsRef.current?.playSpectatorCheer();
        const id = ++reactionSeq.current;
        const left = 15 + Math.floor(Math.random() * 68);
        setFloatingReactions((prev) => [...prev, { id, emoji, left }]);
        setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
        }, 1850);
    }, []);

    const persistSnapshotIfNeeded = useCallback((
        nextGameState,
        nextRematch = stateRef.current.rematchRequestedBy,
        nextBoardBgId = stateRef.current.boardBackground?.id || null,
    ) => {
        const { onlineGameId: gId, mode: m, isSpectating: spec, currentMembers: members } = stateRef.current;
        const hasGuest = members.some((member) => member.role === 'guest');
        if (m === 'solo' && !spec) {
            saveSoloGameSnapshot(nextGameState, gId, nextBoardBgId);
        }
        if (gId && (m === 'online' || spec || hasGuest)) {
            saveOnlineGameSnapshot(gId, nextGameState, nextRematch, nextBoardBgId);
        }
    }, []);

    const syncLobbyProgress = useCallback((overrideState = null, overrideMode = null) => {
        const {
            isPlayingGame: playing,
            myRole: role,
            onlineGameId: gId,
            mode: curMode,
            currentMembers: members,
            gameState: curState,
            isSpectating: spec,
            joinPolicy: curJoinPolicy,
        } = stateRef.current;
        const targetState = overrideState || curState;
        const targetMode = overrideMode || curMode;
        if (!playing || role !== 'host' || !gId || spec || (targetMode !== 'solo' && targetMode !== 'online')) return;

        const guestOnline = members.some((m) => m.role === 'guest');
        const effectiveMode = guestOnline ? 'online' : targetMode;
        const resolvedVariant = targetState.variant || inferVariantFromBoardLength(targetState.board?.length);
        const specInfo = getVariantSpec(resolvedVariant);

        let status = 'in_progress';
        if (targetState.status === 'solved') {
            status = 'solved';
        }

        onlineClientRef.current?.broadcastLobbyUpdate(
            gId,
            status,
            targetState.filledCount,
            targetState.difficulty,
            effectiveMode,
            {
                variant: specInfo.id,
                totalCells: specInfo.totalCells,
                hasGuest: guestOnline,
                joinPolicy: curJoinPolicy,
            },
        );
    }, []);

    const joinActionsRef = useRef({
        approveJoin: () => {},
        rejectJoin: () => {},
    });

    const openWatchDirectory = useCallback(() => {
        setActiveLobbyRooms([]);
        onlineClientRef.current?.joinLobby({
            onLobbyPresenceChange: (rooms) => setActiveLobbyRooms(rooms || []),
            onLobbyMemberJoin: (room) => {
                setActiveLobbyRooms((prev) => {
                    if (prev.some((r) => r.game_id === room.game_id)) {
                        return prev.map((r) => (r.game_id === room.game_id ? room : r));
                    }
                    return [...prev, room];
                });
            },
            onLobbyMemberLeave: (room) => {
                setActiveLobbyRooms((prev) => prev.filter((r) => r.game_id !== room.game_id && r.id !== room.id));
            },
            onLobbyUpdate: (update) => {
                setActiveLobbyRooms((prev) => {
                    if (update.status === 'solved' || update.status === 'finished') {
                        return prev.filter((r) => r.game_id !== update.game_id);
                    }
                    const exists = prev.some((r) => r.game_id === update.game_id);
                    if (!exists) return [...prev, update];
                    return prev.map((r) => (r.game_id === update.game_id ? { ...r, ...update } : r));
                });
            },
        });
    }, []);

    const handleRespondJoinRequest = useCallback((accepted) => {
        const queue = stateRef.current.incomingJoinRequests;
        if (!queue || queue.length === 0) return;

        const [req, ...rest] = queue;
        setIncomingJoinRequests(rest);
        stateRef.current.incomingJoinRequests = rest;

        onlineClientRef.current?.broadcastGameEvent(req.gameId, 'join-response', {
            requestId: req.requestId,
            requesterId: req.requesterId,
            accepted: Boolean(accepted),
            reason: accepted ? undefined : 'declined',
        });
    }, []);

    useEffect(() => {
        const cur = stateRef.current;
        if (cur.myRole === 'host' && !cur.isSpectating && cur.isPlayingGame) {
            onlineClientRef.current?.updateGameJoinPolicy(joinPolicy);
            syncLobbyProgress();

            if (cur.incomingJoinRequests.length > 0 && (joinPolicy === 'disabled' || joinPolicy === 'auto')) {
                const queued = cur.incomingJoinRequests;
                setIncomingJoinRequests([]);
                stateRef.current.incomingJoinRequests = [];
                const accepted = joinPolicy === 'auto';
                for (const req of queued) {
                    onlineClientRef.current?.broadcastGameEvent(req.gameId, 'join-response', {
                        requestId: req.requestId,
                        requesterId: req.requesterId,
                        accepted,
                        reason: accepted ? undefined : 'disabled',
                    });
                }
            }
        }
    }, [joinPolicy, syncLobbyProgress]);

    const clearHintsForCell = useCallback((index) => {
        setHintsMap((prev) => {
            let changed = false;
            const next = new Map(prev);
            for (const [senderId, hint] of next.entries()) {
                if (hint.index === index) {
                    next.delete(senderId);
                    changed = true;
                }
            }
            return changed ? next : prev;
        });
    }, []);

    const handleRemoteGameEvent = useCallback((type, data) => {
        const cur = stateRef.current;

        const applySyncedVisuals = (payload, boardLen) => {
            if (payload.hostCursorIndex !== undefined) {
                const nextHostIdx = Number.isInteger(payload.hostCursorIndex) && payload.hostCursorIndex >= 0 && payload.hostCursorIndex < boardLen
                    ? payload.hostCursorIndex
                    : null;
                setHostCursorIndex(nextHostIdx);
            }
            if (cur.isSpectating && payload.hostActiveDigit !== undefined) {
                const nextDigit = Number.isInteger(payload.hostActiveDigit) && payload.hostActiveDigit >= 1
                    ? payload.hostActiveDigit
                    : null;
                setRemoteActiveDigit(nextDigit);
            }
            if (payload.hintPreview && Number.isInteger(payload.hintPreview.index)) {
                const delays = Array.isArray(payload.hintPreview.contextEntries)
                    ? new Map(payload.hintPreview.contextEntries)
                    : new Map([[payload.hintPreview.index, 0]]);
                triggerHintHighlight({ index: payload.hintPreview.index, contextDelays: delays }, 'preview');
            }
        };

        if (type === 'init' || type === 'sync') {
            if (!data || !data.gameState) return;
            const hydrated = hydrateGameState(data.gameState);
            if (!hydrated) return;

            setGameState(hydrated);
            stateRef.current.gameState = hydrated;
            setSelectedIndex((prev) => (prev !== null && prev < hydrated.board.length ? prev : null));

            let syncedBg = cur.boardBackground;
            if (typeof data.boardBackgroundId === 'string') {
                const resolvedBg = getBoardBackgroundById(data.boardBackgroundId);
                if (resolvedBg) {
                    syncedBg = resolvedBg;
                    setBoardBackground(resolvedBg);
                    stateRef.current.boardBackground = resolvedBg;
                }
            }

            if (data.rematchRequestedBy !== undefined) {
                setRematchRequestedBy(data.rematchRequestedBy);
            }
            if (Array.isArray(data.hints)) {
                const nextHints = new Map();
                data.hints.forEach(([senderId, hint]) => {
                    if (senderId && hint) nextHints.set(senderId, hint);
                });
                setHintsMap(nextHints);
            }
            applySyncedVisuals(data, hydrated.board.length);
            persistSnapshotIfNeeded(hydrated, data.rematchRequestedBy, syncedBg?.id || null);
            return;
        }

        if (type === 'join-policy') {
            if (data?.joinPolicy && cur.isSpectating) {
                setHostJoinPolicy(normalizeJoinPolicy(data.joinPolicy));
            }
            return;
        }

        if (type === 'join-request') {
            const myClientId = onlineClientRef.current?.clientId;
            if (
                cur.myRole !== 'host'
                || cur.isSpectating
                || !cur.isPlayingGame
                || !cur.onlineGameId
                || !data?.requestId
                || !data?.requesterId
                || data.requesterId === myClientId
            ) {
                return;
            }

            if (cur.gameState.status === 'solved') {
                onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'join-response', {
                    requestId: data.requestId,
                    requesterId: data.requesterId,
                    accepted: false,
                    reason: 'solved',
                });
                return;
            }

            if (cur.joinPolicy === 'disabled') {
                onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'join-response', {
                    requestId: data.requestId,
                    requesterId: data.requesterId,
                    accepted: false,
                    reason: 'disabled',
                });
                return;
            }

            if (cur.joinPolicy === 'auto') {
                onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'join-response', {
                    requestId: data.requestId,
                    requesterId: data.requesterId,
                    accepted: true,
                });
                return;
            }

            const nextReq = {
                requestId: data.requestId,
                requesterId: data.requesterId,
                gameId: cur.onlineGameId,
            };
            const alreadyQueued = cur.incomingJoinRequests.some(
                (r) => r.requestId === nextReq.requestId || r.requesterId === nextReq.requesterId,
            );
            if (!alreadyQueued) {
                const nextQueue = [...cur.incomingJoinRequests, nextReq];
                setIncomingJoinRequests(nextQueue);
                stateRef.current.incomingJoinRequests = nextQueue;
                announce(cur.messages?.joinRequestTitle || 'Player wants to join');
            }
            return;
        }

        if (type === 'join-cancel') {
            if (data?.requestId && cur.incomingJoinRequests.some((r) => r.requestId === data.requestId)) {
                const nextQueue = cur.incomingJoinRequests.filter((r) => r.requestId !== data.requestId);
                setIncomingJoinRequests(nextQueue);
                stateRef.current.incomingJoinRequests = nextQueue;
            }
            return;
        }

        if (type === 'join-response') {
            const myClientId = onlineClientRef.current?.clientId;
            const pending = cur.pendingJoinRequest;
            if (!pending || data?.requestId !== pending.requestId || data?.requesterId !== myClientId) {
                return;
            }

            if (pendingJoinTimerRef.current) {
                clearTimeout(pendingJoinTimerRef.current);
                pendingJoinTimerRef.current = null;
            }
            setPendingJoinRequest(null);
            stateRef.current.pendingJoinRequest = null;

            if (data.accepted) {
                joinActionsRef.current.approveJoin(pending);
            } else {
                joinActionsRef.current.rejectJoin(pending, data.reason || 'declined');
            }
            return;
        }

        if (type === 'cell-update') {
            const prevBoard = cur.gameState.board;
            const patched = applyRemoteCellPatch(cur.gameState, {
                ...data,
                owner: data?.owner || null,
            });
            setGameState(patched);
            stateRef.current.gameState = patched;

            if (typeof data.value === 'number') {
                clearPendingHint(false);
            }
            if (typeof data.value === 'number' && data.value > 0) {
                clearHintsForCell(data.index);
                const unitCompleted = triggerUnitCelebration(prevBoard, patched, data.index);
                if (prevBoard[data.index] !== data.value) {
                    playMoveSoundFeedback(patched, data.index, data.value, unitCompleted);
                }
            }
            if (patched.status === 'solved') {
                setSelectedIndex(null);
                setActiveDigit(null);
                stateRef.current.selectedIndex = null;
                stateRef.current.activeDigit = null;
            }
            persistSnapshotIfNeeded(patched);
            return;
        }

        if (type === 'cursor') {
            const myClientId = onlineClientRef.current?.clientId;
            if (!data || data.senderId === myClientId) return;
            if (data.role === 'host' || data.role === 'guest') {
                const totalCells = cur.gameState.board?.length || 81;
                const nextIdx = Number.isInteger(data.index) && data.index >= 0 && data.index < totalCells ? data.index : null;
                if (data.role === 'host') {
                    setHostCursorIndex(nextIdx);
                } else {
                    const senderKey = data.senderId || 'guest';
                    setGuestCursors((prev) => {
                        const next = new Map(prev);
                        if (nextIdx === null) {
                            next.delete(senderKey);
                        } else {
                            next.set(senderKey, nextIdx);
                        }
                        return next;
                    });
                }
            }
            return;
        }

        if (type === 'active-digit') {
            const myClientId = onlineClientRef.current?.clientId;
            if (!data || data.senderId === myClientId || !cur.isSpectating) return;
            const nextDigit = Number.isInteger(data.digit) && data.digit >= 1 ? data.digit : null;
            setRemoteActiveDigit(nextDigit);
            return;
        }

        if (type === 'hint-highlight') {
            const myClientId = onlineClientRef.current?.clientId;
            if (!data || data.senderId === myClientId) return;
            if (data.mode === 'clear') {
                if (hintHighlightTimerRef.current) {
                    clearTimeout(hintHighlightTimerRef.current);
                    hintHighlightTimerRef.current = null;
                }
                setHintHighlight((prev) => ({ id: prev.id, mode: 'solve', targetIndex: null, contextDelays: new Map() }));
                return;
            }
            if (Number.isInteger(data.index)) {
                const delays = Array.isArray(data.contextEntries)
                    ? new Map(data.contextEntries)
                    : new Map([[data.index, 0]]);
                triggerHintHighlight(
                    { index: data.index, contextDelays: delays },
                    data.mode === 'preview' ? 'preview' : 'solve',
                );
            }
            return;
        }

        if (type === 'hint') {
            if (data && data.senderId) {
                setHintsMap((prev) => {
                    const next = new Map(prev);
                    if (data.index === null || data.index === undefined) {
                        next.delete(data.senderId);
                    } else if (cur.gameState.board[data.index] === 0) {
                        next.set(data.senderId, {
                            senderId: data.senderId,
                            index: data.index,
                            value: data.value ?? null,
                        });
                    }
                    return next;
                });
            }
            return;
        }

        if (type === 'reaction') {
            if (data && data.emoji) {
                triggerFloatingReaction(data.emoji);
            }
            return;
        }

        if (type === 'new-puzzle-request') {
            if (data && (data.role === 'host' || data.role === 'guest')) {
                setRematchRequestedBy(data.role);
                persistSnapshotIfNeeded(cur.gameState, data.role);
                if (data.role !== cur.myRole) {
                    showFeedback('Partner requested a new puzzle. Click Accept New Puzzle to confirm.');
                }
            }
            return;
        }

        if (type === 'new-puzzle-cancel') {
            setRematchRequestedBy(null);
            persistSnapshotIfNeeded(cur.gameState, null);
            showFeedback('New puzzle request cancelled.');
            return;
        }

        if (type === 'new-puzzle-accept') {
            let nextState = cur.gameState;
            if (data && data.gameState) {
                const hydrated = hydrateGameState(data.gameState);
                if (hydrated) {
                    nextState = hydrated;
                    setGameState(hydrated);
                    stateRef.current.gameState = hydrated;
                }
            }
            const nextBg = (typeof data?.boardBackgroundId === 'string' && getBoardBackgroundById(data.boardBackgroundId))
                || selectBoardBackground({ previousId: cur.boardBackground?.id, seed: cur.onlineGameId });
            setBoardBackground(nextBg);
            stateRef.current.boardBackground = nextBg;
            clearUnitCelebration();
            setSelectedIndex(null);
            setActiveDigit(null);
            setHostCursorIndex(null);
            setGuestCursors(new Map());
            setRemoteActiveDigit(null);
            setRematchRequestedBy(null);
            setHintsMap(new Map());
            persistSnapshotIfNeeded(nextState, null, nextBg?.id || null);
            syncLobbyProgress(nextState);
            announce('New puzzle started.');
            return;
        }

        if (type === 'ping') {
            if (data && data.gameState) {
                const remoteFilled = data.gameState.board?.filter((c) => c > 0).length || 0;
                const localFilled = cur.gameState.filledCount || 0;
                const remoteInitial = data.gameState.givens?.filter(Boolean).length || 0;
                const localInitial = cur.gameState.givens?.filter(Boolean).length || 0;
                const variantDiffers = Array.isArray(data.gameState.board)
                    && (data.gameState.board.length !== cur.gameState.board.length || data.gameState.variant !== cur.gameState.variant);
                const boardsDiffer = Array.isArray(data.gameState.board)
                    && (variantDiffers || data.gameState.board.some((v, idx) => v !== cur.gameState.board[idx]));

                let syncedBg = cur.boardBackground;
                if (typeof data.boardBackgroundId === 'string' && data.boardBackgroundId !== cur.boardBackground?.id) {
                    const resolvedBg = getBoardBackgroundById(data.boardBackgroundId);
                    if (resolvedBg) {
                        syncedBg = resolvedBg;
                        setBoardBackground(resolvedBg);
                        stateRef.current.boardBackground = resolvedBg;
                    }
                }

                const givensDiffer = !Array.isArray(data.gameState.givens)
                    || data.gameState.givens.length !== cur.gameState.givens.length
                    || data.gameState.givens.some((g, idx) => Boolean(g) !== Boolean(cur.gameState.givens[idx]))
                    || (Array.isArray(data.gameState.board) && cur.gameState.givens.some((g, idx) => g && data.gameState.board[idx] !== cur.gameState.board[idx]));
                const shouldRecoverHost = cur.myRole === 'host'
                    && cur.mode === 'online'
                    && localFilled <= localInitial
                    && remoteFilled > localFilled
                    && !variantDiffers
                    && !givensDiffer;
                const shouldAdoptRemote = cur.myRole !== 'host' && (
                    boardsDiffer
                    || remoteFilled !== localFilled
                    || remoteInitial !== localInitial
                    || data.gameState.status !== cur.gameState.status
                    || data.rematchRequestedBy !== cur.rematchRequestedBy
                );

                if (shouldRecoverHost || shouldAdoptRemote) {
                    const hydrated = hydrateGameState(data.gameState);
                    if (hydrated) {
                        setGameState(hydrated);
                        stateRef.current.gameState = hydrated;
                        setSelectedIndex((prev) => (prev !== null && prev < hydrated.board.length ? prev : null));
                        persistSnapshotIfNeeded(hydrated, data.rematchRequestedBy, syncedBg?.id || null);
                    }
                    if (data.rematchRequestedBy !== undefined) {
                        setRematchRequestedBy(data.rematchRequestedBy);
                    }
                }
                if (cur.myRole !== 'host') {
                    applySyncedVisuals(data, cur.gameState.board?.length || 81);
                }
            }
        }
    }, [announce, clearHintsForCell, clearPendingHint, clearUnitCelebration, persistSnapshotIfNeeded, playMoveSoundFeedback, showFeedback, syncLobbyProgress, triggerFloatingReaction, triggerHintHighlight, triggerUnitCelebration]);

    const buildSyncPayload = useCallback(() => {
        const cur = stateRef.current;
        return {
            gameState: serializeGameState(cur.gameState),
            boardBackgroundId: cur.boardBackground?.id || null,
            rematchRequestedBy: cur.rematchRequestedBy,
            hints: Array.from(cur.hintsMap.entries()),
            hostCursorIndex: cur.myRole === 'host' ? cur.selectedIndex : undefined,
            hostActiveDigit: cur.myRole === 'host' ? cur.activeDigit : undefined,
            hintPreview: cur.pendingHint ? {
                mode: 'preview',
                index: cur.pendingHint.index,
                digit: cur.pendingHint.digit,
                technique: cur.pendingHint.technique,
                unitType: cur.pendingHint.unitType,
                unitIndex: cur.pendingHint.unitIndex,
                contextEntries: Array.from(cur.pendingHint.contextDelays.entries()),
            } : null,
        };
    }, []);

    const handleGamePresenceChange = useCallback((members) => {
        const resolved = onlineClientRef.current?.getGameMembers() || members || [];
        setCurrentMembers(resolved);
        stateRef.current.currentMembers = resolved;

        const cur = stateRef.current;
        if (cur.isSpectating) {
            const host = resolved.find((m) => m.role === 'host');
            if (host?.join_policy) {
                setHostJoinPolicy(normalizeJoinPolicy(host.join_policy));
            }
        }
        if (cur.myRole === 'host' && resolved.length > 1) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'sync', buildSyncPayload());
            syncLobbyProgress();
        }
    }, [buildSyncPayload, syncLobbyProgress]);

    const handleGameMemberJoin = useCallback((member) => {
        const prevMembers = stateRef.current.currentMembers;
        const authoritative = onlineClientRef.current?.getGameMembers();
        const nextMembers = authoritative || (prevMembers.some((m) => m.id === member.id) ? prevMembers : [...prevMembers, member]);
        setCurrentMembers(nextMembers);
        stateRef.current.currentMembers = nextMembers;

        const cur = stateRef.current;
        if (cur.isSpectating && member?.role === 'host' && member.join_policy) {
            setHostJoinPolicy(normalizeJoinPolicy(member.join_policy));
        }
        if (member?.role === 'guest' && cur.myRole === 'host') {
            if (member?.id && cur.incomingJoinRequests.some((r) => r.requesterId === member.id)) {
                const nextReqs = cur.incomingJoinRequests.filter((r) => r.requesterId !== member.id);
                setIncomingJoinRequests(nextReqs);
                stateRef.current.incomingJoinRequests = nextReqs;
            }
            showFeedback('A partner joined your game!');
        }
        if (cur.myRole === 'host') {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'sync', buildSyncPayload());
            syncLobbyProgress();
        }
    }, [buildSyncPayload, showFeedback, syncLobbyProgress]);

    const handleGameMemberLeave = useCallback((member) => {
        const authoritative = onlineClientRef.current?.getGameMembers();
        if (authoritative) {
            setCurrentMembers(authoritative);
            stateRef.current.currentMembers = authoritative;
        } else {
            setCurrentMembers((prev) => prev.filter((m) => m.id !== member.id));
        }

        if (member?.role === 'host') {
            setHostCursorIndex(null);
            setRemoteActiveDigit(null);
        } else if (member?.role === 'guest') {
            const senderKey = member.id || 'guest';
            setGuestCursors((prev) => {
                if (!prev.has(senderKey)) return prev;
                const next = new Map(prev);
                next.delete(senderKey);
                return next;
            });
        }

        const cur = stateRef.current;
        if (member?.id && cur.incomingJoinRequests.some((r) => r.requesterId === member.id)) {
            const nextReqs = cur.incomingJoinRequests.filter((r) => r.requesterId !== member.id);
            setIncomingJoinRequests(nextReqs);
            stateRef.current.incomingJoinRequests = nextReqs;
        }

        if (member?.id) {
            setHintsMap((prev) => {
                if (!prev.has(member.id)) return prev;
                const next = new Map(prev);
                next.delete(member.id);
                return next;
            });
        }

        if (cur.myRole === 'host') {
            syncLobbyProgress();
        }
    }, [syncLobbyProgress]);

    const enterSpectatorView = useCallback((gameId, announcementText = null) => {
        setNavTab('watch');
        setMode('watch');
        setIsSpectating(true);
        setSpectatedGameMode(null);
        setOnlineGameId(gameId);
        setMyRole('spectator');
        setSelectedIndex(null);

        stateRef.current.navTab = 'watch';
        stateRef.current.mode = 'watch';
        stateRef.current.isSpectating = true;
        stateRef.current.onlineGameId = gameId;
        stateRef.current.myRole = 'spectator';

        if (announcementText) announce(announcementText);
    }, [announce]);

    const spectateGame = useCallback((gameId) => {
        if (!isValidGameId(gameId)) return;

        if (pendingJoinTimerRef.current) {
            clearTimeout(pendingJoinTimerRef.current);
            pendingJoinTimerRef.current = null;
        }
        setPendingJoinRequest(null);
        stateRef.current.pendingJoinRequest = null;

        clearUnitCelebration();
        onlineClientRef.current?.leaveLobby();
        setCurrentMembers([]);
        setHintsMap(new Map());
        setRematchRequestedBy(null);
        const lobbyRoom = stateRef.current.activeLobbyRooms.find((r) => r.game_id === gameId);
        setHostJoinPolicy(normalizeJoinPolicy(lobbyRoom?.join_policy));

        const snapshot = loadOnlineGameSnapshot(gameId);
        if (snapshot?.gameState) {
            setGameState(snapshot.gameState);
            stateRef.current.gameState = snapshot.gameState;
        }
        const nextBg = getBoardBackgroundById(snapshot?.boardBackgroundId) || selectBoardBackground({ seed: gameId });
        setBoardBackground(nextBg);
        stateRef.current.boardBackground = nextBg;

        enterSpectatorView(gameId, 'Connecting to live Sudoku match...');
        updateBrowserUrl(`/games/${gameId}?watch=1`);

        onlineClientRef.current?.joinGameChannel(gameId, {
            role: 'spectator',
            onEvent: handleRemoteGameEvent,
            onPresenceChange: (members) => {
                const host = members?.find((m) => m.role === 'host');
                if (host?.game_mode) {
                    setSpectatedGameMode(host.game_mode);
                }
                if (host?.join_policy) {
                    setHostJoinPolicy(normalizeJoinPolicy(host.join_policy));
                }
                handleGamePresenceChange(members);
            },
            onMemberJoin: handleGameMemberJoin,
            onMemberLeave: handleGameMemberLeave,
        });
    }, [clearUnitCelebration, enterSpectatorView, handleGameMemberJoin, handleGameMemberLeave, handleGamePresenceChange, handleRemoteGameEvent]);

    const joinAsOnlinePlayer = useCallback((gameId, role, initialGameState = null) => {
        setNavTab('play');
        setIsPlayingGame(true);
        setMode('online');
        setMyRole(role);
        setIsSpectating(false);
        setOnlineGameId(gameId);

        stateRef.current.navTab = 'play';
        stateRef.current.isPlayingGame = true;
        stateRef.current.mode = 'online';
        stateRef.current.myRole = role;
        stateRef.current.isSpectating = false;
        stateRef.current.onlineGameId = gameId;

        const targetState = initialGameState || stateRef.current.gameState;
        const resolvedVariant = targetState.variant || inferVariantFromBoardLength(targetState.board?.length);
        const specInfo = getVariantSpec(resolvedVariant);

        onlineClientRef.current?.joinGameChannel(gameId, {
            role,
            gameMode: 'online',
            joinPolicy: stateRef.current.joinPolicy,
            onEvent: handleRemoteGameEvent,
            onPresenceChange: handleGamePresenceChange,
            onMemberJoin: handleGameMemberJoin,
            onMemberLeave: handleGameMemberLeave,
        });

        if (role === 'host') {
            onlineClientRef.current?.joinLobby({
                gameId,
                status: targetState.status === 'solved' ? 'solved' : 'in_progress',
                gameMode: 'online',
                difficulty: targetState.difficulty,
                variant: specInfo.id,
                totalCells: specInfo.totalCells,
                hasGuest: false,
                filledCount: targetState.filledCount,
                joinPolicy: stateRef.current.joinPolicy,
            });
        }
    }, [handleGameMemberJoin, handleGameMemberLeave, handleGamePresenceChange, handleRemoteGameEvent]);

    const completeApprovedJoin = useCallback((gameId, initialGameState = null) => {
        clearUnitCelebration();
        onlineClientRef.current?.leaveLobby();
        setSelectedIndex(null);
        setActiveDigit(null);
        setHostCursorIndex(null);
        setGuestCursors(new Map());
        setRemoteActiveDigit(null);
        setNotesMode(false);
        setHintsMap(new Map());
        setRematchRequestedBy(null);

        if (initialGameState) {
            setGameState(initialGameState);
            stateRef.current.gameState = initialGameState;
        }

        saveParticipantSession(gameId, 'guest');
        updateBrowserUrl(`/games/${gameId}`);
        setNavTab('play');
        setIsPlayingGame(true);
        stateRef.current.navTab = 'play';
        stateRef.current.isPlayingGame = true;
        joinAsOnlinePlayer(gameId, 'guest', initialGameState);
        showFeedback(stateRef.current.messages?.joinApprovedFeedback || 'Joined live match as co-op partner!');
    }, [clearUnitCelebration, joinAsOnlinePlayer, showFeedback]);

    joinActionsRef.current.approveJoin = (pending) => {
        completeApprovedJoin(pending.gameId, pending.gameStateSnapshot);
    };
    joinActionsRef.current.rejectJoin = (pending, reason) => {
        if (!pending.fromSpectating) {
            onlineClientRef.current?.leaveGameChannel();
            openWatchDirectory();
        }
        const m = stateRef.current.messages;
        if (reason === 'disabled') {
            showFeedback(m?.joinDisabledFeedback || 'The host does not allow joins right now.');
        } else if (reason === 'solved') {
            showFeedback('Puzzle is already solved.');
        } else {
            showFeedback(m?.joinDeclinedFeedback || 'Host declined your join request.');
        }
    };

    const cancelPendingJoinRequest = useCallback(() => {
        if (pendingJoinTimerRef.current) {
            clearTimeout(pendingJoinTimerRef.current);
            pendingJoinTimerRef.current = null;
        }
        const pending = stateRef.current.pendingJoinRequest;
        if (!pending) return;

        setPendingJoinRequest(null);
        stateRef.current.pendingJoinRequest = null;

        onlineClientRef.current?.broadcastGameEvent(pending.gameId, 'join-cancel', {
            requestId: pending.requestId,
            requesterId: onlineClientRef.current?.clientId,
        });

        if (!pending.fromSpectating) {
            onlineClientRef.current?.leaveGameChannel();
            openWatchDirectory();
        }
    }, [openWatchDirectory]);

    const joinWatchGame = useCallback((gameId, knownJoinPolicy = null) => {
        if (!isValidGameId(gameId)) return;

        const cur = stateRef.current;
        const fromSpectatingSameRoom = cur.isSpectating && cur.onlineGameId === gameId;
        const lobbyRoom = cur.activeLobbyRooms.find((r) => r.game_id === gameId);
        const effectivePolicy = fromSpectatingSameRoom
            ? hostJoinPolicy
            : normalizeJoinPolicy(knownJoinPolicy || lobbyRoom?.join_policy);

        if (effectivePolicy === 'disabled') {
            showFeedback(cur.messages?.joinDisabledFeedback || 'The host does not allow joins right now.');
            return;
        }

        const snapshot = !fromSpectatingSameRoom ? loadOnlineGameSnapshot(gameId) : null;
        if (snapshot?.rematchRequestedBy !== undefined) {
            setRematchRequestedBy(snapshot.rematchRequestedBy);
        }
        const initialSnapshot = fromSpectatingSameRoom ? cur.gameState : snapshot?.gameState;

        if (effectivePolicy === 'auto') {
            completeApprovedJoin(gameId, initialSnapshot);
            return;
        }

        if (cur.pendingJoinRequest) return;

        const requestId = generateEventId();
        const req = {
            gameId,
            requestId,
            fromSpectating: fromSpectatingSameRoom,
            gameStateSnapshot: initialSnapshot,
        };
        setPendingJoinRequest(req);
        stateRef.current.pendingJoinRequest = req;

        if (pendingJoinTimerRef.current) {
            clearTimeout(pendingJoinTimerRef.current);
        }
        pendingJoinTimerRef.current = setTimeout(() => {
            pendingJoinTimerRef.current = null;
            const activeReq = stateRef.current.pendingJoinRequest;
            if (!activeReq || activeReq.requestId !== requestId) return;
            setPendingJoinRequest(null);
            stateRef.current.pendingJoinRequest = null;
            onlineClientRef.current?.broadcastGameEvent(activeReq.gameId, 'join-cancel', {
                requestId: activeReq.requestId,
                requesterId: onlineClientRef.current?.clientId,
            });
            if (!activeReq.fromSpectating) {
                onlineClientRef.current?.leaveGameChannel();
                openWatchDirectory();
            }
            showFeedback(stateRef.current.messages?.joinTimeoutFeedback || 'No response from the host. Try again later.');
        }, 30000);

        const sendJoinRequest = () => {
            onlineClientRef.current?.broadcastGameEvent(gameId, 'join-request', {
                requestId,
                requesterId: onlineClientRef.current?.clientId,
            });
        };

        showFeedback(cur.messages?.joinPendingLabel || 'Waiting for host approval...');

        if (fromSpectatingSameRoom && onlineClientRef.current?.currentGameId === gameId && onlineClientRef.current?.gameChannel) {
            sendJoinRequest();
        } else {
            onlineClientRef.current?.leaveLobby();
            onlineClientRef.current?.joinGameChannel(gameId, {
                role: 'spectator',
                gameMode: 'online',
                joinPolicy: cur.joinPolicy,
                onEvent: handleRemoteGameEvent,
                onPresenceChange: handleGamePresenceChange,
                onMemberJoin: handleGameMemberJoin,
                onMemberLeave: handleGameMemberLeave,
                onSubscribed: sendJoinRequest,
            });
        }
    }, [completeApprovedJoin, handleGameMemberJoin, handleGameMemberLeave, handleGamePresenceChange, handleRemoteGameEvent, hostJoinPolicy, openWatchDirectory, showFeedback]);

    const ensureHostOnlineSession = useCallback((targetState, roomId, targetMode = stateRef.current.mode) => {
        if (!targetState || !roomId || !onlineClientRef.current) return;
        const resolvedMode = targetMode === 'online' ? 'online' : 'solo';
        const resolvedVar = normalizeVariant(targetState.variant || inferVariantFromBoardLength(targetState.board?.length));
        const specInfo = getVariantSpec(resolvedVar);
        const client = onlineClientRef.current;
        const guestOnline = stateRef.current.currentMembers.some((m) => m.role === 'guest');

        if (client.currentGameId !== roomId || !client.gameChannel) {
            client.joinGameChannel(roomId, {
                role: 'host',
                gameMode: resolvedMode,
                joinPolicy: stateRef.current.joinPolicy,
                onEvent: handleRemoteGameEvent,
                onPresenceChange: handleGamePresenceChange,
                onMemberJoin: handleGameMemberJoin,
                onMemberLeave: handleGameMemberLeave,
            });
        }

        if (!client.lobbyChannel || client.hostedLobbyMeta?.game_id !== roomId) {
            client.joinLobby({
                gameId: roomId,
                status: targetState.status === 'solved' ? 'solved' : 'in_progress',
                gameMode: guestOnline ? 'online' : resolvedMode,
                difficulty: targetState.difficulty,
                variant: specInfo.id,
                totalCells: specInfo.totalCells,
                hasGuest: guestOnline,
                filledCount: targetState.filledCount,
                joinPolicy: stateRef.current.joinPolicy,
            });
        } else {
            syncLobbyProgress(targetState, resolvedMode);
        }
    }, [handleGameMemberJoin, handleGameMemberLeave, handleGamePresenceChange, handleRemoteGameEvent, syncLobbyProgress]);

    const startNewSoloGame = useCallback((
        overrideDifficulty = null,
        overrideVariant = null,
        { restoreSaved = false, startSession = true } = {},
    ) => {
        clearUnitCelebration();
        const saved = restoreSaved ? loadSoloGameSnapshot() : null;
        const isRestoringSaved = Boolean(saved && saved.gameState.status !== 'solved');
        const diff = isRestoringSaved
            ? saved.gameState.difficulty
            : (overrideDifficulty || stateRef.current.difficulty);
        const varId = isRestoringSaved
            ? normalizeVariant(saved.gameState.variant || inferVariantFromBoardLength(saved.gameState.board?.length))
            : normalizeVariant(overrideVariant || stateRef.current.variant);

        const client = onlineClientRef.current;
        const hasRemoteMembers = Boolean(
            client
            && stateRef.current.onlineGameId
            && client.currentGameId === stateRef.current.onlineGameId
            && client.gameChannel
            && stateRef.current.currentMembers.some((m) => m.id && m.id !== client.clientId),
        );
        const keepActiveRoom = !isRestoringSaved && startSession && hasRemoteMembers;
        const roomId = isRestoringSaved
            ? (saved.roomId || generateGameId())
            : (keepActiveRoom ? stateRef.current.onlineGameId : generateGameId());

        const nextState = isRestoringSaved
            ? saved.gameState
            : createSudokuGame({ difficulty: diff, variant: varId });
        const nextBg = isRestoringSaved
            ? (getBoardBackgroundById(saved?.boardBackgroundId) || stateRef.current.boardBackground || selectBoardBackground({ seed: roomId }))
            : selectBoardBackground({ previousId: stateRef.current.boardBackground?.id });

        if (isRestoringSaved) {
            setDifficulty(nextState.difficulty);
            localStorage.setItem('sudoku_difficulty', nextState.difficulty);
            const restoredVar = normalizeVariant(nextState.variant || inferVariantFromBoardLength(nextState.board?.length));
            setVariant(restoredVar);
            localStorage.setItem('sudoku_variant', restoredVar);
        }

        const resolvedVar = normalizeVariant(nextState.variant || inferVariantFromBoardLength(nextState.board?.length));
        const specInfo = getVariantSpec(resolvedVar);

        setMode('solo');
        setIsSpectating(false);
        setOnlineGameId(roomId);
        setMyRole('host');
        setSelectedIndex(null);
        setActiveDigit(null);
        setHostCursorIndex(null);
        setGuestCursors(new Map());
        setRemoteActiveDigit(null);
        setNotesMode(false);
        setHintsMap(new Map());
        setRematchRequestedBy(null);
        setIncomingJoinRequests([]);
        stateRef.current.incomingJoinRequests = [];
        setGameState(nextState);
        setBoardBackground(nextBg);
        if (!keepActiveRoom) {
            setCurrentMembers([]);
            stateRef.current.currentMembers = [];
        }

        stateRef.current.mode = 'solo';
        stateRef.current.isSpectating = false;
        stateRef.current.onlineGameId = roomId;
        stateRef.current.myRole = 'host';
        stateRef.current.gameState = nextState;
        stateRef.current.boardBackground = nextBg;

        if (startSession || isRestoringSaved) {
            saveSoloGameSnapshot(nextState, roomId, nextBg?.id || null);
        }

        if (startSession) {
            const client = onlineClientRef.current;
            const isExistingChannel = Boolean(client && client.currentGameId === roomId && client.gameChannel);
            if (isExistingChannel) {
                client.broadcastGameEvent(roomId, 'new-puzzle-accept', {
                    gameState: serializeGameState(nextState),
                    boardBackgroundId: nextBg?.id || null,
                });
            }
            ensureHostOnlineSession(nextState, roomId, 'solo');
        }

        announce(isRestoringSaved
            ? `Resumed ${specInfo.shortLabel} ${nextState.difficulty} Solo puzzle.`
            : `New ${specInfo.shortLabel} ${diff} Sudoku puzzle ready.`);
    }, [announce, clearUnitCelebration, ensureHostOnlineSession]);

    const resumeOnlineGame = useCallback((gameId) => {
        let initialState = stateRef.current.gameState;
        const snapshot = loadOnlineGameSnapshot(gameId);
        if (snapshot) {
            initialState = snapshot.gameState;
            setGameState(snapshot.gameState);
            setRematchRequestedBy(snapshot.rematchRequestedBy);
            stateRef.current.gameState = snapshot.gameState;
            stateRef.current.rematchRequestedBy = snapshot.rematchRequestedBy;
        }
        const nextBg = getBoardBackgroundById(snapshot?.boardBackgroundId) || selectBoardBackground({ seed: gameId });
        setBoardBackground(nextBg);
        stateRef.current.boardBackground = nextBg;

        const stored = loadParticipantSession(gameId);
        if (stored) {
            joinAsOnlinePlayer(gameId, stored.role, initialState);
            return;
        }

        setMyRole('spectator');
        stateRef.current.myRole = 'spectator';

        onlineClientRef.current?.joinGameChannel(gameId, {
            role: 'spectator',
            onEvent: handleRemoteGameEvent,
            onPresenceChange: (members) => {
                const resolved = onlineClientRef.current?.getGameMembers() || members || [];
                setCurrentMembers(resolved);
                stateRef.current.currentMembers = resolved;

                const host = resolved.find((m) => m.role === 'host');
                const resolvedPolicy = normalizeJoinPolicy(host?.join_policy);
                setHostJoinPolicy(resolvedPolicy);

                if (resolvedPolicy === 'auto' && stateRef.current.gameState?.status !== 'solved') {
                    saveParticipantSession(gameId, 'guest');
                    joinAsOnlinePlayer(gameId, 'guest', stateRef.current.gameState);
                } else {
                    enterSpectatorView(gameId, 'Joined live match as spectator. Tap Join Game to request co-op.');
                    replaceBrowserUrl(`/games/${gameId}?watch=1`);
                }
            },
            onMemberJoin: handleGameMemberJoin,
            onMemberLeave: handleGameMemberLeave,
        });
    }, [enterSpectatorView, handleGameMemberJoin, handleGameMemberLeave, handleRemoteGameEvent, joinAsOnlinePlayer]);

    // Boot OnlineGameClient once
    useEffect(() => {
        const client = new OnlineGameClient({
            onConnectionChange: (status) => setConnectionStatus(status),
        });
        onlineClientRef.current = client;

        if (initialRoute.initialWatch && initialRoute.initialGameId) {
            spectateGame(initialRoute.initialGameId);
        } else if (initialRoute.initialMode === 'online' && initialRoute.initialGameId) {
            resumeOnlineGame(initialRoute.initialGameId);
        } else if (initialRoute.initialMode === 'watch') {
            openWatchDirectory();
        } else {
            startNewSoloGame(null, null, { restoreSaved: true, startSession: false });
        }

        const cleanup = () => client.disconnect();
        window.addEventListener('beforeunload', cleanup);
        window.addEventListener('pagehide', cleanup);

        return () => {
            window.removeEventListener('beforeunload', cleanup);
            window.removeEventListener('pagehide', cleanup);
            cleanup();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 1-second puzzle clock & periodic solo persistence
    useEffect(() => {
        const timer = setInterval(() => {
            if (navTab !== 'play' || !isPlayingGame || (typeof document !== 'undefined' && document.hidden)) {
                return;
            }
            if (stateRef.current.isHelpOpen || stateRef.current.pendingConfirm) {
                return;
            }
            setGameState((prev) => {
                if (stateRef.current.isSpectating || stateRef.current.mode === 'watch' || prev.status === 'solved') {
                    return prev;
                }
                const next = { ...prev, elapsedSeconds: (prev.elapsedSeconds || 0) + 1 };
                stateRef.current.gameState = next;
                if (stateRef.current.mode === 'solo' && next.elapsedSeconds % 5 === 0) {
                    saveSoloGameSnapshot(next, stateRef.current.onlineGameId, stateRef.current.boardBackground?.id || null);
                }
                return next;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [isPlayingGame, navTab]);

    // 5-second state reconciliation & lobby heartbeat
    useEffect(() => {
        const timer = setInterval(() => {
            const cur = stateRef.current;
            const isBroadcaster = cur.isPlayingGame && (cur.mode === 'solo' || cur.mode === 'online') && Boolean(cur.onlineGameId) && !cur.isSpectating;
            if (!isBroadcaster) return;

            onlineClientRef.current?.sendGamePing({
                role: cur.myRole,
                gameState: serializeGameState(cur.gameState),
                boardBackgroundId: cur.boardBackground?.id || null,
                rematchRequestedBy: cur.rematchRequestedBy,
                hostCursorIndex: cur.myRole === 'host' ? cur.selectedIndex : undefined,
                hostActiveDigit: cur.myRole === 'host' ? cur.activeDigit : undefined,
                hintPreview: cur.myRole === 'host' && cur.pendingHint ? {
                    mode: 'preview',
                    index: cur.pendingHint.index,
                    digit: cur.pendingHint.digit,
                    technique: cur.pendingHint.technique,
                    unitType: cur.pendingHint.unitType,
                    unitIndex: cur.pendingHint.unitIndex,
                    contextEntries: Array.from(cur.pendingHint.contextDelays.entries()),
                } : null,
                timestamp: Date.now(),
            });

            syncLobbyProgress();
        }, GAME_PING_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [syncLobbyProgress]);

    // Escape key handling and focus management for confirmation dialog
    useEffect(() => {
        if (!pendingConfirm) return undefined;
        confirmCancelRef.current?.focus();

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                setPendingConfirm(null);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [pendingConfirm]);

    const broadcastCursor = useCallback((idx) => {
        const cur = stateRef.current;
        if (!cur.isSpectating && (cur.myRole === 'host' || cur.myRole === 'guest') && cur.onlineGameId) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cursor', {
                senderId: onlineClientRef.current?.clientId,
                role: cur.myRole,
                index: idx,
            });
        }
    }, []);

    const broadcastActiveDigit = useCallback((digit) => {
        const cur = stateRef.current;
        if (!cur.isSpectating && (cur.myRole === 'host' || cur.myRole === 'guest') && cur.onlineGameId) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'active-digit', {
                senderId: onlineClientRef.current?.clientId,
                role: cur.myRole,
                digit: digit ?? null,
            });
        }
    }, []);

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
    }, []);

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

        const isBroadcaster = (cur.mode === 'solo' || cur.mode === 'online') && Boolean(cur.onlineGameId) && !cur.isSpectating;
        const owner = (cur.myRole === 'host' || cur.myRole === 'guest') ? cur.myRole : null;

        try {
            if (notesMode && digit !== 0) {
                const nextState = toggleCellNote(cur.gameState, targetIndex, digit);
                setGameState(nextState);
                stateRef.current.gameState = nextState;
                if (isBroadcaster) {
                    onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cell-update', {
                        index: targetIndex,
                        value: null,
                        notes: nextState.notes[targetIndex],
                    });
                }
                persistSnapshotIfNeeded(nextState);
            } else {
                const prevGameState = cur.gameState;
                const prevBoard = prevGameState.board;
                const nextState = setCellValue(prevGameState, targetIndex, digit, { owner });
                setGameState(nextState);
                stateRef.current.gameState = nextState;
                if (nextState !== prevGameState) {
                    clearPendingHint();
                }
                if (digit !== 0) {
                    clearHintsForCell(targetIndex);
                    const unitCompleted = triggerUnitCelebration(prevBoard, nextState, targetIndex);
                    if (nextState !== prevGameState) {
                        playMoveSoundFeedback(nextState, targetIndex, digit, unitCompleted);
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
                if (isBroadcaster) {
                    onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cell-update', {
                        index: targetIndex,
                        value: digit,
                        notes: nextState.notes[targetIndex],
                        owner,
                    });
                    syncLobbyProgress(nextState);
                }
                persistSnapshotIfNeeded(nextState);
            }
        } catch (err) {
            showFeedback(err.message);
        }
    }, [broadcastActiveDigit, clearHintsForCell, clearPendingHint, notesMode, persistSnapshotIfNeeded, playMoveSoundFeedback, showFeedback, syncLobbyProgress, triggerUnitCelebration]);

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
    }, [broadcastActiveDigit, broadcastCursor, selectedIndex, showFeedback, writeDigitToCell]);

    const focusCell = useCallback((idx) => {
        setSelectedIndex(idx);
        broadcastCursor(idx);
    }, [broadcastCursor]);

    const handleCellSelect = useCallback((idx) => {
        setSelectedIndex(idx);
        broadcastCursor(idx);

        const cur = stateRef.current;
        if (!cur.isSpectating && cur.mode !== 'watch' && cur.gameState.status !== 'solved' && cur.activeDigit !== null) {
            if (cur.gameState.board[idx] === 0) {
                writeDigitToCell(idx, cur.activeDigit);
            } else {
                // Selecting an already-filled cell exits digit-lock so all matching digits highlight cleanly
                setActiveDigit(null);
                broadcastActiveDigit(null);
            }
        }
    }, [broadcastActiveDigit, broadcastCursor, writeDigitToCell]);

    const broadcastNoteChanges = useCallback((prevNotes, nextState) => {
        const cur = stateRef.current;
        const isBroadcaster = (cur.mode === 'solo' || cur.mode === 'online') && Boolean(cur.onlineGameId) && !cur.isSpectating;
        if (!isBroadcaster) return;
        const totalCells = nextState.board.length;
        for (let i = 0; i < totalCells; i++) {
            if (prevNotes[i].join(',') !== nextState.notes[i].join(',')) {
                onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cell-update', {
                    index: i,
                    value: nextState.board[i] === 0 ? null : nextState.board[i],
                    notes: nextState.notes[i],
                });
            }
        }
    }, []);

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
    }, [broadcastNoteChanges, persistSnapshotIfNeeded, showFeedback]);

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
    }, [broadcastNoteChanges, persistSnapshotIfNeeded, showFeedback]);

    const handleUndo = useCallback(() => {
        const cur = stateRef.current;
        if (cur.isSpectating || cur.mode === 'watch' || !cur.gameState.history?.length) return;

        const prevBoard = [...cur.gameState.board];
        const prevNotes = cur.gameState.notes.map((n) => [...n]);
        const nextState = undoLastMove(cur.gameState);
        setGameState(nextState);
        stateRef.current.gameState = nextState;
        clearPendingHint();

        const isBroadcaster = (cur.mode === 'solo' || cur.mode === 'online') && Boolean(cur.onlineGameId) && !cur.isSpectating;
        if (isBroadcaster) {
            const totalCells = nextState.board.length;
            for (let i = 0; i < totalCells; i++) {
                const boardChanged = prevBoard[i] !== nextState.board[i];
                const notesChanged = prevNotes[i].join(',') !== nextState.notes[i].join(',');
                if (boardChanged || notesChanged) {
                    onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cell-update', {
                        index: i,
                        value: nextState.board[i],
                        notes: nextState.notes[i],
                        owner: nextState.cellOwners?.[i] || null,
                    });
                }
            }
            syncLobbyProgress(nextState);
        }

        persistSnapshotIfNeeded(nextState);
    }, [clearPendingHint, persistSnapshotIfNeeded, syncLobbyProgress]);

    const handleLocalHint = useCallback(() => {
        const cur = stateRef.current;
        if (cur.isSpectating || cur.mode === 'watch' || cur.gameState.status === 'solved') return;

        const totalCells = cur.gameState.board.length;
        const activeVariant = cur.gameState.variant || inferVariantFromBoardLength(totalCells);
        const m = cur.messages;

        const formatHintMessage = (hint, isPreview) => {
            const { row, col } = getCellCoords(hint.index, activeVariant);
            const unitLabel = hint.unitType === 'box'
                ? (m?.hintUnitBox || 'box')
                : (hint.unitType === 'row'
                    ? (m?.hintUnitRow || 'row')
                    : (m?.hintUnitCol || 'column'));

            let template;
            if (isPreview) {
                template = m?.hintPreviewFallback || 'Hint: Check R{row} C{col}. Tap Hint again to fill.';
                if (hint.technique === 'full_house') {
                    template = m?.hintPreviewFullHouse || 'Hint: Check R{row} C{col} (last empty cell in {unit}). Tap Hint again to fill.';
                } else if (hint.technique === 'hidden_single') {
                    template = m?.hintPreviewHiddenSingle || 'Hint: Check R{row} C{col} (only spot for one digit in {unit}). Tap Hint again to fill.';
                } else if (hint.technique === 'naked_single') {
                    template = m?.hintPreviewNakedSingle || 'Hint: Check R{row} C{col} (only one candidate left here). Tap Hint again to fill.';
                }
            } else {
                template = m?.hintReasonFallback || 'Hint: R{row} C{col} = {digit}.';
                if (hint.technique === 'full_house') {
                    template = m?.hintReasonFullHouse || 'Hint: R{row} C{col} = {digit} (last empty cell in {unit}).';
                } else if (hint.technique === 'hidden_single') {
                    template = m?.hintReasonHiddenSingle || 'Hint: R{row} C{col} = {digit} (only spot for {digit} in {unit}).';
                } else if (hint.technique === 'naked_single') {
                    template = m?.hintReasonNakedSingle || 'Hint: R{row} C{col} = {digit} (only possible candidate for this cell).';
                }
            }

            return template
                .replaceAll('{row}', String(row + 1))
                .replaceAll('{col}', String(col + 1))
                .replaceAll('{digit}', String(hint.digit))
                .replaceAll('{unit}', unitLabel);
        };

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
            showFeedback(formatHintMessage(hint, true));
            return;
        }

        const hint = activePending;
        const targetIdx = hint.index;
        const correctDigit = hint.digit;

        setPendingHint(null);
        stateRef.current.pendingHint = null;

        const owner = (cur.myRole === 'host' || cur.myRole === 'guest') ? cur.myRole : null;
        const prevBoard = cur.gameState.board;
        setSelectedIndex(targetIdx);
        broadcastCursor(targetIdx);
        const nextState = setCellValue(cur.gameState, targetIdx, correctDigit, { owner });
        setGameState(nextState);
        stateRef.current.gameState = nextState;
        clearHintsForCell(targetIdx);
        triggerHintHighlight(hint, 'solve');
        broadcastHintHighlight(hint, 'solve');
        const unitCompleted = triggerUnitCelebration(prevBoard, nextState, targetIdx);
        playMoveSoundFeedback(nextState, targetIdx, correctDigit, unitCompleted);
        if (nextState.status === 'solved') {
            setSelectedIndex(null);
            setActiveDigit(null);
            stateRef.current.selectedIndex = null;
            stateRef.current.activeDigit = null;
        }

        const isBroadcaster = (cur.mode === 'solo' || cur.mode === 'online') && Boolean(cur.onlineGameId) && !cur.isSpectating;
        if (isBroadcaster) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cell-update', {
                index: targetIdx,
                value: correctDigit,
                notes: [],
                owner,
            });
            syncLobbyProgress(nextState);
        }

        showFeedback(formatHintMessage(hint, false));
        persistSnapshotIfNeeded(nextState);
    }, [broadcastCursor, broadcastHintHighlight, clearHintsForCell, persistSnapshotIfNeeded, playMoveSoundFeedback, selectedIndex, showFeedback, syncLobbyProgress, triggerHintHighlight, triggerUnitCelebration]);

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
    }, [announce, selectedIndex, showFeedback]);

    const executeSwitchMode = useCallback((newMode) => {
        clearUnitCelebration();
        if (pendingJoinTimerRef.current) {
            clearTimeout(pendingJoinTimerRef.current);
            pendingJoinTimerRef.current = null;
        }
        const pending = stateRef.current.pendingJoinRequest;
        if (pending) {
            onlineClientRef.current?.broadcastGameEvent(pending.gameId, 'join-cancel', {
                requestId: pending.requestId,
                requesterId: onlineClientRef.current?.clientId,
            });
            setPendingJoinRequest(null);
            stateRef.current.pendingJoinRequest = null;
        }
        if (stateRef.current.incomingJoinRequests.length > 0) {
            const pendingReqs = stateRef.current.incomingJoinRequests;
            setIncomingJoinRequests([]);
            stateRef.current.incomingJoinRequests = [];
            for (const incoming of pendingReqs) {
                onlineClientRef.current?.broadcastGameEvent(incoming.gameId, 'join-response', {
                    requestId: incoming.requestId,
                    requesterId: incoming.requesterId,
                    accepted: false,
                    reason: 'declined',
                });
            }
        }
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
    }, [clearUnitCelebration, openWatchDirectory, startNewSoloGame]);

    const switchMode = useCallback((newMode) => {
        const cur = stateRef.current;
        if (cur.mode === newMode && !cur.isSpectating) {
            setNavTab(newMode === 'watch' ? 'watch' : 'play');
            return;
        }

        const hasPartner = cur.currentMembers.some(
            (m) => m.role !== cur.myRole && (m.role === 'host' || m.role === 'guest'),
        );
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
    }, [executeSwitchMode]);

    const openLegalPage = useCallback((page) => {
        if (isNativeApp) return;
        setLegalPage(page);
        updateBrowserUrl(page === 'privacy' ? '/privacy' : '/impressum');
    }, [isNativeApp]);

    const closeLegalPage = useCallback(() => {
        setLegalPage(null);
        updateBrowserUrl('/');
    }, []);

    useEffect(() => {
        if (isNativeApp || typeof window === 'undefined') return undefined;
        const onPopState = () => {
            const path = window.location.pathname.replace(/\/+$/, '') || '/';
            if (path === '/privacy') {
                setLegalPage('privacy');
            } else if (path === '/impressum') {
                setLegalPage('impressum');
            } else {
                setLegalPage(null);
            }
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, [isNativeApp]);

    const handleSelectNavTab = useCallback((targetTab) => {
        setLegalPage(null);
        if (!isNativeApp && typeof window !== 'undefined') {
            const path = window.location.pathname.replace(/\/+$/, '') || '/';
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
    }, [isNativeApp, switchMode]);

    const exitSpectating = useCallback(() => {
        if (pendingJoinTimerRef.current) {
            clearTimeout(pendingJoinTimerRef.current);
            pendingJoinTimerRef.current = null;
        }
        const pending = stateRef.current.pendingJoinRequest;
        if (pending) {
            onlineClientRef.current?.broadcastGameEvent(pending.gameId, 'join-cancel', {
                requestId: pending.requestId,
                requesterId: onlineClientRef.current?.clientId,
            });
            setPendingJoinRequest(null);
            stateRef.current.pendingJoinRequest = null;
        }
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
    }, [openWatchDirectory]);

    const handleCancelRematch = useCallback(() => {
        const cur = stateRef.current;
        if (!cur.onlineGameId) return;
        setRematchRequestedBy(null);
        persistSnapshotIfNeeded(cur.gameState, null);
        onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'new-puzzle-cancel', { role: cur.myRole });
        showFeedback('New puzzle request cancelled.');
    }, [persistSnapshotIfNeeded, showFeedback]);

    const startNewPuzzleConfirmed = useCallback(() => {
        const cur = stateRef.current;
        const partnerOnline = cur.currentMembers.some(
            (m) => m.role !== cur.myRole && (m.role === 'host' || m.role === 'guest'),
        );
        const isCoopSession = cur.mode === 'online' || partnerOnline;

        if (!isCoopSession) {
            startNewSoloGame();
            return;
        }

        if (!partnerOnline || (cur.rematchRequestedBy && cur.rematchRequestedBy !== cur.myRole)) {
            const targetVariant = normalizeVariant(
                cur.gameState.variant || inferVariantFromBoardLength(cur.gameState.board?.length),
            );
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
    }, [announce, persistSnapshotIfNeeded, showFeedback, startNewSoloGame, syncLobbyProgress]);

    const handleNewPuzzleAction = useCallback(() => {
        const cur = stateRef.current;
        const partnerOnline = cur.currentMembers.some(
            (m) => m.role !== cur.myRole && (m.role === 'host' || m.role === 'guest'),
        );

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
    }, [startNewPuzzleConfirmed]);

    const handleDifficultyChange = useCallback((nextDiff) => {
        const cur = stateRef.current;
        if (nextDiff === cur.difficulty) return;

        const partnerOnline = cur.currentMembers.some(
            (m) => m.role !== cur.myRole && (m.role === 'host' || m.role === 'guest'),
        );

        const applyDifficulty = () => {
            setDifficulty(nextDiff);
            localStorage.setItem('sudoku_difficulty', nextDiff);
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
    }, [startNewSoloGame]);

    const handleVariantChange = useCallback((nextVariantRaw) => {
        const cur = stateRef.current;
        const nextVariant = normalizeVariant(nextVariantRaw);
        if (nextVariant === cur.variant) return;

        const partnerOnline = cur.currentMembers.some(
            (m) => m.role !== cur.myRole && (m.role === 'host' || m.role === 'guest'),
        );

        const applyVariant = () => {
            setVariant(nextVariant);
            localStorage.setItem('sudoku_variant', nextVariant);
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
    }, [startNewSoloGame]);

    const handlePlayFromSetup = useCallback(() => {
        const cur = stateRef.current;
        const partnerOnline = cur.currentMembers.some(
            (m) => m.role !== cur.myRole && (m.role === 'host' || m.role === 'guest'),
        );
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
    }, [broadcastActiveDigit, broadcastCursor, ensureHostOnlineSession, startNewSoloGame]);

    const handleResumeFromSetup = useCallback(() => {
        const curState = stateRef.current.gameState;
        const resumedVar = normalizeVariant(curState.variant || inferVariantFromBoardLength(curState.board?.length));
        setVariant(resumedVar);
        localStorage.setItem('sudoku_variant', resumedVar);
        if (curState.difficulty) {
            setDifficulty(curState.difficulty);
            localStorage.setItem('sudoku_difficulty', curState.difficulty);
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
    }, [broadcastActiveDigit, broadcastCursor, ensureHostOnlineSession]);

    const handleBackToSetup = useCallback(() => {
        setIsPlayingGame(false);
        stateRef.current.isPlayingGame = false;
        const cur = stateRef.current;
        const hasPartner = cur.currentMembers.some(
            (m) => m.role !== cur.myRole && (m.role === 'host' || m.role === 'guest'),
        );
        if (cur.incomingJoinRequests.length > 0) {
            const pendingReqs = cur.incomingJoinRequests;
            setIncomingJoinRequests([]);
            stateRef.current.incomingJoinRequests = [];
            for (const req of pendingReqs) {
                onlineClientRef.current?.broadcastGameEvent(req.gameId, 'join-response', {
                    requestId: req.requestId,
                    requesterId: req.requesterId,
                    accepted: false,
                    reason: 'declined',
                });
            }
        }
        if (!hasPartner && cur.myRole === 'host') {
            onlineClientRef.current?.leaveLobby();
        }
    }, []);

    const handleReconnect = useCallback(() => {
        onlineClientRef.current?.client?.connect();
        showFeedback('Reconnecting to live server...');
    }, [showFeedback]);

    // Keyboard shortcuts & grid arrow navigation (both 9x9 and 6x6)
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
            const { row, col } = getCellCoords(selectedIndex, specInfo.id);
            const maxIdx = specInfo.gridSize - 1;
            let nextIndex = null;

            if (e.key === 'ArrowUp' && row > 0) nextIndex = (row - 1) * specInfo.gridSize + col;
            if (e.key === 'ArrowDown' && row < maxIdx) nextIndex = (row + 1) * specInfo.gridSize + col;
            if (e.key === 'ArrowLeft' && col > 0) nextIndex = row * specInfo.gridSize + (col - 1);
            if (e.key === 'ArrowRight' && col < maxIdx) nextIndex = row * specInfo.gridSize + (col + 1);
            if (e.key === 'Home') nextIndex = row * specInfo.gridSize;
            if (e.key === 'End') nextIndex = row * specInfo.gridSize + maxIdx;

            if (nextIndex !== null) {
                e.preventDefault();
                focusCell(nextIndex);
                cellRefs.current[nextIndex]?.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [applyPlayerDigit, broadcastActiveDigit, broadcastCursor, focusCell, handleUndo, isHelpOpen, isPlayingGame, isSpectating, navTab, pendingConfirm, selectedIndex, sendSpectatorHint]);

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
    const canJoinSpectated = isSpectating && hostOnline && hostJoinPolicy !== 'disabled' && gameState.status !== 'solved' && Boolean(onlineGameId);
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

    const showLegalPage = !isNativeApp && Boolean(legalPage);

    return (
        <>
            <div id="sudoku-app" className="app-container app-container--with-nav">
                <div id="game-announcements" className="sr-only" aria-live="polite" aria-atomic="true">
                    {announcement}
                </div>

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
                    <section
                        id="confirm-dialog"
                        className="confirm-banner"
                        role="alertdialog"
                        aria-modal="false"
                        aria-labelledby="confirm-title"
                    >
                        <div className="confirm-banner__copy">
                            <h2 id="confirm-title" className="confirm-banner__title">{pendingConfirm.title}</h2>
                            <p className="confirm-banner__message">{pendingConfirm.message}</p>
                        </div>
                        <div className="confirm-banner__actions">
                            <button
                                ref={confirmCancelRef}
                                type="button"
                                className="confirm-banner__btn confirm-banner__btn--cancel"
                                onClick={() => setPendingConfirm(null)}
                            >
                                {pendingConfirm.cancelLabel}
                            </button>
                            <button
                                type="button"
                                className="confirm-banner__btn confirm-banner__btn--confirm"
                                onClick={() => {
                                    const action = pendingConfirm.onConfirm;
                                    setPendingConfirm(null);
                                    action?.();
                                }}
                            >
                                {pendingConfirm.confirmLabel}
                            </button>
                        </div>
                    </section>
                )}

                {incomingJoinRequest && myRole === 'host' && !isSpectating && (
                    <section
                        id="join-request-banner"
                        className="confirm-banner"
                        role="alertdialog"
                        aria-modal="false"
                        aria-labelledby="join-request-title"
                    >
                        <div className="confirm-banner__copy">
                            <h2 id="join-request-title" className="confirm-banner__title">
                                {messages.joinRequestTitle || 'Player wants to join'}
                            </h2>
                            <p className="confirm-banner__message">
                                {messages.joinRequestMessage || 'Another player would like to join this puzzle in Co-op mode.'}
                            </p>
                        </div>
                        <div className="confirm-banner__actions">
                            <button
                                type="button"
                                id="decline-join-btn"
                                className="confirm-banner__btn confirm-banner__btn--cancel"
                                onClick={() => handleRespondJoinRequest(false)}
                            >
                                {messages.joinRequestDecline || 'Decline'}
                            </button>
                            <button
                                type="button"
                                id="accept-join-btn"
                                className="confirm-banner__btn confirm-banner__btn--accept"
                                onClick={() => handleRespondJoinRequest(true)}
                            >
                                {messages.joinRequestAccept || 'Allow'}
                            </button>
                        </div>
                    </section>
                )}

                {!showLegalPage && navTab === 'play' && !isPlayingGame && (
                    <section id="play-setup" className="play-setup" aria-label={messages.setupTitle}>
                        <header className="play-setup__header">
                            <h1 className="play-setup__title">{messages.gameTitle}</h1>
                            <p className="play-setup__subtitle">{messages.setupSubtitle}</p>
                        </header>

                        <div className="setup-controls">
                            <VariantSelector
                                variant={variant}
                                onChange={handleVariantChange}
                                messages={messages}
                            />
                            <DifficultySelector
                                difficulty={difficulty}
                                onChange={handleDifficultyChange}
                                messages={messages}
                            />
                        </div>

                        <div className="play-setup__actions">
                            <button
                                type="button"
                                id="start-game-btn"
                                className="btn-primary play-setup__cta"
                                onClick={handlePlayFromSetup}
                            >
                                {messages.startPuzzle}
                            </button>
                            {canResumeGame && (
                                <button
                                    type="button"
                                    id="resume-game-btn"
                                    className="btn-secondary play-setup__resume"
                                    onClick={handleResumeFromSetup}
                                >
                                    {messages.resumePuzzle}
                                </button>
                            )}
                        </div>

                        {!isNativeApp && (
                            <footer id="web-start-footer" className="play-setup__web-footer" aria-label={messages.webFooterLabel}>
                                <a
                                    id="app-store-link"
                                    className="app-store-link"
                                    href={APP_STORE_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                        <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z" />
                                    </svg>
                                    <span>{messages.appStoreLinkLabel}</span>
                                </a>
                                <nav className="web-legal-links" aria-label={messages.legalLinksLabel}>
                                    <a
                                        id="privacy-link"
                                        href="/privacy"
                                        className="web-legal-link"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            openLegalPage('privacy');
                                        }}
                                    >
                                        {messages.privacyTitle}
                                    </a>
                                    <span className="web-legal-links__sep" aria-hidden="true">·</span>
                                    <a
                                        id="impressum-link"
                                        href="/impressum"
                                        className="web-legal-link"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            openLegalPage('impressum');
                                        }}
                                    >
                                        {messages.impressumTitle}
                                    </a>
                                </nav>
                            </footer>
                        )}
                    </section>
                )}

                {!showLegalPage && navTab === 'play' && isPlayingGame && (
                    <main className="game-screen" aria-label={messages.gameTitle}>
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

                            {gameState.status !== 'solved' && (
                                <div className="game-top-bar__actions">
                                    <button
                                        type="button"
                                        id="restart-btn"
                                        className="btn-primary game-top-bar__new-btn"
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
                                </div>
                            )}
                        </div>

                        <StatusBanner
                            connectionStatus={connectionStatus}
                            mode={mode}
                            isSpectating={false}
                            myRole={myRole}
                            myClientId={onlineClientRef.current?.clientId || null}
                            currentMembers={currentMembers}
                            spectatedGameMode={spectatedGameMode}
                            gameState={gameState}
                            onReconnect={handleReconnect}
                            messages={messages}
                        />

                        <SudokuBoard
                            gameState={gameState}
                            selectedIndex={selectedIndex}
                            activeDigit={activeDigit}
                            hintsByCell={hintsByCell}
                            floatingReactions={floatingReactions}
                            cellRefs={cellRefs}
                            onCellSelect={handleCellSelect}
                            myRole={myRole}
                            playerCursorIndex={null}
                            partnerCursorIndices={playPartnerCursorIndices}
                            unitCelebration={unitCelebration}
                            hintHighlight={hintHighlight}
                            boardBackground={boardBackground}
                        />

                        {actionFeedback && (
                            <div id="action-feedback" className="action-feedback" role="status">
                                {actionFeedback}
                            </div>
                        )}

                        {gameState.status === 'solved' && (
                            <SolveSummary
                                difficulty={gameState.difficulty}
                                elapsedSeconds={gameState.elapsedSeconds}
                                mode={isCoopSession ? 'online' : 'solo'}
                                isSpectating={false}
                                restartLabel={restartLabel}
                                restartDisabled={restartDisabled}
                                onPlayAgain={handleNewPuzzleAction}
                                messages={messages}
                            />
                        )}

                        <SpectatorHintsFeed
                            hintsByCell={hintsByCell}
                            variant={activeBoardVariant}
                            canApply={gameState.status !== 'solved'}
                            onSelectHint={(idx) => {
                                focusCell(idx);
                                cellRefs.current[idx]?.focus();
                            }}
                            onApplyHint={(idx, digit) => {
                                const cur = stateRef.current;
                                if (cur.isSpectating || cur.mode === 'watch' || cur.gameState.status === 'solved') return;
                                const owner = (cur.myRole === 'host' || cur.myRole === 'guest') ? cur.myRole : null;
                                const prevGameState = cur.gameState;
                                const prevBoard = prevGameState.board;
                                setSelectedIndex(idx);
                                broadcastCursor(idx);
                                const nextState = setCellValue(prevGameState, idx, digit, { owner });
                                setGameState(nextState);
                                stateRef.current.gameState = nextState;
                                if (nextState !== prevGameState) {
                                    clearPendingHint();
                                }
                                clearHintsForCell(idx);
                                const unitCompleted = triggerUnitCelebration(prevBoard, nextState, idx);
                                if (nextState !== prevGameState) {
                                    playMoveSoundFeedback(nextState, idx, digit, unitCompleted);
                                }
                                if (nextState.status === 'solved') {
                                    setSelectedIndex(null);
                                    setActiveDigit(null);
                                    stateRef.current.selectedIndex = null;
                                    stateRef.current.activeDigit = null;
                                }
                                const isBroadcaster = (cur.mode === 'solo' || cur.mode === 'online') && Boolean(cur.onlineGameId) && !cur.isSpectating;
                                if (isBroadcaster) {
                                    onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cell-update', {
                                        index: idx,
                                        value: digit,
                                        notes: nextState.notes[idx],
                                        owner,
                                    });
                                    syncLobbyProgress(nextState);
                                }
                                persistSnapshotIfNeeded(nextState);
                            }}
                            messages={messages}
                        />

                        <PlayerControls
                            board={gameState.board}
                            variant={activeBoardVariant}
                            notesMode={notesMode}
                            canUndo={Boolean(gameState.history?.length) && gameState.status !== 'solved'}
                            activeDigit={activeDigit}
                            highlightedDigit={highlightedDigit}
                            isSolved={gameState.status === 'solved'}
                            isHintArmed={Boolean(pendingHint)}
                            onUndo={handleUndo}
                            onErase={() => applyPlayerDigit(0)}
                            onToggleNotes={() => setNotesMode((prev) => !prev)}
                            onFillCandidates={handleFillCandidates}
                            onClearNotes={handleClearNotes}
                            onLocalHint={handleLocalHint}
                            onDigit={applyPlayerDigit}
                            messages={messages}
                        />
                    </main>
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
                    <main className="watch-screen" aria-label={messages.navWatch}>
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

                        <StatusBanner
                            connectionStatus={connectionStatus}
                            mode={mode}
                            isSpectating
                            myRole={myRole}
                            myClientId={onlineClientRef.current?.clientId || null}
                            currentMembers={currentMembers}
                            spectatedGameMode={spectatedGameMode}
                            gameState={gameState}
                            onReconnect={handleReconnect}
                            messages={messages}
                        />

                        <SudokuBoard
                            gameState={gameState}
                            selectedIndex={selectedIndex}
                            activeDigit={selectedIndex === null ? remoteActiveDigit : activeDigit}
                            hintsByCell={hintsByCell}
                            floatingReactions={floatingReactions}
                            cellRefs={cellRefs}
                            onCellSelect={handleCellSelect}
                            myRole={myRole}
                            playerCursorIndex={hostCursorIndex}
                            partnerCursorIndices={watchPartnerCursorIndices}
                            unitCelebration={unitCelebration}
                            hintHighlight={hintHighlight}
                            boardBackground={boardBackground}
                        />

                        {actionFeedback && (
                            <div id="action-feedback" className="action-feedback" role="status">
                                {actionFeedback}
                            </div>
                        )}

                        {gameState.status === 'solved' && (
                            <SolveSummary
                                difficulty={gameState.difficulty}
                                elapsedSeconds={gameState.elapsedSeconds}
                                mode={isCoopSession ? 'online' : 'solo'}
                                isSpectating
                                restartLabel={restartLabel}
                                restartDisabled={restartDisabled}
                                onPlayAgain={handleNewPuzzleAction}
                                messages={messages}
                            />
                        )}

                        <SpectatorHintsFeed
                            hintsByCell={hintsByCell}
                            variant={activeBoardVariant}
                            canApply={false}
                            onSelectHint={(idx) => {
                                focusCell(idx);
                                cellRefs.current[idx]?.focus();
                            }}
                            onApplyHint={() => {}}
                            messages={messages}
                        />

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
                    </main>
                )}

                {!showLegalPage && navTab === 'settings' && (
                    <SettingsPanel
                        theme={theme}
                        language={language}
                        joinsAllowed={joinsAllowed}
                        joinsAutoAccept={joinsAutoAccept}
                        musicEnabled={musicEnabled}
                        musicVolume={musicVolume}
                        soundEnabled={soundEnabled}
                        soundVolume={soundVolume}
                        onChangeTheme={setTheme}
                        onChangeLanguage={setLanguage}
                        onChangeJoinsAllowed={setJoinsAllowed}
                        onChangeJoinsAutoAccept={setJoinsAutoAccept}
                        onChangeMusicEnabled={setMusicEnabled}
                        onChangeMusicVolume={setMusicVolume}
                        onChangeSoundEnabled={setSoundEnabled}
                        onChangeSoundVolume={setSoundVolume}
                        onOpenGuide={() => setIsHelpOpen(true)}
                        messages={messages}
                    />
                )}

                <HelpDialog
                    isOpen={isHelpOpen}
                    onClose={() => setIsHelpOpen(false)}
                    messages={messages}
                />
            </div>

            <BottomNav
                activeTab={showLegalPage ? null : navTab}
                isWatchActive={mode === 'watch' || isSpectating}
                onSelectTab={handleSelectNavTab}
                messages={messages}
            />
        </>
    );
}
