import { describe, expect, it } from 'vitest';
import { createRoomAuthority } from '../src/services/room-authority.js';

describe('anonymous room action authority', () => {
    it('rejects unannounced and unapproved mutations and pins the first host', () => {
        const policy = createRoomAuthority();
        expect(policy.allows('unknown', 'cell-update', { senderId: 'unknown' })).toBe(false);
        policy.announce('h', { id: 'host', role: 'host' });
        expect(policy.announce('s', { id: 'viewer', role: 'guest' })).toBe('spectator');
        expect(policy.announce('rogue', { id: 'other', role: 'host' })).toBe('spectator');
        for (const type of ['cell-update', 'sync', 'join-response', 'new-puzzle-accept', 'tic-tac-toe-state']) {
            expect(policy.allows('s', type, { senderId: 'viewer', role: 'host' })).toBe(false);
            expect(policy.allows('rogue', type, { senderId: 'other' })).toBe(false);
        }
        expect(policy.allows('s', 'hint', { senderId: 'viewer' })).toBe(true);
        expect(policy.allows('s', 'reaction', { senderId: 'viewer' })).toBe(true);
    });
    it('admits only a host-approved requester and retains approval across transports', () => {
        const policy = createRoomAuthority();
        policy.announce('h', { id: 'host', role: 'host' });
        policy.announce('s', { id: 'viewer', role: 'spectator' });
        const request = { senderId: 'viewer', requestId: 'req', requesterId: 'viewer' };
        expect(policy.allows('s', 'join-request', { ...request, requesterId: 'other' })).toBe(false);
        policy.observe('join-request', request);
        const decision = { senderId: 'host', requestId: 'req', requesterId: 'viewer', accepted: true };
        expect(policy.allows('s', 'join-response', decision)).toBe(false);
        expect(policy.allows('h', 'join-response', decision)).toBe(true);
        policy.observe('join-response', decision);
        policy.leave('s');
        expect(policy.announce('g', { id: 'viewer', role: 'guest' })).toBe('guest');
        expect(policy.allows('g', 'cell-update', { senderId: 'viewer', owner: 'guest' })).toBe(true);
        expect(policy.allows('g', 'cell-update', { senderId: 'viewer', owner: 'host' })).toBe(false);
        expect(policy.allows('g', 'cursor', { senderId: 'viewer', role: 'host' })).toBe(false);
        expect(policy.allows('g', 'tic-tac-toe-move', { senderId: 'viewer', playerId: 'host' })).toBe(false);
        policy.leave('h');
        expect(policy.allows('g', 'sync', { senderId: 'viewer' })).toBe(true);
        expect(policy.announce('new', { id: 'other', role: 'host' })).toBe('spectator');
        expect(policy.announce('h2', { id: 'host', role: 'host' })).toBe('host');
    });
    it('uses host auto policy and host-carried approvals for late members', () => {
        const policy = createRoomAuthority();
        policy.announce('h', { id: 'host', role: 'host', join_policy: 'auto' });
        expect(policy.announce('g', { id: 'guest', role: 'guest' })).toBe('guest');
        policy.announce('h', { id: 'host', role: 'host', join_policy: 'confirm', approvedGuestIds: ['late'] });
        expect(policy.announce('l', { id: 'late', role: 'guest' })).toBe('guest');
        expect(policy.announce('u', { id: 'unapproved', role: 'guest', approvedGuestIds: ['unapproved'] })).toBe('spectator');
    });
    it('permits approved guest succession only after the host leaves', () => {
        const policy = createRoomAuthority();
        policy.announce('h', { id: 'host', role: 'host', join_policy: 'auto' });
        policy.announce('g', { id: 'guest', role: 'guest' });
        expect(policy.announce('g', { id: 'guest', role: 'host' })).toBe('spectator');
        policy.leave('h');
        expect(policy.announce('g', { id: 'guest', role: 'host' })).toBe('host');
        expect(policy.allows('g', 'init', { senderId: 'guest' })).toBe(true);
    });
    it('binds request IDs and cancellations to the requester', () => {
        const policy = createRoomAuthority();
        policy.announce('a', { id: 'alice', role: 'spectator' });
        policy.announce('b', { id: 'bobby', role: 'spectator' });
        policy.observe('join-request', { requestId: 'request', requesterId: 'alice' });
        for (const type of ['join-request', 'join-cancel']) {
            expect(policy.allows('b', type, { senderId: 'bobby', requestId: 'request', requesterId: 'bobby' })).toBe(false);
        }
        expect(policy.allows('a', 'join-cancel', { senderId: 'alice', requestId: 'request', requesterId: 'alice' })).toBe(true);
    });

    it('removes player authority when the owner explicitly becomes a spectator', () => {
        const policy = createRoomAuthority();
        policy.announce('h', { id: 'host', role: 'host' });
        expect(policy.announce('h', { id: 'host', role: 'spectator' })).toBe('spectator');
        expect(policy.allows('h', 'cell-update', { senderId: 'host' })).toBe(false);
    });

});
