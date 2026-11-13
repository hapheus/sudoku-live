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
    fillCandidateNotes,
    hydrateGameState,
    serializeGameState,
    setCellValue,
    toggleCellNote,
    undoLastMove,
} from './domain/sudoku-engine.js';
import { generateGameId, isValidGameId, OnlineGameClient } from './services/online-game-client.js';
import {
    loadOnlineGameSnapshot,
    loadParticipantSession,
    loadSoloGameSnapshot,
    saveOnlineGameSnapshot,
    saveParticipantSession,
    saveSoloGameSnapshot,
} from './services/online-state-storage.js';
import { ALLOWED_REACTIONS, aggregateHintsByCell } from './utils/watcher-helpers.js';
import { ModeTabs } from './components/ModeTabs.jsx';
import { VariantSelector } from './components/VariantSelector.jsx';
import { DifficultySelector } from './components/DifficultySelector.jsx';
import { WatchDirectory } from './components/WatchDirectory.jsx';
import { StatusBanner } from './components/StatusBanner.jsx';
import { SudokuBoard } from './components/SudokuBoard.jsx';
import { SpectatorHintsFeed } from './components/SpectatorHintsFeed.jsx';
import { PlayerControls } from './components/PlayerControls.jsx';
import { WatcherInteractions } from './components/WatcherInteractions.jsx';
import { HelpDialog } from './components/HelpDialog.jsx';
import { SolveSummary } from './components/SolveSummary.jsx';

const GAME_PING_INTERVAL_MS = 5000;

function hasUnsavedProgress(state) {
    if (!state || state.status === 'solved') return false;
    const givenCount = Array.isArray(state.givens) ? state.givens.filter(Boolean).length : 0;
    return Boolean((state.history && state.history.length > 0) || state.filledCount > givenCount);
}

function parseInitialRoute() {
    if (typeof window === 'undefined') {
        return { initialMode: 'solo', initialGameId: null, initialWatch: false };
    }

    const params = new URLSearchParams(window.location.search);
    const pathMatch = window.location.pathname.match(/^\/games\/([A-Za-z0-9_-]{6,64})\/?$/);
    const queryGame = params.get('game');
    const gameId = pathMatch?.[1] || (isValidGameId(queryGame) ? queryGame : null);
    const watch = params.get('watch') === '1' && Boolean(gameId);

    if (watch && gameId) {
        return { initialMode: 'watch', initialGameId: gameId, initialWatch: true };
    }
    if (gameId) {
        return { initialMode: 'online', initialGameId: gameId, initialWatch: false };
    }
    return { initialMode: 'solo', initialGameId: null, initialWatch: false };
}

function updateBrowserUrl(path) {
    if (typeof window === 'undefined') return;
    const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
    if (isNative || !window.location.protocol.startsWith('http')) {
        return;
    }
    window.history.pushState({}, '', path);
}

function replaceBrowserUrl(path) {
    if (typeof window === 'undefined') return;
    const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
    if (isNative || !window.location.protocol.startsWith('http')) {
        return;
    }
    window.history.replaceState({}, '', path);
}

export function App() {
    const initialRoute = useMemo(() => parseInitialRoute(), []);

    const [difficulty, setDifficulty] = useState(() => localStorage.getItem('sudoku_difficulty') || 'medium');
    const [variant, setVariant] = useState(() => normalizeVariant(localStorage.getItem('sudoku_variant') || '3x3'));
    const [mode, setMode] = useState(initialRoute.initialMode);
    const [isSpectating, setIsSpectating] = useState(initialRoute.initialWatch);
    const [onlineGameId, setOnlineGameId] = useState(initialRoute.initialGameId);
    const [myRole, setMyRole] = useState(null);
    const [spectatedGameMode, setSpectatedGameMode] = useState(null);
    const [gameState, setGameState] = useState(() => createSudokuGame({
        difficulty: localStorage.getItem('sudoku_difficulty') || 'medium',
        variant: normalizeVariant(localStorage.getItem('sudoku_variant') || '3x3'),
    }));
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [activeDigit, setActiveDigit] = useState(null);
    const [partnerCursorIndex, setPartnerCursorIndex] = useState(null);
    const [notesMode, setNotesMode] = useState(false);
    const [rematchRequestedBy, setRematchRequestedBy] = useState(null);
    const [currentMembers, setCurrentMembers] = useState([]);
    const [activeLobbyRooms, setActiveLobbyRooms] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [announcement, setAnnouncement] = useState('');
    const [actionFeedback, setActionFeedback] = useState('');
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [pendingConfirm, setPendingConfirm] = useState(null);
    const [hintsMap, setHintsMap] = useState(() => new Map());
    const [floatingReactions, setFloatingReactions] = useState([]);

    const cellRefs = useRef([]);
    const reactionSeq = useRef(0);
    const feedbackTimerRef = useRef(null);
    const confirmCancelRef = useRef(null);
    const onlineClientRef = useRef(null);

    // Live refs to avoid stale closures inside WebSocket event handlers
    const stateRef = useRef({
        mode,
        difficulty,
        variant,
        isSpectating,
        onlineGameId,
        myRole,
        gameState,
        rematchRequestedBy,
        currentMembers,
        hintsMap,
        activeDigit,
        isHelpOpen,
        pendingConfirm,
    });
    stateRef.current = {
        mode,
        difficulty,
        variant,
        isSpectating,
        onlineGameId,
        myRole,
        gameState,
        rematchRequestedBy,
        currentMembers,
        hintsMap,
        activeDigit,
        isHelpOpen,
        pendingConfirm,
    };

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

    const triggerFloatingReaction = useCallback((emoji) => {
        if (!ALLOWED_REACTIONS.has(emoji)) return;
        const id = ++reactionSeq.current;
        const left = 15 + Math.floor(Math.random() * 68);
        setFloatingReactions((prev) => [...prev, { id, emoji, left }]);
        setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((item) => item.id !== id));
        }, 1850);
    }, []);

    const persistSnapshotIfNeeded = useCallback((nextGameState, nextRematch = stateRef.current.rematchRequestedBy) => {
        const { onlineGameId: gId, mode: m, isSpectating: spec, currentMembers: members } = stateRef.current;
        const hasGuest = members.some((member) => member.role === 'guest');
        if (m === 'solo' && !spec) {
            saveSoloGameSnapshot(nextGameState, gId);
        }
        if (gId && (m === 'online' || spec || hasGuest)) {
            saveOnlineGameSnapshot(gId, nextGameState, nextRematch);
        }
    }, []);

    const syncLobbyProgress = useCallback((overrideState = null, overrideMode = null) => {
        const { myRole: role, onlineGameId: gId, mode: curMode, currentMembers: members, gameState: curState, isSpectating: spec } = stateRef.current;
        const targetState = overrideState || curState;
        const targetMode = overrideMode || curMode;
        if (role !== 'host' || !gId || spec || (targetMode !== 'solo' && targetMode !== 'online')) return;

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
            },
        );
    }, []);

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

        if (type === 'init' || type === 'sync') {
            if (!data || !data.gameState) return;
            const hydrated = hydrateGameState(data.gameState);
            if (!hydrated) return;

            setGameState(hydrated);
            stateRef.current.gameState = hydrated;
            setSelectedIndex((prev) => (prev !== null && prev < hydrated.board.length ? prev : null));

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
            persistSnapshotIfNeeded(hydrated, data.rematchRequestedBy);
            return;
        }

        if (type === 'cell-update') {
            const patched = applyRemoteCellPatch(cur.gameState, {
                ...data,
                owner: data?.owner || null,
            });
            setGameState(patched);
            stateRef.current.gameState = patched;

            if (typeof data.value === 'number' && data.value > 0) {
                clearHintsForCell(data.index);
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
                setPartnerCursorIndex(nextIdx);
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
            setSelectedIndex(null);
            setActiveDigit(null);
            setPartnerCursorIndex(null);
            setRematchRequestedBy(null);
            setHintsMap(new Map());
            persistSnapshotIfNeeded(nextState, null);
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

                const shouldRecoverHost = cur.myRole === 'host' && localFilled <= localInitial && remoteFilled > localFilled && !variantDiffers;
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
                        persistSnapshotIfNeeded(hydrated, data.rematchRequestedBy);
                    }
                    if (data.rematchRequestedBy !== undefined) {
                        setRematchRequestedBy(data.rematchRequestedBy);
                    }
                }
            }
        }
    }, [announce, clearHintsForCell, persistSnapshotIfNeeded, showFeedback, syncLobbyProgress, triggerFloatingReaction]);

    const handleGamePresenceChange = useCallback((members) => {
        const resolved = onlineClientRef.current?.getGameMembers() || members || [];
        setCurrentMembers(resolved);
        stateRef.current.currentMembers = resolved;

        const cur = stateRef.current;
        if (cur.myRole === 'host' && resolved.length > 1) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'sync', {
                gameState: serializeGameState(cur.gameState),
                rematchRequestedBy: cur.rematchRequestedBy,
                hints: Array.from(cur.hintsMap.entries()),
            });
            syncLobbyProgress();
        }
    }, [syncLobbyProgress]);

    const handleGameMemberJoin = useCallback((member) => {
        const prevMembers = stateRef.current.currentMembers;
        const authoritative = onlineClientRef.current?.getGameMembers();
        const nextMembers = authoritative || (prevMembers.some((m) => m.id === member.id) ? prevMembers : [...prevMembers, member]);
        setCurrentMembers(nextMembers);
        stateRef.current.currentMembers = nextMembers;

        const cur = stateRef.current;
        if (member?.role === 'guest' && cur.myRole === 'host') {
            showFeedback('A partner joined your game!');
        }
        if (cur.myRole === 'host') {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'sync', {
                gameState: serializeGameState(cur.gameState),
                rematchRequestedBy: cur.rematchRequestedBy,
                hints: Array.from(cur.hintsMap.entries()),
            });
            syncLobbyProgress();
        }
    }, [showFeedback, syncLobbyProgress]);

    const handleGameMemberLeave = useCallback((member) => {
        const authoritative = onlineClientRef.current?.getGameMembers();
        if (authoritative) {
            setCurrentMembers(authoritative);
            stateRef.current.currentMembers = authoritative;
        } else {
            setCurrentMembers((prev) => prev.filter((m) => m.id !== member.id));
        }

        if (member?.role === 'host' || member?.role === 'guest') {
            setPartnerCursorIndex(null);
        }

        if (member?.id) {
            setHintsMap((prev) => {
                if (!prev.has(member.id)) return prev;
                const next = new Map(prev);
                next.delete(member.id);
                return next;
            });
        }

        const cur = stateRef.current;
        if (cur.myRole === 'host') {
            syncLobbyProgress();
        }
    }, [syncLobbyProgress]);

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

    const enterSpectatorView = useCallback((gameId, announcementText = null) => {
        setMode('watch');
        setIsSpectating(true);
        setSpectatedGameMode(null);
        setOnlineGameId(gameId);
        setMyRole('spectator');
        setSelectedIndex(null);

        stateRef.current.mode = 'watch';
        stateRef.current.isSpectating = true;
        stateRef.current.onlineGameId = gameId;
        stateRef.current.myRole = 'spectator';

        if (announcementText) announce(announcementText);
    }, [announce]);

    const spectateGame = useCallback((gameId) => {
        if (!isValidGameId(gameId)) return;

        onlineClientRef.current?.leaveLobby();
        setCurrentMembers([]);
        setHintsMap(new Map());
        setRematchRequestedBy(null);

        const snapshot = loadOnlineGameSnapshot(gameId);
        if (snapshot?.gameState) {
            setGameState(snapshot.gameState);
            stateRef.current.gameState = snapshot.gameState;
        }

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
                handleGamePresenceChange(members);
            },
            onMemberJoin: handleGameMemberJoin,
            onMemberLeave: handleGameMemberLeave,
        });
    }, [enterSpectatorView, handleGameMemberJoin, handleGameMemberLeave, handleGamePresenceChange, handleRemoteGameEvent]);

    const joinAsOnlinePlayer = useCallback((gameId, role, initialGameState = null) => {
        setMode('online');
        setMyRole(role);
        setIsSpectating(false);
        setOnlineGameId(gameId);

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
            onEvent: handleRemoteGameEvent,
            onPresenceChange: (members) => {
                const resolved = onlineClientRef.current?.getGameMembers() || members || [];
                const otherGuestPresent = role === 'guest' && resolved.some(
                    (m) => m.role === 'guest' && m.id !== onlineClientRef.current?.clientId,
                );
                if (otherGuestPresent) {
                    enterSpectatorView(gameId, 'Room already has two co-op players. Joined as spectator.');
                    replaceBrowserUrl(`/games/${gameId}?watch=1`);
                    return;
                }
                handleGamePresenceChange(members);
            },
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
            });
        }
    }, [enterSpectatorView, handleGameMemberJoin, handleGameMemberLeave, handleGamePresenceChange, handleRemoteGameEvent]);

    const joinWatchGame = useCallback((gameId) => {
        if (!isValidGameId(gameId)) return;

        onlineClientRef.current?.leaveLobby();
        setSelectedIndex(null);
        setActiveDigit(null);
        setPartnerCursorIndex(null);
        setNotesMode(false);
        setHintsMap(new Map());
        setRematchRequestedBy(null);

        const cur = stateRef.current;
        const fromSpectatingSameRoom = cur.isSpectating && cur.onlineGameId === gameId;
        const snapshot = !fromSpectatingSameRoom ? loadOnlineGameSnapshot(gameId) : null;
        if (snapshot?.gameState) {
            setGameState(snapshot.gameState);
            setRematchRequestedBy(snapshot.rematchRequestedBy);
            stateRef.current.gameState = snapshot.gameState;
        }

        saveParticipantSession(gameId, 'guest');
        updateBrowserUrl(`/games/${gameId}`);
        joinAsOnlinePlayer(gameId, 'guest', fromSpectatingSameRoom ? cur.gameState : snapshot?.gameState);
        showFeedback('Joined live match as co-op partner!');
    }, [joinAsOnlinePlayer, showFeedback]);

    const startNewSoloGame = useCallback((overrideDifficulty = null, overrideVariant = null, { restoreSaved = false } = {}) => {
        const saved = restoreSaved ? loadSoloGameSnapshot() : null;
        const diff = saved?.gameState?.status === 'in_progress'
            ? saved.gameState.difficulty
            : (overrideDifficulty || stateRef.current.difficulty);
        const varId = saved?.gameState?.status === 'in_progress'
            ? normalizeVariant(saved.gameState.variant || inferVariantFromBoardLength(saved.gameState.board?.length))
            : normalizeVariant(overrideVariant || stateRef.current.variant);

        const hadExistingSoloRoom = Boolean(stateRef.current.onlineGameId) && stateRef.current.myRole === 'host' && stateRef.current.mode === 'solo';
        const roomId = saved?.roomId || (hadExistingSoloRoom ? stateRef.current.onlineGameId : generateGameId());

        const nextState = (saved && saved.gameState.status !== 'solved')
            ? saved.gameState
            : createSudokuGame({ difficulty: diff, variant: varId });

        if (saved && saved.gameState.status !== 'solved') {
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
        setPartnerCursorIndex(null);
        setNotesMode(false);
        setHintsMap(new Map());
        setRematchRequestedBy(null);
        setGameState(nextState);
        if (!hadExistingSoloRoom) {
            setCurrentMembers([]);
        }

        stateRef.current.mode = 'solo';
        stateRef.current.isSpectating = false;
        stateRef.current.onlineGameId = roomId;
        stateRef.current.myRole = 'host';
        stateRef.current.gameState = nextState;

        saveSoloGameSnapshot(nextState, roomId);

        if (!hadExistingSoloRoom) {
            onlineClientRef.current?.joinGameChannel(roomId, {
                role: 'host',
                gameMode: 'solo',
                onEvent: handleRemoteGameEvent,
                onPresenceChange: handleGamePresenceChange,
                onMemberJoin: handleGameMemberJoin,
                onMemberLeave: handleGameMemberLeave,
            });

            onlineClientRef.current?.joinLobby({
                gameId: roomId,
                status: 'in_progress',
                gameMode: 'solo',
                difficulty: nextState.difficulty,
                variant: specInfo.id,
                totalCells: specInfo.totalCells,
                hasGuest: false,
                filledCount: nextState.filledCount,
            });
        } else {
            onlineClientRef.current?.broadcastGameEvent(roomId, 'new-puzzle-accept', {
                gameState: serializeGameState(nextState),
            });
            syncLobbyProgress(nextState, 'solo');
        }

        announce(saved && saved.gameState.status !== 'solved'
            ? `Resumed ${specInfo.shortLabel} ${nextState.difficulty} Solo puzzle.`
            : `New ${specInfo.shortLabel} ${diff} Sudoku puzzle ready.`);
    }, [announce, handleGameMemberJoin, handleGameMemberLeave, handleGamePresenceChange, handleRemoteGameEvent, syncLobbyProgress]);

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

                const hasGuest = resolved.some((m) => m.role === 'guest');

                if (!hasGuest) {
                    saveParticipantSession(gameId, 'guest');
                    joinAsOnlinePlayer(gameId, 'guest', stateRef.current.gameState);
                } else {
                    enterSpectatorView(gameId, 'Room already has two co-op players. Joined as spectator.');
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
            startNewSoloGame(null, null, { restoreSaved: true });
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
            if (typeof document !== 'undefined' && document.hidden) {
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
                    saveSoloGameSnapshot(next, stateRef.current.onlineGameId);
                }
                return next;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // 5-second state reconciliation & lobby heartbeat
    useEffect(() => {
        const timer = setInterval(() => {
            const cur = stateRef.current;
            const isBroadcaster = (cur.mode === 'solo' || cur.mode === 'online') && Boolean(cur.onlineGameId) && !cur.isSpectating;
            if (!isBroadcaster) return;

            onlineClientRef.current?.sendGamePing({
                role: cur.myRole,
                gameState: serializeGameState(cur.gameState),
                rematchRequestedBy: cur.rematchRequestedBy,
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
                const nextState = setCellValue(cur.gameState, targetIndex, digit, { owner });
                setGameState(nextState);
                stateRef.current.gameState = nextState;
                if (digit !== 0) {
                    clearHintsForCell(targetIndex);
                    const totalPlaced = nextState.board.filter((v) => v === digit).length;
                    if (totalPlaced >= specInfo.gridSize && cur.activeDigit === digit) {
                        setActiveDigit(null);
                    }
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
    }, [clearHintsForCell, notesMode, persistSnapshotIfNeeded, showFeedback, syncLobbyProgress]);

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
                    showFeedback('Digit lock cleared.');
                } else {
                    showFeedback('Select a cell to erase.');
                }
                return;
            }

            if (isGivenSelected) {
                setSelectedIndex(null);
                setActiveDigit(digit);
                showFeedback(`Digit ${digit} locked — tap an empty cell to place it.`);
                return;
            }

            const nextActive = cur.activeDigit === digit ? null : digit;
            setActiveDigit(nextActive);
            showFeedback(
                nextActive
                    ? `Digit ${nextActive} locked — tap an empty cell to place it.`
                    : 'Digit lock cleared.',
            );
            return;
        }

        writeDigitToCell(selectedIndex, digit);
    }, [selectedIndex, showFeedback, writeDigitToCell]);

    const broadcastCursor = useCallback((idx) => {
        const cur = stateRef.current;
        const hasPartner = cur.currentMembers.some(
            (m) => m.role !== cur.myRole && (m.role === 'host' || m.role === 'guest'),
        );
        if ((cur.mode === 'online' || hasPartner) && !cur.isSpectating && (cur.myRole === 'host' || cur.myRole === 'guest') && cur.onlineGameId) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cursor', {
                senderId: onlineClientRef.current?.clientId,
                role: cur.myRole,
                index: idx,
            });
        }
    }, []);

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
            }
        }
    }, [broadcastCursor, writeDigitToCell]);

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
    }, [persistSnapshotIfNeeded, syncLobbyProgress]);

    const handleLocalHint = useCallback(() => {
        const cur = stateRef.current;
        if (cur.isSpectating || cur.mode === 'watch' || cur.gameState.status === 'solved') return;

        const totalCells = cur.gameState.board.length;
        const activeVariant = cur.gameState.variant || inferVariantFromBoardLength(totalCells);
        let targetIdx = selectedIndex;
        if (
            targetIdx === null
            || targetIdx >= totalCells
            || cur.gameState.givens[targetIdx]
            || (cur.gameState.board[targetIdx] !== 0 && cur.gameState.board[targetIdx] === cur.gameState.solution[targetIdx])
        ) {
            const candidateIndices = [];
            for (let i = 0; i < totalCells; i++) {
                if (!cur.gameState.givens[i] && cur.gameState.board[i] !== cur.gameState.solution[i]) {
                    candidateIndices.push(i);
                }
            }
            if (candidateIndices.length === 0) return;
            targetIdx = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
        }

        const correctDigit = cur.gameState.solution[targetIdx];
        if (!correctDigit) return;

        const owner = (cur.myRole === 'host' || cur.myRole === 'guest') ? cur.myRole : null;
        setSelectedIndex(targetIdx);
        const nextState = setCellValue(cur.gameState, targetIdx, correctDigit, { owner });
        setGameState(nextState);
        stateRef.current.gameState = nextState;
        clearHintsForCell(targetIdx);

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

        const { row, col } = getCellCoords(targetIdx, activeVariant);
        showFeedback(`Hint filled R${row + 1} C${col + 1} with ${correctDigit}.`);
        persistSnapshotIfNeeded(nextState);
    }, [clearHintsForCell, persistSnapshotIfNeeded, selectedIndex, showFeedback, syncLobbyProgress]);

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
        onlineClientRef.current?.disconnect();
        setPartnerCursorIndex(null);
        setActiveDigit(null);

        if (newMode === 'watch') {
            setMode('watch');
            setIsSpectating(false);
            setOnlineGameId(null);
            setMyRole(null);
            setCurrentMembers([]);
            setHintsMap(new Map());
            updateBrowserUrl('/');
            openWatchDirectory();
            return;
        }

        setIsSpectating(false);
        setHintsMap(new Map());
        setOnlineGameId(null);
        setMyRole(null);
        setCurrentMembers([]);
        updateBrowserUrl('/');
        startNewSoloGame(null, null, { restoreSaved: true });
    }, [openWatchDirectory, startNewSoloGame]);

    const switchMode = useCallback((newMode) => {
        const cur = stateRef.current;
        if (cur.mode === newMode && !cur.isSpectating) return;

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

    const exitSpectating = useCallback(() => {
        onlineClientRef.current?.leaveGameChannel();
        setOnlineGameId(null);
        setIsSpectating(false);
        setMode('watch');
        setPartnerCursorIndex(null);
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
            setGameState(nextState);
            stateRef.current.gameState = nextState;
            setSelectedIndex(null);
            setActiveDigit(null);
            setPartnerCursorIndex(null);
            setNotesMode(false);
            setRematchRequestedBy(null);
            setHintsMap(new Map());
            persistSnapshotIfNeeded(nextState, null);
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'new-puzzle-accept', {
                gameState: serializeGameState(nextState),
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
            if (cur.mode === 'solo' && !cur.isSpectating) {
                startNewSoloGame(nextDiff, cur.variant);
            }
        };

        if (cur.mode === 'solo' && (hasUnsavedProgress(cur.gameState) || partnerOnline)) {
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
            if (cur.mode === 'solo' && !cur.isSpectating) {
                startNewSoloGame(cur.difficulty, nextVariant);
            }
        };

        if (cur.mode === 'solo' && (hasUnsavedProgress(cur.gameState) || partnerOnline)) {
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

    const handleReconnect = useCallback(() => {
        onlineClientRef.current?.client?.connect();
        showFeedback('Reconnecting to live server...');
    }, [showFeedback]);

    // Keyboard shortcuts & grid arrow navigation (both 9x9 and 6x6)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (isHelpOpen || pendingConfirm) return;
            if (mode === 'watch' && !isSpectating) return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

            const curState = stateRef.current.gameState;
            const activeVariant = curState.variant || inferVariantFromBoardLength(curState.board?.length);
            const specInfo = getVariantSpec(activeVariant);

            if (e.key === 'Escape') {
                if (selectedIndex !== null || stateRef.current.activeDigit !== null) {
                    e.preventDefault();
                    setSelectedIndex(null);
                    setActiveDigit(null);
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
    }, [applyPlayerDigit, focusCell, handleUndo, isHelpOpen, isSpectating, mode, pendingConfirm, selectedIndex, sendSpectatorHint]);

    const showBoard = mode !== 'watch' || isSpectating;
    const showHints = mode === 'solo' || mode === 'online' || isSpectating;
    const hintsByCell = useMemo(
        () => (showHints ? aggregateHintsByCell(hintsMap) : new Map()),
        [hintsMap, showHints],
    );
    const highlightedDigit = selectedIndex !== null && gameState.board[selectedIndex] > 0
        ? gameState.board[selectedIndex]
        : activeDigit;

    const partnerOnline = currentMembers.some(
        (m) => m.role !== myRole && (m.role === 'host' || m.role === 'guest'),
    );
    const isCoopSession = !isSpectating && (mode === 'online' || partnerOnline || myRole === 'guest');
    const hostOnline = currentMembers.some((m) => m.role === 'host');
    const guestOnline = currentMembers.some((m) => m.role === 'guest');
    const canJoinSpectated = isSpectating && hostOnline && !guestOnline && gameState.status !== 'solved' && Boolean(onlineGameId);

    const activeBoardVariant = gameState.variant || inferVariantFromBoardLength(gameState.board?.length);

    let restartLabel = 'New Puzzle';
    let restartDisabled = false;
    const isWaitingForRematch = isCoopSession && Boolean(rematchRequestedBy && rematchRequestedBy === myRole);
    if (isCoopSession) {
        if (!partnerOnline && gameState.status !== 'solved') {
            restartLabel = 'New Puzzle';
        } else if (isWaitingForRematch) {
            restartLabel = 'Waiting for partner...';
            restartDisabled = true;
        } else if (rematchRequestedBy) {
            restartLabel = 'Accept New Puzzle';
        }
    }

    return (
        <div id="sudoku-app" className="app-container">
            <div id="game-announcements" className="sr-only" aria-live="polite" aria-atomic="true">
                {announcement}
            </div>

            <header className="app-header">
                <div className="app-header__bar">
                    <h1 className="app-title">
                        Sudoku <span className="app-title__accent">Live</span>
                    </h1>
                    <button
                        type="button"
                        id="help-btn"
                        className="help-trigger-btn"
                        aria-label="How to play and keyboard shortcuts"
                        aria-haspopup="dialog"
                        aria-expanded={isHelpOpen}
                        onClick={() => setIsHelpOpen(true)}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                            <path d="M12 17h.01" />
                        </svg>
                        <span>Guide</span>
                    </button>
                </div>
            </header>

            <ModeTabs mode={mode} onSelectMode={switchMode} />

            {!isSpectating && mode !== 'watch' && myRole !== 'guest' && (
                <div className="setup-controls">
                    <VariantSelector
                        variant={variant}
                        onChange={handleVariantChange}
                    />
                    <DifficultySelector
                        difficulty={difficulty}
                        onChange={handleDifficultyChange}
                    />
                </div>
            )}

            {mode === 'watch' && !isSpectating && (
                <WatchDirectory
                    rooms={activeLobbyRooms}
                    connectionStatus={connectionStatus}
                    onReconnect={handleReconnect}
                    onRefresh={openWatchDirectory}
                    onWatchGame={spectateGame}
                    onJoinGame={joinWatchGame}
                />
            )}

            {isSpectating && (
                <div id="spectator-bar" className="spectator-bar">
                    <span>
                        <strong>Spectating Live Match</strong> — Read-only board
                    </span>
                    <div className="spectator-bar__actions">
                        {canJoinSpectated && (
                            <button
                                type="button"
                                id="join-from-watch-btn"
                                className="spectator-bar__join-btn"
                                onClick={() => joinWatchGame(onlineGameId)}
                            >
                                Join Game
                            </button>
                        )}
                        <button
                            type="button"
                            id="exit-watch-btn"
                            className="spectator-bar__back-btn"
                            onClick={exitSpectating}
                        >
                            Back to Lobby
                        </button>
                    </div>
                </div>
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

            {showBoard && (
                <StatusBanner
                    connectionStatus={connectionStatus}
                    mode={mode}
                    isSpectating={isSpectating}
                    myRole={myRole}
                    currentMembers={currentMembers}
                    spectatedGameMode={spectatedGameMode}
                    gameState={gameState}
                    onReconnect={handleReconnect}
                />
            )}

            {showBoard && (
                <SudokuBoard
                    gameState={gameState}
                    selectedIndex={selectedIndex}
                    activeDigit={activeDigit}
                    hintsByCell={hintsByCell}
                    floatingReactions={floatingReactions}
                    cellRefs={cellRefs}
                    onCellSelect={handleCellSelect}
                    myRole={myRole}
                    partnerCursorIndex={partnerCursorIndex}
                />
            )}

            {actionFeedback && (
                <div id="action-feedback" className="action-feedback" role="status">
                    {actionFeedback}
                </div>
            )}

            {showBoard && gameState.status === 'solved' && (
                <SolveSummary
                    difficulty={gameState.difficulty}
                    elapsedSeconds={gameState.elapsedSeconds}
                    mode={isCoopSession ? 'online' : 'solo'}
                    isSpectating={isSpectating}
                    restartLabel={restartLabel}
                    restartDisabled={restartDisabled}
                    onPlayAgain={handleNewPuzzleAction}
                />
            )}

            {showHints && (
                <SpectatorHintsFeed
                    hintsByCell={hintsByCell}
                    variant={activeBoardVariant}
                    canApply={(mode === 'solo' || mode === 'online') && !isSpectating && gameState.status !== 'solved'}
                    onSelectHint={(idx) => {
                        focusCell(idx);
                        cellRefs.current[idx]?.focus();
                    }}
                    onApplyHint={(idx, digit) => {
                        const cur = stateRef.current;
                        if (cur.isSpectating || cur.mode === 'watch' || cur.gameState.status === 'solved') return;
                        const owner = (cur.myRole === 'host' || cur.myRole === 'guest') ? cur.myRole : null;
                        setSelectedIndex(idx);
                        const nextState = setCellValue(cur.gameState, idx, digit, { owner });
                        setGameState(nextState);
                        stateRef.current.gameState = nextState;
                        clearHintsForCell(idx);
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
                />
            )}

            {!isSpectating && mode !== 'watch' && (
                <PlayerControls
                    board={gameState.board}
                    variant={activeBoardVariant}
                    notesMode={notesMode}
                    canUndo={Boolean(gameState.history?.length) && gameState.status !== 'solved'}
                    activeDigit={activeDigit}
                    highlightedDigit={highlightedDigit}
                    isSolved={gameState.status === 'solved'}
                    onUndo={handleUndo}
                    onErase={() => applyPlayerDigit(0)}
                    onToggleNotes={() => setNotesMode((prev) => !prev)}
                    onFillCandidates={handleFillCandidates}
                    onClearNotes={handleClearNotes}
                    onLocalHint={handleLocalHint}
                    onDigit={applyPlayerDigit}
                />
            )}

            {isSpectating && (
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
                />
            )}

            {!isSpectating && mode !== 'watch' && gameState.status !== 'solved' && (
                <div className="action-controls">
                    <button
                        type="button"
                        id="restart-btn"
                        className="btn-primary"
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
                            Cancel Request
                        </button>
                    )}
                </div>
            )}

            <HelpDialog isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        </div>
    );
}
