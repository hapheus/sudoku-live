import { describe, expect, it } from 'vitest';
import { createPeerCompatibility } from '../src/services/peer-compatibility.js';
import { createRoomAuthority } from '../src/services/room-authority.js';
import { SUPPORTED_MULTIPLAYER_FEATURES } from '../src/services/multiplayer-protocol.js';

const modern = { protocolVersion: 2, minProtocolVersion: 1, features: SUPPORTED_MULTIPLAYER_FEATURES };

describe('peer compatibility boundary', () => {
    it('requires a compatible announcement before accepting core or optional events', () => {
        const peers = createPeerCompatibility();
        const authority = createRoomAuthority();
        authority.announce('host', { id: 'host', role: 'host' });
        expect(peers.allows('host', 'cell-update', {}, authority)).toBe(false);
        peers.announce('host', { protocolVersion: 99, minProtocolVersion: 99 });
        expect(peers.allows('host', 'cell-update', {}, authority)).toBe(false);
        peers.announce('host', modern);
        expect(peers.allows('host', 'cell-update', {}, authority)).toBe(true);
        expect(peers.allows('host', 'cell-update', { protocolVersion: 99 }, authority)).toBe(false);
        peers.announce('host', {});
        expect(peers.allows('host', 'cell-update', {}, authority)).toBe(true);
        expect(peers.allows('host', 'fist-bump', {}, authority)).toBe(false);
    });

    it('intersects player features, ignores spectators, and restores capabilities after leave or upgrade', () => {
        const peers = createPeerCompatibility();
        const authority = createRoomAuthority();
        authority.announce('host', { id: 'host', role: 'host', join_policy: 'auto' });
        peers.announce('host', modern);
        authority.announce('viewer', { id: 'viewer', role: 'spectator' });
        peers.announce('viewer', {});
        expect(peers.features(authority)).toContain('tic-tac-toe');
        expect(peers.allows('viewer', 'reaction', {}, authority)).toBe(true);
        expect(peers.allows('viewer', 'fist-bump', {}, authority)).toBe(false);
        authority.announce('guest', { id: 'guest', role: 'guest' });
        peers.announce('guest', {});
        expect(peers.features(authority)).not.toContain('tic-tac-toe');
        expect(peers.allows('host', 'tic-tac-toe-state', {}, authority)).toBe(false);
        peers.announce('guest', modern);
        expect(peers.features(authority)).toContain('tic-tac-toe');
        peers.announce('guest', {});
        peers.remove('guest');
        authority.leave('guest');
        expect(peers.features(authority)).toContain('tic-tac-toe');
        const replay = peers.fork();
        replay.announce('host', {});
        expect(peers.features(authority)).toContain('tic-tac-toe');
        peers.clear();
        expect(peers.allows('host', 'cell-update', {}, authority)).toBe(false);
    });
});
