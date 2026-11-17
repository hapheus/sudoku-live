export const PROTOCOL_VERSION = 2;
export const MIN_SUPPORTED_PROTOCOL_VERSION = 1;

export const BASELINE_MULTIPLAYER_FEATURES = ['coop', 'spectator-hints', 'reactions'];
export const SUPPORTED_MULTIPLAYER_FEATURES = [
    ...BASELINE_MULTIPLAYER_FEATURES,
    'shift',
    'fist-bump',
    'tic-tac-toe',
    'player-tags',
];

export function detectClientPlatform() {
    if (typeof window === 'undefined') return 'web';
    const capPlatform = window.Capacitor?.getPlatform?.();
    if (capPlatform === 'ios') {
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
        return /iPad/i.test(ua) ? 'ipad' : 'ios';
    }
    if (capPlatform === 'android') return 'android';
    return 'web';
}

export function buildProtocolMetadata({ platform = detectClientPlatform() } = {}) {
    return {
        protocolVersion: PROTOCOL_VERSION,
        minProtocolVersion: MIN_SUPPORTED_PROTOCOL_VERSION,
        features: [...SUPPORTED_MULTIPLAYER_FEATURES],
        clientPlatform: platform,
    };
}

export function negotiateFeatures(localFeatures = SUPPORTED_MULTIPLAYER_FEATURES, remoteFeatures = undefined) {
    const localSet = new Set(Array.isArray(localFeatures) ? localFeatures : SUPPORTED_MULTIPLAYER_FEATURES);
    const candidateList = Array.isArray(remoteFeatures)
        ? remoteFeatures
        : BASELINE_MULTIPLAYER_FEATURES;
    return candidateList.filter((feature) => typeof feature === 'string' && localSet.has(feature));
}

/**
 * Validates protocol compatibility between local client and a remote peer or lobby room.
 */
export function checkProtocolCompatibility(remoteMeta = {}) {
    const rawVersion = remoteMeta?.protocolVersion;
    const remoteVersion = rawVersion === undefined ? 1 : rawVersion;

    if (!Number.isSafeInteger(remoteVersion) || remoteVersion < 0) {
        return {
            compatible: false,
            reason: 'invalid-version',
            requiresUpdate: 'remote',
            remoteVersion: null,
            negotiatedFeatures: [],
        };
    }

    if (remoteVersion < MIN_SUPPORTED_PROTOCOL_VERSION) {
        return {
            compatible: false,
            reason: 'remote-outdated',
            requiresUpdate: 'remote',
            remoteVersion,
            negotiatedFeatures: [],
        };
    }

    const rawMin = remoteMeta?.minProtocolVersion;
    const remoteMinVersion = rawMin === undefined ? 1 : rawMin;
    if (!Number.isSafeInteger(remoteMinVersion) || remoteMinVersion < 1 || remoteMinVersion > remoteVersion) {
        return { compatible: false, reason: 'invalid-min-version', requiresUpdate: 'remote', remoteVersion, negotiatedFeatures: [] };
    }
    if (remoteMinVersion > PROTOCOL_VERSION) {
        return {
            compatible: false,
            reason: 'local-outdated',
            requiresUpdate: 'local',
            remoteVersion,
            negotiatedFeatures: [],
        };
    }

    return {
        compatible: true,
        reason: 'ok',
        requiresUpdate: null,
        remoteVersion,
        negotiatedFeatures: negotiateFeatures(SUPPORTED_MULTIPLAYER_FEATURES, remoteMeta?.features),
    };
}
