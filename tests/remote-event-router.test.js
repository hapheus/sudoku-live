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
});
