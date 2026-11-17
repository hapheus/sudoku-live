import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
    getVariantSpec,
    inferVariantFromBoardLength,
    normalizeVariant,
} from '../domain/sudoku-variants.js';
import {
    createSudokuGame,
    serializeGameState,
} from '../domain/sudoku-engine.js';
import {
    generateEventId,
    generateGameId,
    isValidGameId,
    OnlineGameClient,
} from '../services/online-game-client.js';
import { createRemoteEventRouter } from '../services/remote-event-router.js';
import { normalizeJoinPolicy } from '../services/join-settings.js';
import { validateIncomingGameMessage } from '../services/message-security.js';
import { checkProtocolCompatibility } from '../services/multiplayer-protocol.js';
import {
    loadOnlineGameSnapshot,
    loadParticipantSession,
    loadSoloGameSnapshot,
    saveOnlineGameSnapshot,
    saveParticipantSession,
    saveSoloGameSnapshot,
} from '../services/online-state-storage.js';
import {
    getBoardBackgroundById,
    selectBoardBackground,
} from '../services/board-backgrounds.js';
import { replaceBrowserUrl, updateBrowserUrl } from '../utils/app-routing.js';
import { setStorageItem } from '../utils/storage.js';
import { buildHintPreviewPayload } from './useGameTimersAndModals.js';

/**
 * Broadcasts a join-response for every queued incoming join request and clears the queue.
 */
export function respondToQueuedJoinRequests({
    stateRef,
    onlineClientRef,
    setIncomingJoinRequests,
    accepted,
    reason = 'declined',
}) {
    const queued = stateRef.current.incomingJoinRequests;
    if (!queued || queued.length === 0) return;

    setIncomingJoinRequests([]);
    stateRef.current.incomingJoinRequests = [];
    for (const req of queued) {
        onlineClientRef.current?.broadcastGameEvent(req.gameId, 'join-response', {
            requestId: req.requestId,
            requesterId: req.requesterId,
            accepted: Boolean(accepted),
            reason: accepted ? undefined : reason,
        });
    }
}

/**
 * Clears any pending join timeout and broadcasts join-cancel if a join request is active.
 */
export function clearPendingJoinState({
    pendingJoinTimerRef,
    stateRef,
    onlineClientRef,
    setPendingJoinRequest,
}) {
    if (pendingJoinTimerRef.current) {
        clearTimeout(pendingJoinTimerRef.current);
        pendingJoinTimerRef.current = null;
    }
    const pending = stateRef.current.pendingJoinRequest;
    if (!pending) return null;

    setPendingJoinRequest(null);
    stateRef.current.pendingJoinRequest = null;
    onlineClientRef.current?.broadcastGameEvent(pending.gameId, 'join-cancel', {
        requestId: pending.requestId,
        requesterId: onlineClientRef.current?.clientId,
    });
    return pending;
}

/**
 * Manages WebSocket session lifecycle, persistence, lobby sync, presence, spectating, and co-op joins.
 */
function resolveSoloRoomId(saved, isRestoringSaved, keepActiveRoom, currentRoomId) {
    if (isRestoringSaved) return saved.roomId || generateGameId();
    return keepActiveRoom ? currentRoomId : generateGameId();
}

export function useOnlineSession({
    initialRoute,
    playerName = null,
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
    setRemoteRetroMode = null,
    triggerHintHighlight,
    clearHintHighlight,
    clearUnitCelebration,
    clearPendingHint,
    triggerUnitCelebration,
    playMoveSoundFeedback,
    triggerFloatingReaction,
    triggerFistBumpEffect = null,
    handleRemoteCellSolveForFistBump = null,
    ticTacToe = null,
    announce,
    showFeedback,
}) {
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
    }, [stateRef]);

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
        const status = targetState.status === 'solved' ? 'solved' : 'in_progress';

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
                ticTacToe: Boolean(ticTacToe?.challengeRef.current.game),
                hostName: stateRef.current.playerName,
                elapsedSeconds: targetState.elapsedSeconds || 0,
            },
        );
    }, [onlineClientRef, stateRef, ticTacToe]);

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
    }, [onlineClientRef, setActiveLobbyRooms]);

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
    }, [onlineClientRef, setIncomingJoinRequests, stateRef]);

    useEffect(() => {
        const cur = stateRef.current;
        if (cur.myRole === 'host' && !cur.isSpectating && cur.isPlayingGame) {
            onlineClientRef.current?.updateGameJoinPolicy(joinPolicy);
            syncLobbyProgress();

            if (cur.incomingJoinRequests.length > 0 && (joinPolicy === 'disabled' || joinPolicy === 'auto')) {
                respondToQueuedJoinRequests({
                    stateRef,
                    onlineClientRef,
                    setIncomingJoinRequests,
                    accepted: joinPolicy === 'auto',
                    reason: 'disabled',
                });
            }
        }
    }, [joinPolicy, onlineClientRef, setIncomingJoinRequests, stateRef, syncLobbyProgress]);

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
    }, [setHintsMap]);

    const routeRemoteGameEvent = useMemo(() => createRemoteEventRouter({
        stateRef,
        onlineClientRef,
        pendingJoinTimerRef,
        joinActionsRef,
        setGameState,
        setSelectedIndex,
        setActiveDigit,
        setBoardBackground,
        setRematchRequestedBy,
        setHintsMap,
        setHostCursorIndex,
        setGuestCursors,
        setRemoteActiveDigit,
        setHostJoinPolicy,
        setIncomingJoinRequests,
        setPendingJoinRequest,
        setRemoteRetroMode,
        triggerHintHighlight,
        clearHintHighlight,
        clearUnitCelebration,
        clearPendingHint,
        clearHintsForCell,
        triggerUnitCelebration,
        playMoveSoundFeedback,
        triggerFloatingReaction,
        triggerFistBumpEffect,
        handleRemoteCellSolveForFistBump,
        persistSnapshotIfNeeded,
        syncLobbyProgress,
        announce,
        showFeedback,
    }), [
        announce,
        clearHintHighlight,
        clearHintsForCell,
        clearPendingHint,
        clearUnitCelebration,
        onlineClientRef,
        pendingJoinTimerRef,
        persistSnapshotIfNeeded,
        playMoveSoundFeedback,
        setActiveDigit,
        setBoardBackground,
        setGameState,
        setGuestCursors,
        setHintsMap,
        setHostCursorIndex,
        setHostJoinPolicy,
        setIncomingJoinRequests,
        setPendingJoinRequest,
        setRematchRequestedBy,
        setRemoteActiveDigit,
        setRemoteRetroMode,
        setSelectedIndex,
        showFeedback,
        stateRef,
        syncLobbyProgress,
        triggerFloatingReaction,
        triggerFistBumpEffect,
        handleRemoteCellSolveForFistBump,
        triggerHintHighlight,
        triggerUnitCelebration,
    ]);

    const handleRemoteGameEvent = useCallback((type, data) => {
        const totalCells = stateRef.current.gameState?.board?.length || 81;
        const maxDigit = totalCells === 36 ? 6 : 9;
        if (!validateIncomingGameMessage(type, data, totalCells, maxDigit)) return;
        if (type.startsWith('tic-tac-toe-')) {
            ticTacToe?.onEvent(type, data);
            return;
        }
        if (type === 'new-puzzle-accept') ticTacToe?.reset();
        if ((type === 'sync' || type === 'init' || type === 'ping') && data?.ticTacToe && stateRef.current.myRole !== 'host') {
            ticTacToe?.update(data.ticTacToe);
        }
        routeRemoteGameEvent(type, data);
    }, [routeRemoteGameEvent, stateRef, ticTacToe]);

    const buildSyncPayload = useCallback(() => {
        const cur = stateRef.current;
        return {
            gameState: serializeGameState(cur.gameState),
            ticTacToe: cur.myRole === 'host' ? ticTacToe?.challengeRef.current : undefined,
            isRetroMode: Boolean(cur.isRetroMode),
            boardBackgroundId: cur.boardBackground?.id || null,
            rematchRequestedBy: cur.rematchRequestedBy,
            hints: Array.from(cur.hintsMap.entries()),
            hostCursorIndex: cur.myRole === 'host' ? cur.selectedIndex : undefined,
            hostActiveDigit: cur.myRole === 'host' ? cur.activeDigit : undefined,
            hintPreview: cur.myRole === 'host' ? buildHintPreviewPayload(cur.pendingHint) : null,
        };
    }, [stateRef, ticTacToe]);

    const handleGamePresenceChange = useCallback((members) => {
        const resolved = onlineClientRef.current?.getGameMembers() || members || [];
        setCurrentMembers(resolved);
        stateRef.current.currentMembers = resolved;
        ticTacToe?.onMembersChange(resolved);

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
    }, [buildSyncPayload, onlineClientRef, setCurrentMembers, setHostJoinPolicy, stateRef, syncLobbyProgress, ticTacToe]);

    const handleGameMemberJoin = useCallback((member) => {
        const prevMembers = stateRef.current.currentMembers;
        const authoritative = onlineClientRef.current?.getGameMembers();
        const nextMembers = authoritative || (prevMembers.some((m) => m.id === member.id) ? prevMembers : [...prevMembers, member]);
        setCurrentMembers(nextMembers);
        stateRef.current.currentMembers = nextMembers;
        ticTacToe?.onMembersChange(nextMembers);

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
    }, [
        buildSyncPayload,
        onlineClientRef,
        setCurrentMembers,
        setHostJoinPolicy,
        setIncomingJoinRequests,
        showFeedback,
        stateRef,
        syncLobbyProgress,
        ticTacToe,
    ]);

    const handleGameMemberLeave = useCallback((member) => {
        const authoritative = onlineClientRef.current?.getGameMembers();
        if (authoritative) {
            setCurrentMembers(authoritative);
            stateRef.current.currentMembers = authoritative;
            ticTacToe?.onMembersChange(authoritative);
        } else {
            const remaining = stateRef.current.currentMembers.filter((m) => m.id !== member.id);
            stateRef.current.currentMembers = remaining;
            setCurrentMembers(remaining);
            ticTacToe?.onMembersChange(remaining);
        }

        if (member?.role === 'host') {
            ticTacToe?.onHostLeave();
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
    }, [
        onlineClientRef,
        setCurrentMembers,
        setGuestCursors,
        setHintsMap,
        setHostCursorIndex,
        setIncomingJoinRequests,
        setRemoteActiveDigit,
        stateRef,
        syncLobbyProgress,
        ticTacToe,
    ]);

    const handleIncompatibleClient = useCallback((compat) => {
        const m = stateRef.current.messages;
        if (compat?.requiresUpdate === 'local') {
            showFeedback(m?.protocolUpdateRequired || 'A newer version of Sudoku Shift is required for this match. Please update the app.');
        } else if (compat?.requiresUpdate === 'remote') {
            showFeedback(m?.protocolPartnerOutdated || 'Another player is using an older app version. Some features may be unavailable.');
        }
    }, [showFeedback, stateRef]);

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
    }, [announce, setIsSpectating, setMode, setMyRole, setNavTab, setOnlineGameId, setSelectedIndex, setSpectatedGameMode, stateRef]);

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
        setRemoteRetroMode?.(false);
        const lobbyRoom = stateRef.current.activeLobbyRooms.find((r) => r.game_id === gameId);
        if (lobbyRoom) {
            const compat = checkProtocolCompatibility(lobbyRoom);
            if (!compat.compatible && compat.requiresUpdate === 'local') {
                handleIncompatibleClient(compat);
                return;
            }
        }
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
            onIncompatibleClient: handleIncompatibleClient,
        });
    }, [
        clearUnitCelebration,
        enterSpectatorView,
        handleGameMemberJoin,
        handleGameMemberLeave,
        handleGamePresenceChange,
        handleIncompatibleClient,
        handleRemoteGameEvent,
        onlineClientRef,
        pendingJoinTimerRef,
        setBoardBackground,
        setCurrentMembers,
        setGameState,
        setHintsMap,
        setHostJoinPolicy,
        setPendingJoinRequest,
        setRemoteRetroMode,
        setRematchRequestedBy,
        setSpectatedGameMode,
        stateRef,
    ]);

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
            onIncompatibleClient: handleIncompatibleClient,
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
                hostName: stateRef.current.playerName,
                elapsedSeconds: targetState.elapsedSeconds || 0,
            });
        }
    }, [
        handleGameMemberJoin,
        handleGameMemberLeave,
        handleGamePresenceChange,
        handleIncompatibleClient,
        handleRemoteGameEvent,
        onlineClientRef,
        setIsPlayingGame,
        setIsSpectating,
        setMode,
        setMyRole,
        setNavTab,
        setOnlineGameId,
        stateRef,
    ]);

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
        setRemoteRetroMode?.(false);

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
    }, [
        clearUnitCelebration,
        joinAsOnlinePlayer,
        onlineClientRef,
        setActiveDigit,
        setGameState,
        setGuestCursors,
        setHintsMap,
        setHostCursorIndex,
        setIsPlayingGame,
        setNavTab,
        setNotesMode,
        setRematchRequestedBy,
        setRemoteActiveDigit,
        setRemoteRetroMode,
        setSelectedIndex,
        showFeedback,
        stateRef,
    ]);

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
        const pending = clearPendingJoinState({
            pendingJoinTimerRef,
            stateRef,
            onlineClientRef,
            setPendingJoinRequest,
        });
        if (!pending) return;

        if (!pending.fromSpectating) {
            onlineClientRef.current?.leaveGameChannel();
            openWatchDirectory();
        }
    }, [onlineClientRef, openWatchDirectory, pendingJoinTimerRef, setPendingJoinRequest, stateRef]);

    const joinWatchGame = useCallback((gameId, knownJoinPolicy = null) => {
        if (!isValidGameId(gameId)) return;

        const cur = stateRef.current;
        const fromSpectatingSameRoom = cur.isSpectating && cur.onlineGameId === gameId;
        const lobbyRoom = cur.activeLobbyRooms.find((r) => r.game_id === gameId);
        if (lobbyRoom) {
            const compat = checkProtocolCompatibility(lobbyRoom);
            if (!compat.compatible && compat.requiresUpdate === 'local') {
                handleIncompatibleClient(compat);
                return;
            }
        }
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
                requesterName: stateRef.current.playerName,
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
    }, [
        completeApprovedJoin,
        handleGameMemberJoin,
        handleGameMemberLeave,
        handleGamePresenceChange,
        handleIncompatibleClient,
        handleRemoteGameEvent,
        hostJoinPolicy,
        onlineClientRef,
        openWatchDirectory,
        pendingJoinTimerRef,
        setPendingJoinRequest,
        setRematchRequestedBy,
        showFeedback,
        stateRef,
    ]);

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
                hostName: stateRef.current.playerName,
                elapsedSeconds: targetState.elapsedSeconds || 0,
            });
        } else {
            syncLobbyProgress(targetState, resolvedMode);
        }
    }, [
        handleGameMemberJoin,
        handleGameMemberLeave,
        handleGamePresenceChange,
        handleRemoteGameEvent,
        onlineClientRef,
        stateRef,
        syncLobbyProgress,
    ]);

    const startNewSoloGame = useCallback((
        overrideDifficulty = null,
        overrideVariant = null,
        { restoreSaved = false, startSession = true } = {},
    ) => {
        clearUnitCelebration();
        if (!restoreSaved) ticTacToe?.reset();
        const saved = restoreSaved ? loadSoloGameSnapshot() : null;
        const isRestoringSaved = Boolean(saved && saved.gameState.status !== 'solved');
        const diff = isRestoringSaved
            ? (saved.gameState.requestedDifficulty || saved.gameState.difficulty)
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
        const roomId = resolveSoloRoomId(saved, isRestoringSaved, keepActiveRoom, stateRef.current.onlineGameId);

        const nextState = isRestoringSaved
            ? saved.gameState
            : createSudokuGame({ difficulty: diff, variant: varId });
        const nextBg = isRestoringSaved
            ? (getBoardBackgroundById(saved?.boardBackgroundId) || stateRef.current.boardBackground || selectBoardBackground({ seed: roomId }))
            : selectBoardBackground({ previousId: stateRef.current.boardBackground?.id });

        if (isRestoringSaved) {
            setDifficulty(diff);
            setStorageItem('sudoku_difficulty', diff);
            const restoredVar = normalizeVariant(nextState.variant || inferVariantFromBoardLength(nextState.board?.length));
            setVariant(restoredVar);
            setStorageItem('sudoku_variant', restoredVar);
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
        setRemoteRetroMode?.(false);
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
    }, [
        announce,
        clearUnitCelebration,
        ensureHostOnlineSession,
        onlineClientRef,
        setActiveDigit,
        setBoardBackground,
        setCurrentMembers,
        setDifficulty,
        setGameState,
        setGuestCursors,
        setHintsMap,
        setHostCursorIndex,
        setIncomingJoinRequests,
        setIsSpectating,
        setMode,
        setMyRole,
        setNotesMode,
        setOnlineGameId,
        setRematchRequestedBy,
        setRemoteActiveDigit,
        setRemoteRetroMode,
        setSelectedIndex,
        setVariant,
        stateRef,
        ticTacToe,
    ]);

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
            onIncompatibleClient: handleIncompatibleClient,
        });
    }, [
        enterSpectatorView,
        handleGameMemberJoin,
        handleGameMemberLeave,
        handleIncompatibleClient,
        handleRemoteGameEvent,
        joinAsOnlinePlayer,
        onlineClientRef,
        setBoardBackground,
        setCurrentMembers,
        setGameState,
        setHostJoinPolicy,
        setMyRole,
        setRematchRequestedBy,
        stateRef,
    ]);

    const handleReconnect = useCallback(() => {
        onlineClientRef.current?.client?.connect();
        showFeedback('Reconnecting to live server...');
    }, [onlineClientRef, showFeedback]);

    useEffect(() => {
        if (playerName) {
            onlineClientRef.current?.updatePlayerName?.(playerName);
        }
    }, [onlineClientRef, playerName]);

    useEffect(() => {
        const client = new OnlineGameClient({
            playerName,
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
        const handlePageHide = (event) => {
            if (event.persisted) client.suspend();
            else cleanup();
        };
        const handlePageShow = (event) => {
            if (event.persisted) client.resume();
        };
        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('pageshow', handlePageShow);

        return () => {
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('pageshow', handlePageShow);
            cleanup();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
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
    };
}
