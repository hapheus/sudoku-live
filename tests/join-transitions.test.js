import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPendingJoinState, createJoinTransitions, respondToQueuedJoinRequests } from '../src/services/join-transitions.js';

function setup() {
    const stateRef = { current: { incomingJoinRequests: [], pendingJoinRequest: null } };
    const context = {
        stateRef, pendingJoinTimerRef: { current: null },
        onlineClientRef: { current: { clientId: 'viewer', broadcastGameEvent: vi.fn() } },
        setIncomingJoinRequests: vi.fn(), setPendingJoinRequest: vi.fn(),
    };
    return { context, state: stateRef.current, commands: createJoinTransitions(context) };
}
const request = (id) => ({ requestId: id, requesterId: `player-${id}`, gameId: 'room-1' });
afterEach(() => vi.useRealTimers());

describe('join transition ownership', () => {
    it('keeps a replacement request and its timeout when an old response arrives', () => {
        vi.useFakeTimers();
        const { commands, context, state } = setup();
        commands.begin(request('old'));
        const staleTimeout = vi.fn();
        context.pendingJoinTimerRef.current = setTimeout(staleTimeout, 100);
        commands.begin(request('new'));
        const currentTimeout = vi.fn();
        context.pendingJoinTimerRef.current = setTimeout(currentTimeout, 200);
        expect(commands.finish('old')).toBeNull();
        expect(state.pendingJoinRequest.requestId).toBe('new');
        vi.advanceTimersByTime(200);
        expect(staleTimeout).not.toHaveBeenCalled();
        expect(currentTimeout).toHaveBeenCalledOnce();
    });

    it('completes before callbacks can cancel again, and cancels a timer only once', () => {
        vi.useFakeTimers();
        const { commands, context, state } = setup();
        commands.begin(request('one'));
        const timeout = vi.fn();
        context.pendingJoinTimerRef.current = setTimeout(timeout, 100);
        context.onlineClientRef.current.broadcastGameEvent.mockImplementation(() => {
            expect(state.pendingJoinRequest).toBeNull();
            clearPendingJoinState(context);
        });
        expect(commands.cancel()).toEqual(request('one'));
        commands.cancel();
        vi.runAllTimers();
        expect(timeout).not.toHaveBeenCalled();
        expect(context.pendingJoinTimerRef.current).toBeNull();
        expect(context.onlineClientRef.current.broadcastGameEvent).toHaveBeenCalledExactlyOnceWith(
            'room-1', 'join-cancel', { requestId: 'one', requesterId: 'viewer' },
        );
    });

    it('deduplicates requests across command instances and consumes them before responding', () => {
        const { commands, context, state } = setup();
        const other = createJoinTransitions(context);
        expect(commands.enqueue(request('one'))).toBe(true);
        expect(other.enqueue(request('one'))).toBe(false);
        expect(other.enqueue({ ...request('two'), requesterId: 'player-one' })).toBe(false);
        other.enqueue(request('two'));
        context.onlineClientRef.current.broadcastGameEvent.mockImplementation(() => {
            expect(state.incomingJoinRequests.map(r => r.requestId)).toEqual(['two']);
        });
        commands.respondNext(true);
        expect(context.onlineClientRef.current.broadcastGameEvent).toHaveBeenCalledWith('room-1', 'join-response', {
            requestId: 'one', requesterId: 'player-one', accepted: true, reason: undefined,
        });
        other.remove(r => r.requesterId === 'player-two');
        commands.respondNext(false);
        expect(state.incomingJoinRequests).toEqual([]);
        expect(context.onlineClientRef.current.broadcastGameEvent).toHaveBeenCalledOnce();
    });

    it('clears queued requests before a reentrant policy change can answer them twice', () => {
        const { commands, context, state } = setup();
        commands.enqueue(request('one'));
        commands.enqueue(request('two'));
        context.setIncomingJoinRequests.mockImplementation(() => {
            expect(state.incomingJoinRequests).toEqual([]);
            respondToQueuedJoinRequests({ ...context, accepted: true });
        });
        respondToQueuedJoinRequests({ ...context, accepted: false, reason: 'disabled' });
        expect(context.onlineClientRef.current.broadcastGameEvent).toHaveBeenCalledTimes(2);
        expect(context.onlineClientRef.current.broadcastGameEvent).toHaveBeenLastCalledWith('room-1', 'join-response', {
            requestId: 'two', requesterId: 'player-two', accepted: false, reason: 'disabled',
        });
    });
});
