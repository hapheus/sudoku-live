import { describe, expect, it, vi } from 'vitest';
import { createRemoteEventRouter } from '../src/services/remote-event-router.js';

describe('remote-event-router', () => {
    it('routes join-policy and reaction events cleanly', () => {
        const setHostJoinPolicy = vi.fn();
        const triggerFloatingReaction = vi.fn();
        const router = createRemoteEventRouter({
            stateRef: { current: { isSpectating: true } },
            onlineClientRef: { current: { clientId: 'c1' } },
            setHostJoinPolicy,
            triggerFloatingReaction,
        });

        router('join-policy', { joinPolicy: 'auto' });
        expect(setHostJoinPolicy).toHaveBeenCalledWith('auto');

        router('reaction', { emoji: '🔥' });
        expect(triggerFloatingReaction).toHaveBeenCalledWith('🔥');
    });

    it('ignores unknown event types safely', () => {
        const router = createRemoteEventRouter({
            stateRef: { current: {} },
            onlineClientRef: { current: null },
        });
        expect(() => router('unknown-event', {})).not.toThrow();
    });

    it('routes fist-bump events to triggerFistBumpEffect for players and spectators', () => {
        const triggerFistBumpEffect = vi.fn();
        const router = createRemoteEventRouter({
            stateRef: { current: { isSpectating: true } },
            onlineClientRef: { current: { clientId: 'spectator-1' } },
            triggerFistBumpEffect,
        });

        router('fist-bump', { index: 4, phraseKey: 'fistBumpAmazing', senderId: 'host-1' });
        expect(triggerFistBumpEffect).toHaveBeenCalledWith({
            index: 4,
            phraseKey: 'fistBumpAmazing',
        });
    });

    it('captures requesterName on incoming join-request and syncs elapsedSeconds on ping for non-hosts', () => {
        const setIncomingJoinRequests = vi.fn();
        const announce = vi.fn();
        const setGameState = vi.fn();
        const board = Array(81).fill(0);
        const givens = Array(81).fill(false);

        const stateRef = {
            current: {
                myRole: 'host',
                isSpectating: false,
                isPlayingGame: true,
                onlineGameId: 'room-1',
                joinPolicy: 'confirm',
                incomingJoinRequests: [],
                gameState: {
                    board,
                    givens,
                    filledCount: 0,
                    status: 'playing',
                    elapsedSeconds: 10,
                    variant: '3x3',
                },
            },
        };

        const router = createRemoteEventRouter({
            stateRef,
            onlineClientRef: { current: { clientId: 'host-1' } },
            setIncomingJoinRequests,
            announce,
            setGameState,
            setSelectedIndex: vi.fn(),
            persistSnapshotIfNeeded: vi.fn(),
        });

        router('join-request', {
            requestId: 'req-1',
            requesterId: 'guest-1',
            requesterName: 'BrightPanda',
        });

        expect(setIncomingJoinRequests).toHaveBeenCalledWith([
            {
                requestId: 'req-1',
                requesterId: 'guest-1',
                requesterName: 'BrightPanda',
                gameId: 'room-1',
            },
        ]);

        // Now test spectator/guest receiving ping with updated elapsedSeconds
        stateRef.current.myRole = 'spectator';
        stateRef.current.isSpectating = true;
        router('ping', {
            gameState: {
                board,
                givens,
                status: 'playing',
                elapsedSeconds: 42,
                variant: '3x3',
            },
        });

        expect(setGameState).toHaveBeenCalled();
        expect(stateRef.current.gameState.elapsedSeconds).toBe(42);
    });
});
