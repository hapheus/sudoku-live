/**
 * @typedef {object} JoinRequest
 * @property {string} requestId
 * @property {string} gameId
 * @property {string} [requesterId] - Incoming host-queue requests only.
 * @property {string | null} [requesterName]
 * @property {boolean} [fromSpectating] - Outgoing requester state only.
 * @property {object | null} [gameStateSnapshot]
 */

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

    stateRef.current.incomingJoinRequests = [];
    setIncomingJoinRequests([]);
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
    return createJoinTransitions({ pendingJoinTimerRef, stateRef, onlineClientRef, setPendingJoinRequest }).cancel();
}

/**
 * Owns join-state writes before callbacks or transport effects can re-enter.
 * All instances share the supplied live refs. The pending timer is cleared on completion.
 *
 * @param {object} context - Live refs and controlled request setters.
 * @returns {{
 *   begin: (request: JoinRequest) => void,
 *   finish: (requestId?: string | null) => JoinRequest | null,
 *   cancel: () => JoinRequest | null,
 *   enqueue: (request: JoinRequest) => boolean,
 *   remove: (predicate: (request: JoinRequest) => boolean) => void,
 *   clearQueue: () => void,
 *   respondNext: (accepted: boolean) => void
 * }}
 */
export function createJoinTransitions(context) {
    const { stateRef, onlineClientRef, pendingJoinTimerRef,
        setIncomingJoinRequests, setPendingJoinRequest } = context;
    const writeQueue = (queue) => {
        stateRef.current.incomingJoinRequests = queue;
        setIncomingJoinRequests(queue);
    };
    const finish = (requestId = null) => {
        const pending = stateRef.current.pendingJoinRequest;
        if (requestId !== null && pending?.requestId !== requestId) return null;
        if (pendingJoinTimerRef.current) {
            clearTimeout(pendingJoinTimerRef.current);
            pendingJoinTimerRef.current = null;
        }
        if (pending) {
            stateRef.current.pendingJoinRequest = null;
            setPendingJoinRequest(null);
        }
        return pending;
    };
    return {
        begin(request) {
            finish();
            stateRef.current.pendingJoinRequest = request;
            setPendingJoinRequest(request);
        },
        clearQueue() { writeQueue([]); },
        finish,
        cancel() {
            const pending = finish();
            if (pending) onlineClientRef.current?.broadcastGameEvent(pending.gameId, 'join-cancel', {
                requestId: pending.requestId,
                requesterId: onlineClientRef.current?.clientId,
            });
            return pending;
        },
        enqueue(request) {
            const queue = stateRef.current.incomingJoinRequests || [];
            if (queue.some(r => r.requestId === request.requestId || r.requesterId === request.requesterId)) return false;
            writeQueue([...queue, request]);
            return true;
        },
        remove(predicate) {
            const queue = stateRef.current.incomingJoinRequests || [];
            const next = queue.filter(request => !predicate(request));
            if (next.length !== queue.length) writeQueue(next);
        },
        respondNext(accepted) {
            const [request, ...rest] = stateRef.current.incomingJoinRequests || [];
            if (!request) return;
            writeQueue(rest);
            onlineClientRef.current?.broadcastGameEvent(request.gameId, 'join-response', {
                requestId: request.requestId,
                requesterId: request.requesterId,
                accepted: Boolean(accepted),
                reason: accepted ? undefined : 'declined',
            });
        },
    };
}
