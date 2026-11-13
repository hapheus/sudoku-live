import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCellCoords } from './domain/sudoku-generator.js';
import {
    applyRemoteCellPatch,
    createSudokuGame,
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
    saveOnlineGameSnapshot,
    saveParticipantSession,
} from './services/online-state-storage.js';
import { ALLOWED_REACTIONS, aggregateHintsByCell } from './utils/watcher-helpers.js';
import { ModeTabs } from './components/ModeTabs.jsx';
import { DifficultySelector } from './components/DifficultySelector.jsx';
import { OnlineInviteBox } from './components/OnlineInviteBox.jsx';
import { WatchDirectory } from './components/WatchDirectory.jsx';
import { StatusBanner } from './components/StatusBanner.jsx';
import { SudokuBoard } from './components/SudokuBoard.jsx';
import { SpectatorHintsFeed } from './components/SpectatorHintsFeed.jsx';
import { PlayerControls } from './components/PlayerControls.jsx';
import { WatcherInteractions } from './components/WatcherInteractions.jsx';

const GAME_PING_INTERVAL_MS = 5000;

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

function buildInviteUrl(gameId) {
    if (!gameId || typeof window === 'undefined') return '';
    if (window.location.protocol.startsWith('http') && !window.Capacitor?.isNativePlatform?.()) {
        return `${window.location.origin}/games/${gameId}`;
    }
    const base = window.__APP_CONFIG__?.publicAppUrl || window.location.origin;
    return `${base}/games/${gameId}`;
}

export function App() {
    const initialRoute = useMemo(() => parseInitialRoute(), []);

    const [difficulty, setDifficulty] = useState(() => localStorage.getItem('sudoku_difficulty') || 'medium');
    const [mode, setMode] = useState(initialRoute.initialMode);
    const [isSpectating, setIsSpectating] = useState(initialRoute.initialWatch);
    const [onlineGameId, setOnlineGameId] = useState(initialRoute.initialGameId);
    const [myRole, setMyRole] = useState(null);
    const [spectatedGameMode, setSpectatedGameMode] = useState(null);
    const [gameState, setGameState] = useState(() => createSudokuGame({ difficulty: localStorage.getItem('sudoku_difficulty') || 'medium' }));
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [notesMode, setNotesMode] = useState(false);
    const [rematchRequestedBy, setRematchRequestedBy] = useState(null);
    const [currentMembers, setCurrentMembers] = useState([]);
    const [activeLobbyRooms, setActiveLobbyRooms] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [announcement, setAnnouncement] = useState('');
    const [hintsMap, setHintsMap] = useState(() => new Map());
    const [floatingReactions, setFloatingReactions] = useState([]);

    const cellRefs = useRef(Array(81).fill(null));
    const reactionSeq = useRef(0);
    const onlineClientRef = useRef(null);

    // Live refs to avoid stale closures inside WebSocket event handlers
    const stateRef = useRef({
        mode,
        difficulty,
        isSpectating,
        onlineGameId,
        myRole,
        gameState,
        rematchRequestedBy,
        currentMembers,
        hintsMap,
    });
    stateRef.current = {
        mode,
        difficulty,
        isSpectating,
        onlineGameId,
        myRole,
        gameState,
        rematchRequestedBy,
        currentMembers,
        hintsMap,
    };

    const announce = useCallback((msg) => {
        if (msg) setAnnouncement(msg);
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
        const { onlineGameId: gId, mode: m, isSpectating: spec } = stateRef.current;
        if (gId && (m === 'online' || spec)) {
            saveOnlineGameSnapshot(gId, nextGameState, nextRematch);
        }
    }, []);

    const syncLobbyProgress = useCallback((overrideState = null, overrideMode = null) => {
        const { myRole: role, onlineGameId: gId, mode: curMode, currentMembers: members, gameState: curState } = stateRef.current;
        const targetState = overrideState || curState;
        const targetMode = overrideMode || curMode;
        if (role !== 'host' || !gId || (targetMode !== 'solo' && targetMode !== 'online')) return;

        const guestOnline = members.some((m) => m.role === 'guest');
        let status = targetMode === 'solo' ? 'in_progress' : 'waiting';
        if (targetState.status === 'solved') {
            status = 'solved';
        } else if (targetMode === 'solo' || guestOnline || targetState.filledCount > 0) {
            status = 'in_progress';
        }

        onlineClientRef.current?.broadcastLobbyUpdate(
            gId,
            status,
            targetState.filledCount,
            targetState.difficulty,
            targetMode,
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
            const patched = applyRemoteCellPatch(cur.gameState, data);
            setGameState(patched);
            stateRef.current.gameState = patched;

            if (typeof data.value === 'number' && data.value > 0) {
                clearHintsForCell(data.index);
            }
            persistSnapshotIfNeeded(patched);
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
            }
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

                const shouldRecoverHost = cur.myRole === 'host' && localFilled <= localInitial && remoteFilled > localFilled;
                const shouldAdoptRemote = cur.myRole !== 'host' && (
                    remoteFilled !== localFilled
                    || remoteInitial !== localInitial
                    || data.gameState.status !== cur.gameState.status
                    || data.rematchRequestedBy !== cur.rematchRequestedBy
                );

                if (shouldRecoverHost || shouldAdoptRemote) {
                    const hydrated = hydrateGameState(data.gameState);
                    if (hydrated) {
                        setGameState(hydrated);
                        stateRef.current.gameState = hydrated;
                        persistSnapshotIfNeeded(hydrated, data.rematchRequestedBy);
                    }
                    if (data.rematchRequestedBy !== undefined) {
                        setRematchRequestedBy(data.rematchRequestedBy);
                    }
                }
            }
        }
    }, [announce, clearHintsForCell, persistSnapshotIfNeeded, syncLobbyProgress, triggerFloatingReaction]);

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
        }
    }, []);

    const handleGameMemberJoin = useCallback((member) => {
        const authoritative = onlineClientRef.current?.getGameMembers();
        if (authoritative) {
            setCurrentMembers(authoritative);
            stateRef.current.currentMembers = authoritative;
        } else {
            setCurrentMembers((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member]));
        }

        const cur = stateRef.current;
        if (cur.myRole === 'host') {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'sync', {
                gameState: serializeGameState(cur.gameState),
                rematchRequestedBy: cur.rematchRequestedBy,
                hints: Array.from(cur.hintsMap.entries()),
            });
            syncLobbyProgress();
        }
    }, [syncLobbyProgress]);

    const handleGameMemberLeave = useCallback((member) => {
        const authoritative = onlineClientRef.current?.getGameMembers();
        if (authoritative) {
            setCurrentMembers(authoritative);
            stateRef.current.currentMembers = authoritative;
        } else {
            setCurrentMembers((prev) => prev.filter((m) => m.id !== member.id));
        }

        if (member?.id) {
            setHintsMap((prev) => {
                if (!prev.has(member.id)) return prev;
                const next = new Map(prev);
                next.delete(member.id);
                return next;
            });
        }
    }, []);

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

        setCurrentMembers([]);
        setHintsMap(new Map());
        setRematchRequestedBy(null);

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
                filledCount: targetState.filledCount,
            });
        }
    }, [enterSpectatorView, handleGameMemberJoin, handleGameMemberLeave, handleGamePresenceChange, handleRemoteGameEvent]);

    const startNewSoloGame = useCallback((overrideDifficulty = null) => {
        const diff = overrideDifficulty || stateRef.current.difficulty;
        const hadExistingSoloRoom = Boolean(stateRef.current.onlineGameId) && stateRef.current.myRole === 'host' && stateRef.current.mode === 'solo';
        const roomId = hadExistingSoloRoom ? stateRef.current.onlineGameId : generateGameId();

        const nextState = createSudokuGame({ difficulty: diff });
        setMode('solo');
        setIsSpectating(false);
        setOnlineGameId(roomId);
        setMyRole('host');
        setSelectedIndex(null);
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
                filledCount: nextState.filledCount,
            });
        } else {
            onlineClientRef.current?.broadcastGameEvent(roomId, 'new-puzzle-accept', {
                gameState: serializeGameState(nextState),
            });
            syncLobbyProgress(nextState, 'solo');
        }

        announce(`New ${diff} Sudoku puzzle ready.`);
    }, [announce, handleGameMemberJoin, handleGameMemberLeave, handleGamePresenceChange, handleRemoteGameEvent, syncLobbyProgress]);

    const startNewOnlineGame = useCallback((overrideDifficulty = null) => {
        const diff = overrideDifficulty || stateRef.current.difficulty;
        const roomId = generateGameId();
        const nextState = createSudokuGame({ difficulty: diff });

        setMode('online');
        setIsSpectating(false);
        setOnlineGameId(roomId);
        setMyRole('host');
        setSelectedIndex(null);
        setNotesMode(false);
        setHintsMap(new Map());
        setRematchRequestedBy(null);
        setCurrentMembers([]);
        setGameState(nextState);

        stateRef.current.mode = 'online';
        stateRef.current.isSpectating = false;
        stateRef.current.onlineGameId = roomId;
        stateRef.current.myRole = 'host';
        stateRef.current.gameState = nextState;

        saveParticipantSession(roomId, 'host');
        saveOnlineGameSnapshot(roomId, nextState, null);
        updateBrowserUrl(`/games/${roomId}`);
        announce('Online Sudoku room created. Share the invite link with your partner or spectators.');

        onlineClientRef.current?.joinGameChannel(roomId, {
            role: 'host',
            gameMode: 'online',
            onEvent: handleRemoteGameEvent,
            onPresenceChange: handleGamePresenceChange,
            onMemberJoin: handleGameMemberJoin,
            onMemberLeave: handleGameMemberLeave,
        });

        onlineClientRef.current?.joinLobby({
            gameId: roomId,
            status: 'waiting',
            gameMode: 'online',
            difficulty: nextState.difficulty,
            filledCount: nextState.filledCount,
        });
    }, [announce, handleGameMemberJoin, handleGameMemberLeave, handleGamePresenceChange, handleRemoteGameEvent]);

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

                const hostMember = resolved.find((m) => m.role === 'host');
                const hasGuest = resolved.some((m) => m.role === 'guest');

                if (hostMember?.game_mode === 'solo') {
                    setSpectatedGameMode('solo');
                    enterSpectatorView(gameId, 'This is a live Solo match. Joined as spectator.');
                    replaceBrowserUrl(`/games/${gameId}?watch=1`);
                    return;
                }

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
            startNewSoloGame();
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

    // 1-second puzzle clock
    useEffect(() => {
        const timer = setInterval(() => {
            setGameState((prev) => {
                if (stateRef.current.isSpectating || stateRef.current.mode === 'watch' || prev.status === 'solved') {
                    return prev;
                }
                const next = { ...prev, elapsedSeconds: (prev.elapsedSeconds || 0) + 1 };
                stateRef.current.gameState = next;
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

    const applyPlayerDigit = useCallback((digit) => {
        const cur = stateRef.current;
        if (cur.isSpectating || cur.mode === 'watch' || selectedIndex === null || cur.gameState.status === 'solved') {
            return;
        }
        if (cur.gameState.givens[selectedIndex]) {
            announce('Given clue cells cannot be changed.');
            return;
        }

        const isBroadcaster = (cur.mode === 'solo' || cur.mode === 'online') && Boolean(cur.onlineGameId) && !cur.isSpectating;

        try {
            if (notesMode && digit !== 0) {
                const nextState = toggleCellNote(cur.gameState, selectedIndex, digit);
                setGameState(nextState);
                stateRef.current.gameState = nextState;
                if (isBroadcaster) {
                    onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cell-update', {
                        index: selectedIndex,
                        value: null,
                        notes: nextState.notes[selectedIndex],
                    });
                }
                persistSnapshotIfNeeded(nextState);
            } else {
                const nextState = setCellValue(cur.gameState, selectedIndex, digit);
                setGameState(nextState);
                stateRef.current.gameState = nextState;
                if (digit !== 0) {
                    clearHintsForCell(selectedIndex);
                }
                if (isBroadcaster) {
                    onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cell-update', {
                        index: selectedIndex,
                        value: digit,
                        notes: nextState.notes[selectedIndex],
                    });
                    syncLobbyProgress(nextState);
                }
                persistSnapshotIfNeeded(nextState);
            }
        } catch (err) {
            announce(err.message);
        }
    }, [announce, clearHintsForCell, notesMode, persistSnapshotIfNeeded, selectedIndex, syncLobbyProgress]);

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
            for (let i = 0; i < 81; i++) {
                const boardChanged = prevBoard[i] !== nextState.board[i];
                const notesChanged = prevNotes[i].join(',') !== nextState.notes[i].join(',');
                if (boardChanged || notesChanged) {
                    onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cell-update', {
                        index: i,
                        value: nextState.board[i],
                        notes: nextState.notes[i],
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

        let targetIdx = selectedIndex;
        if (
            targetIdx === null
            || cur.gameState.givens[targetIdx]
            || (cur.gameState.board[targetIdx] !== 0 && cur.gameState.board[targetIdx] === cur.gameState.solution[targetIdx])
        ) {
            const candidateIndices = [];
            for (let i = 0; i < 81; i++) {
                if (!cur.gameState.givens[i] && cur.gameState.board[i] !== cur.gameState.solution[i]) {
                    candidateIndices.push(i);
                }
            }
            if (candidateIndices.length === 0) return;
            targetIdx = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
        }

        const correctDigit = cur.gameState.solution[targetIdx];
        if (!correctDigit) return;

        setSelectedIndex(targetIdx);
        const nextState = setCellValue(cur.gameState, targetIdx, correctDigit);
        setGameState(nextState);
        stateRef.current.gameState = nextState;
        clearHintsForCell(targetIdx);

        const isBroadcaster = (cur.mode === 'solo' || cur.mode === 'online') && Boolean(cur.onlineGameId) && !cur.isSpectating;
        if (isBroadcaster) {
            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cell-update', {
                index: targetIdx,
                value: correctDigit,
                notes: [],
            });
            syncLobbyProgress(nextState);
        }

        const { row, col } = getCellCoords(targetIdx);
        announce(`Hint applied: Row ${row + 1}, Column ${col + 1} is ${correctDigit}.`);
        persistSnapshotIfNeeded(nextState);
    }, [announce, clearHintsForCell, persistSnapshotIfNeeded, selectedIndex, syncLobbyProgress]);

    const sendSpectatorHint = useCallback((value) => {
        const cur = stateRef.current;
        const client = onlineClientRef.current;
        if (!cur.isSpectating || !cur.onlineGameId || selectedIndex === null || !client) return;
        if (cur.gameState.board[selectedIndex] !== 0) {
            announce('Select an empty cell to suggest a hint.');
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
            const { row, col } = getCellCoords(selectedIndex);
            announce(value
                ? `Suggested ${value} at Row ${row + 1}, Column ${col + 1}.`
                : `Nudged players to check Row ${row + 1}, Column ${col + 1}.`);
        }
    }, [announce, selectedIndex]);

    const switchMode = useCallback((newMode) => {
        const cur = stateRef.current;
        if (cur.mode === newMode && !cur.isSpectating) return;

        onlineClientRef.current?.disconnect();

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

        if (newMode === 'online') {
            if (!cur.onlineGameId || cur.myRole === 'host') {
                startNewOnlineGame();
            } else {
                resumeOnlineGame(cur.onlineGameId);
            }
        } else {
            setOnlineGameId(null);
            setMyRole(null);
            setCurrentMembers([]);
            updateBrowserUrl('/');
            startNewSoloGame();
        }
    }, [openWatchDirectory, resumeOnlineGame, startNewOnlineGame, startNewSoloGame]);

    const exitSpectating = useCallback(() => {
        onlineClientRef.current?.leaveGameChannel();
        setOnlineGameId(null);
        setIsSpectating(false);
        setMode('watch');
        setCurrentMembers([]);
        setHintsMap(new Map());
        updateBrowserUrl('/');
        openWatchDirectory();
    }, [openWatchDirectory]);

    const handleNewPuzzleAction = useCallback(() => {
        const cur = stateRef.current;
        if (cur.mode !== 'online') {
            startNewSoloGame();
            return;
        }

        const partnerOnline = cur.currentMembers.some(
            (m) => m.role !== cur.myRole && (m.role === 'host' || m.role === 'guest'),
        );

        if (!partnerOnline || (cur.rematchRequestedBy && cur.rematchRequestedBy !== cur.myRole)) {
            const nextState = createSudokuGame({ difficulty: cur.difficulty });
            setGameState(nextState);
            stateRef.current.gameState = nextState;
            setSelectedIndex(null);
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
            announce('New puzzle requested. Waiting for partner...');
        }
    }, [announce, persistSnapshotIfNeeded, startNewSoloGame, syncLobbyProgress]);

    // Keyboard shortcuts & 9x9 arrow navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (mode === 'watch' && !isSpectating) return;
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

            if (e.key >= '1' && e.key <= '9') {
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

            if (selectedIndex === null) return;
            const { row, col } = getCellCoords(selectedIndex);
            let nextIndex = null;

            if (e.key === 'ArrowUp' && row > 0) nextIndex = (row - 1) * 9 + col;
            if (e.key === 'ArrowDown' && row < 8) nextIndex = (row + 1) * 9 + col;
            if (e.key === 'ArrowLeft' && col > 0) nextIndex = row * 9 + (col - 1);
            if (e.key === 'ArrowRight' && col < 8) nextIndex = row * 9 + (col + 1);

            if (nextIndex !== null) {
                e.preventDefault();
                setSelectedIndex(nextIndex);
                cellRefs.current[nextIndex]?.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [applyPlayerDigit, handleUndo, isSpectating, mode, selectedIndex, sendSpectatorHint]);

    const showBoard = mode !== 'watch' || isSpectating;
    const showHints = mode === 'solo' || mode === 'online' || isSpectating;
    const hintsByCell = useMemo(
        () => (showHints ? aggregateHintsByCell(hintsMap) : new Map()),
        [hintsMap, showHints],
    );

    const partnerOnline = currentMembers.some(
        (m) => m.role !== myRole && (m.role === 'host' || m.role === 'guest'),
    );

    let restartLabel = 'New Puzzle';
    let restartDisabled = false;
    if (mode === 'online') {
        if (!partnerOnline && gameState.status !== 'solved') {
            restartLabel = 'New Puzzle';
        } else if (rematchRequestedBy && rematchRequestedBy === myRole) {
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
                <h1 className="app-title">
                    Sudoku <span className="app-title__accent">Live</span>
                </h1>
                <p className="app-subtitle">Unique-solution puzzles with real-time co-op &amp; spectator hints</p>
            </header>

            <ModeTabs mode={mode} onSelectMode={switchMode} />

            {!isSpectating && mode !== 'watch' && (myRole !== 'guest' || mode === 'solo') && (
                <DifficultySelector
                    difficulty={difficulty}
                    onChange={(nextDiff) => {
                        setDifficulty(nextDiff);
                        localStorage.setItem('sudoku_difficulty', nextDiff);
                        if (mode === 'solo') {
                            startNewSoloGame(nextDiff);
                        }
                    }}
                />
            )}

            {mode === 'online' && !isSpectating && onlineGameId && (
                <OnlineInviteBox inviteUrl={buildInviteUrl(onlineGameId)} />
            )}

            {mode === 'watch' && !isSpectating && (
                <WatchDirectory
                    rooms={activeLobbyRooms}
                    onRefresh={openWatchDirectory}
                    onWatchGame={spectateGame}
                />
            )}

            {isSpectating && (
                <div id="spectator-bar" className="spectator-bar">
                    <span>
                        <strong>Spectating Live Match</strong> — Read-only board
                    </span>
                    <button
                        type="button"
                        id="exit-watch-btn"
                        className="spectator-bar__back-btn"
                        onClick={exitSpectating}
                    >
                        Back to Lobby
                    </button>
                </div>
            )}

            <StatusBanner
                connectionStatus={connectionStatus}
                mode={mode}
                isSpectating={isSpectating}
                myRole={myRole}
                currentMembers={currentMembers}
                spectatedGameMode={spectatedGameMode}
                gameState={gameState}
            />

            {showBoard && (
                <SudokuBoard
                    gameState={gameState}
                    selectedIndex={selectedIndex}
                    hintsByCell={hintsByCell}
                    floatingReactions={floatingReactions}
                    cellRefs={cellRefs}
                    onCellSelect={setSelectedIndex}
                />
            )}

            {showHints && (
                <SpectatorHintsFeed
                    hintsByCell={hintsByCell}
                    canApply={(mode === 'solo' || mode === 'online') && !isSpectating && gameState.status !== 'solved'}
                    onSelectHint={(idx) => {
                        setSelectedIndex(idx);
                        cellRefs.current[idx]?.focus();
                    }}
                    onApplyHint={(idx, digit) => {
                        const cur = stateRef.current;
                        if (cur.isSpectating || cur.mode === 'watch' || cur.gameState.status === 'solved') return;
                        setSelectedIndex(idx);
                        const nextState = setCellValue(cur.gameState, idx, digit);
                        setGameState(nextState);
                        stateRef.current.gameState = nextState;
                        clearHintsForCell(idx);
                        const isBroadcaster = (cur.mode === 'solo' || cur.mode === 'online') && Boolean(cur.onlineGameId) && !cur.isSpectating;
                        if (isBroadcaster) {
                            onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'cell-update', {
                                index: idx,
                                value: digit,
                                notes: nextState.notes[idx],
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
                    notesMode={notesMode}
                    canUndo={Boolean(gameState.history?.length) && gameState.status !== 'solved'}
                    onUndo={handleUndo}
                    onErase={() => applyPlayerDigit(0)}
                    onToggleNotes={() => setNotesMode((prev) => !prev)}
                    onLocalHint={handleLocalHint}
                    onDigit={applyPlayerDigit}
                />
            )}

            {isSpectating && (
                <WatcherInteractions
                    selectedIndex={selectedIndex}
                    board={gameState.board}
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

            {!isSpectating && mode !== 'watch' && (
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
                </div>
            )}

            <footer className="app-footer">
                <p>Zero-DB Real-Time Sudoku &bull; React + Capacitor &bull; Powered by Centrifugo</p>
            </footer>
        </div>
    );
}
