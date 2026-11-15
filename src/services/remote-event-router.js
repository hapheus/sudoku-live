import { applyRemoteCellPatch, hydrateGameState } from '../domain/sudoku-engine.js';
import { getBoardBackgroundById, selectBoardBackground } from './board-backgrounds.js';
import { normalizeJoinPolicy } from './join-settings.js';

function applySyncedVisuals(ctx, payload, boardLen, isSpectating) {
    if (payload.hostCursorIndex !== undefined) {
        const nextHostIdx = Number.isInteger(payload.hostCursorIndex)
            && payload.hostCursorIndex >= 0
            && payload.hostCursorIndex < boardLen
            ? payload.hostCursorIndex
            : null;
        ctx.setHostCursorIndex(nextHostIdx);
    }
    if (isSpectating && payload.hostActiveDigit !== undefined) {
        const nextDigit = Number.isInteger(payload.hostActiveDigit) && payload.hostActiveDigit >= 1
            ? payload.hostActiveDigit
            : null;
        ctx.setRemoteActiveDigit(nextDigit);
    }
    if (payload.hintPreview && Number.isInteger(payload.hintPreview.index)) {
        const delays = Array.isArray(payload.hintPreview.contextEntries)
            ? new Map(payload.hintPreview.contextEntries)
            : new Map([[payload.hintPreview.index, 0]]);
        ctx.triggerHintHighlight({ index: payload.hintPreview.index, contextDelays: delays }, 'preview');
    }
}

function resolveSyncedBackground(ctx, cur, boardBackgroundId) {
    if (typeof boardBackgroundId !== 'string' || boardBackgroundId === cur.boardBackground?.id) {
        return cur.boardBackground;
    }
    const resolvedBg = getBoardBackgroundById(boardBackgroundId);
    if (!resolvedBg) return cur.boardBackground;
    ctx.setBoardBackground(resolvedBg);
    ctx.stateRef.current.boardBackground = resolvedBg;
    return resolvedBg;
}

export function createRemoteEventRouter(ctx) {
    const handleInitOrSync = (data, cur) => {
        if (!data || !data.gameState) return;
        const hydrated = hydrateGameState(data.gameState);
        if (!hydrated) return;

        ctx.setGameState(hydrated);
        ctx.stateRef.current.gameState = hydrated;
        ctx.setSelectedIndex((prev) => (prev !== null && prev < hydrated.board.length ? prev : null));

        const syncedBg = resolveSyncedBackground(ctx, cur, data.boardBackgroundId);
        if (data.rematchRequestedBy !== undefined) {
            ctx.setRematchRequestedBy(data.rematchRequestedBy);
        }
        if (Array.isArray(data.hints)) {
            const nextHints = new Map();
            data.hints.forEach(([senderId, hint]) => {
                if (senderId && hint) nextHints.set(senderId, hint);
            });
            ctx.setHintsMap(nextHints);
        }
        applySyncedVisuals(ctx, data, hydrated.board.length, cur.isSpectating);
        ctx.persistSnapshotIfNeeded(hydrated, data.rematchRequestedBy, syncedBg?.id || null);
    };

    const handleJoinRequest = (data, cur) => {
        const myClientId = ctx.onlineClientRef.current?.clientId;
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
            ctx.onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'join-response', {
                requestId: data.requestId,
                requesterId: data.requesterId,
                accepted: false,
                reason: 'solved',
            });
            return;
        }

        if (cur.joinPolicy === 'disabled') {
            ctx.onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'join-response', {
                requestId: data.requestId,
                requesterId: data.requesterId,
                accepted: false,
                reason: 'disabled',
            });
            return;
        }

        if (cur.joinPolicy === 'auto') {
            ctx.onlineClientRef.current?.broadcastGameEvent(cur.onlineGameId, 'join-response', {
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
            ctx.setIncomingJoinRequests(nextQueue);
            ctx.stateRef.current.incomingJoinRequests = nextQueue;
            ctx.announce(cur.messages?.joinRequestTitle || 'Player wants to join');
        }
    };

    const handleJoinCancel = (data, cur) => {
        if (data?.requestId && cur.incomingJoinRequests.some((r) => r.requestId === data.requestId)) {
            const nextQueue = cur.incomingJoinRequests.filter((r) => r.requestId !== data.requestId);
            ctx.setIncomingJoinRequests(nextQueue);
            ctx.stateRef.current.incomingJoinRequests = nextQueue;
        }
    };

    const handleJoinResponse = (data, cur) => {
        const myClientId = ctx.onlineClientRef.current?.clientId;
        const pending = cur.pendingJoinRequest;
        if (!pending || data?.requestId !== pending.requestId || data?.requesterId !== myClientId) {
            return;
        }
        if (ctx.pendingJoinTimerRef.current) {
            clearTimeout(ctx.pendingJoinTimerRef.current);
            ctx.pendingJoinTimerRef.current = null;
        }
        ctx.setPendingJoinRequest(null);
        ctx.stateRef.current.pendingJoinRequest = null;

        if (data.accepted) {
            ctx.joinActionsRef.current.approveJoin(pending);
        } else {
            ctx.joinActionsRef.current.rejectJoin(pending, data.reason || 'declined');
        }
    };

    const handleCellUpdate = (data, cur) => {
        const prevBoard = cur.gameState.board;
        const patched = applyRemoteCellPatch(cur.gameState, {
            ...data,
            owner: data?.owner || null,
        });
        ctx.setGameState(patched);
        ctx.stateRef.current.gameState = patched;

        if (typeof data.value === 'number') {
            ctx.clearPendingHint(false);
        }
        if (typeof data.value === 'number' && data.value > 0) {
            ctx.clearHintsForCell(data.index);
            const unitCompleted = ctx.triggerUnitCelebration(prevBoard, patched, data.index);
            if (prevBoard[data.index] !== data.value) {
                ctx.playMoveSoundFeedback(patched, data.index, data.value, unitCompleted);
            }
            ctx.handleRemoteCellSolveForFistBump?.(data, patched);
        }
        if (patched.status === 'solved') {
            ctx.setSelectedIndex(null);
            ctx.setActiveDigit(null);
            ctx.stateRef.current.selectedIndex = null;
            ctx.stateRef.current.activeDigit = null;
        }
        ctx.persistSnapshotIfNeeded(patched);
    };

    const handleCursor = (data, cur) => {
        const myClientId = ctx.onlineClientRef.current?.clientId;
        if (!data || data.senderId === myClientId) return;
        if (data.role !== 'host' && data.role !== 'guest') return;

        const totalCells = cur.gameState.board?.length || 81;
        const nextIdx = Number.isInteger(data.index) && data.index >= 0 && data.index < totalCells ? data.index : null;
        if (data.role === 'host') {
            ctx.setHostCursorIndex(nextIdx);
            return;
        }
        const senderKey = data.senderId || 'guest';
        ctx.setGuestCursors((prev) => {
            const next = new Map(prev);
            if (nextIdx === null) {
                next.delete(senderKey);
            } else {
                next.set(senderKey, nextIdx);
            }
            return next;
        });
    };

    const handleHintHighlight = (data) => {
        const myClientId = ctx.onlineClientRef.current?.clientId;
        if (!data || data.senderId === myClientId) return;
        if (data.mode === 'clear') {
            ctx.clearHintHighlight();
            return;
        }
        if (Number.isInteger(data.index)) {
            const delays = Array.isArray(data.contextEntries)
                ? new Map(data.contextEntries)
                : new Map([[data.index, 0]]);
            ctx.triggerHintHighlight(
                { index: data.index, contextDelays: delays },
                data.mode === 'preview' ? 'preview' : 'solve',
            );
        }
    };

    const handleHint = (data, cur) => {
        if (!data || !data.senderId) return;
        ctx.setHintsMap((prev) => {
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
    };

    const handleNewPuzzleAccept = (data, cur) => {
        let nextState = cur.gameState;
        if (data && data.gameState) {
            const hydrated = hydrateGameState(data.gameState);
            if (hydrated) {
                nextState = hydrated;
                ctx.setGameState(hydrated);
                ctx.stateRef.current.gameState = hydrated;
            }
        }
        const nextBg = (typeof data?.boardBackgroundId === 'string' && getBoardBackgroundById(data.boardBackgroundId))
            || selectBoardBackground({ previousId: cur.boardBackground?.id, seed: cur.onlineGameId });
        ctx.setBoardBackground(nextBg);
        ctx.stateRef.current.boardBackground = nextBg;
        ctx.clearUnitCelebration();
        ctx.setSelectedIndex(null);
        ctx.setActiveDigit(null);
        ctx.setHostCursorIndex(null);
        ctx.setGuestCursors(new Map());
        ctx.setRemoteActiveDigit(null);
        ctx.setRematchRequestedBy(null);
        ctx.setHintsMap(new Map());
        ctx.persistSnapshotIfNeeded(nextState, null, nextBg?.id || null);
        ctx.syncLobbyProgress(nextState);
        ctx.announce('New puzzle started.');
    };

    const handlePing = (data, cur) => {
        if (!data || !data.gameState) return;
        const remoteFilled = data.gameState.board?.filter((c) => c > 0).length || 0;
        const localFilled = cur.gameState.filledCount || 0;
        const remoteInitial = data.gameState.givens?.filter(Boolean).length || 0;
        const localInitial = cur.gameState.givens?.filter(Boolean).length || 0;
        const variantDiffers = Array.isArray(data.gameState.board)
            && (data.gameState.board.length !== cur.gameState.board.length || data.gameState.variant !== cur.gameState.variant);
        const boardsDiffer = Array.isArray(data.gameState.board)
            && (variantDiffers || data.gameState.board.some((v, idx) => v !== cur.gameState.board[idx]));

        const syncedBg = resolveSyncedBackground(ctx, cur, data.boardBackgroundId);
        const givensDiffer = !Array.isArray(data.gameState.givens)
            || data.gameState.givens.length !== cur.gameState.givens.length
            || data.gameState.givens.some((g, idx) => Boolean(g) !== Boolean(cur.gameState.givens[idx]))
            || (Array.isArray(data.gameState.board)
                && cur.gameState.givens.some((g, idx) => g && data.gameState.board[idx] !== cur.gameState.board[idx]));
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
                ctx.setGameState(hydrated);
                ctx.stateRef.current.gameState = hydrated;
                ctx.setSelectedIndex((prev) => (prev !== null && prev < hydrated.board.length ? prev : null));
                ctx.persistSnapshotIfNeeded(hydrated, data.rematchRequestedBy, syncedBg?.id || null);
            }
            if (data.rematchRequestedBy !== undefined) {
                ctx.setRematchRequestedBy(data.rematchRequestedBy);
            }
        }
        if (cur.myRole !== 'host') {
            applySyncedVisuals(ctx, data, cur.gameState.board?.length || 81, cur.isSpectating);
        }
    };

    const handlers = {
        init: handleInitOrSync,
        sync: handleInitOrSync,
        'join-policy': (data, cur) => {
            if (data?.joinPolicy && cur.isSpectating) {
                ctx.setHostJoinPolicy(normalizeJoinPolicy(data.joinPolicy));
            }
        },
        'join-request': handleJoinRequest,
        'join-cancel': handleJoinCancel,
        'join-response': handleJoinResponse,
        'cell-update': handleCellUpdate,
        cursor: handleCursor,
        'active-digit': (data, cur) => {
            const myClientId = ctx.onlineClientRef.current?.clientId;
            if (!data || data.senderId === myClientId || !cur.isSpectating) return;
            const nextDigit = Number.isInteger(data.digit) && data.digit >= 1 ? data.digit : null;
            ctx.setRemoteActiveDigit(nextDigit);
        },
        'hint-highlight': (data) => handleHintHighlight(data),
        hint: handleHint,
        reaction: (data) => {
            if (data && data.emoji) {
                ctx.triggerFloatingReaction(data.emoji);
            }
        },
        'fist-bump': (data) => {
            if (data && Number.isInteger(data.index)) {
                ctx.triggerFistBumpEffect?.({
                    index: data.index,
                    phraseKey: data.phraseKey === 'fistBumpAmazing' ? 'fistBumpAmazing' : 'fistBumpAwesome',
                });
            }
        },
        'new-puzzle-request': (data, cur) => {
            if (data && (data.role === 'host' || data.role === 'guest')) {
                ctx.setRematchRequestedBy(data.role);
                ctx.persistSnapshotIfNeeded(cur.gameState, data.role);
                if (data.role !== cur.myRole) {
                    ctx.showFeedback('Partner requested a new puzzle. Click Accept New Puzzle to confirm.');
                }
            }
        },
        'new-puzzle-cancel': (_data, cur) => {
            ctx.setRematchRequestedBy(null);
            ctx.persistSnapshotIfNeeded(cur.gameState, null);
            ctx.showFeedback('New puzzle request cancelled.');
        },
        'new-puzzle-accept': handleNewPuzzleAccept,
        ping: handlePing,
    };

    return (type, data) => {
        const handler = handlers[type];
        if (!handler) return;
        handler(data, ctx.stateRef.current);
    };
}
