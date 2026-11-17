import { checkProtocolCompatibility, SUPPORTED_MULTIPLAYER_FEATURES } from './multiplayer-protocol.js';

const EVENT_FEATURES = {
    hint: 'spectator-hints',
    reaction: 'reactions',
    'fist-bump': 'fist-bump',
    'tic-tac-toe-state': 'tic-tac-toe',
    'tic-tac-toe-shift': 'tic-tac-toe',
    'tic-tac-toe-move': 'tic-tac-toe',
    'join-request': 'coop',
};

export function eventFeature(type) {
    return EVENT_FEATURES[type];
}

/** Compatibility is connection-scoped; admission remains the room authority's responsibility. */
export function createPeerCompatibility(seed = []) {
    const peers = new Map(seed);
    const features = (authority) => {
        let shared = [...SUPPORTED_MULTIPLAYER_FEATURES];
        for (const [connection, peer] of peers) {
            if (!peer.compatible || !['host', 'guest'].includes(authority.role(connection))) continue;
            shared = shared.filter((feature) => peer.negotiatedFeatures.includes(feature));
        }
        return shared;
    };
    return {
        announce(connection, metadata) {
            const compatibility = checkProtocolCompatibility(metadata);
            peers.set(connection, compatibility);
            return compatibility;
        },
        allows(connection, type, data, authority) {
            const peer = peers.get(connection);
            if (!peer?.compatible) return false;
            if (data.protocolVersion !== undefined && data.protocolVersion !== peer.remoteVersion) return false;
            const feature = eventFeature(type);
            return !feature || (peer.negotiatedFeatures.includes(feature) && features(authority).includes(feature));
        },
        features,
        remove: (connection) => peers.delete(connection),
        clear: () => peers.clear(),
        fork: () => createPeerCompatibility(peers),
    };
}
