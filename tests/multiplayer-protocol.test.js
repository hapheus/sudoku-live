import { describe, expect, it } from 'vitest';
import {
    PROTOCOL_VERSION,
    MIN_SUPPORTED_PROTOCOL_VERSION,
    SUPPORTED_MULTIPLAYER_FEATURES,
    checkProtocolCompatibility,
    negotiateFeatures,
    buildProtocolMetadata,
} from '../src/services/multiplayer-protocol.js';

describe('multiplayer-protocol', () => {
    it('builds protocol metadata with version, minVersion, features, and platform', () => {
        const meta = buildProtocolMetadata({ platform: 'ios' });
        expect(meta).toEqual({
            protocolVersion: PROTOCOL_VERSION,
            minProtocolVersion: MIN_SUPPORTED_PROTOCOL_VERSION,
            features: SUPPORTED_MULTIPLAYER_FEATURES,
            clientPlatform: 'ios',
        });
    });

    it('negotiates overlapping features across mixed Web, iOS, and iPad client versions', () => {
        const legacyIpadFeatures = ['coop', 'spectator-hints', 'reactions'];
        const negotiated = negotiateFeatures(SUPPORTED_MULTIPLAYER_FEATURES, legacyIpadFeatures);
        expect(negotiated).toEqual(['coop', 'spectator-hints', 'reactions']);
        expect(negotiated).not.toContain('tic-tac-toe');
        expect(negotiated).not.toContain('fist-bump');

        // Legacy v1 client omitting features array falls back to baseline features
        expect(negotiateFeatures(SUPPORTED_MULTIPLAYER_FEATURES, undefined)).toEqual([
            'coop',
            'spectator-hints',
            'reactions',
        ]);
    });

    it('accepts compatible mixed client versions (Web v2, iOS v1, iPad v2)', () => {
        const legacyIos = checkProtocolCompatibility({
            protocolVersion: 1,
            minProtocolVersion: 1,
            features: ['coop', 'spectator-hints'],
            clientPlatform: 'ios',
        });
        expect(legacyIos.compatible).toBe(true);
        expect(legacyIos.remoteVersion).toBe(1);
        expect(legacyIos.negotiatedFeatures).toEqual(['coop', 'spectator-hints']);

        const modernIpad = checkProtocolCompatibility({
            protocolVersion: PROTOCOL_VERSION,
            minProtocolVersion: 1,
            features: SUPPORTED_MULTIPLAYER_FEATURES,
            clientPlatform: 'ipad',
        });
        expect(modernIpad.compatible).toBe(true);
        expect(modernIpad.negotiatedFeatures).toEqual(SUPPORTED_MULTIPLAYER_FEATURES);
    });

    it('flags incompatible outdated local or remote clients with update reason', () => {
        const futureRemote = checkProtocolCompatibility({
            protocolVersion: PROTOCOL_VERSION + 2,
            minProtocolVersion: PROTOCOL_VERSION + 1,
            clientPlatform: 'ios',
        });
        expect(futureRemote.compatible).toBe(false);
        expect(futureRemote.requiresUpdate).toBe('local');
        expect(futureRemote.reason).toBe('local-outdated');

        const tooOldRemote = checkProtocolCompatibility({
            protocolVersion: 0,
            minProtocolVersion: 0,
            clientPlatform: 'web',
        });
        expect(tooOldRemote.compatible).toBe(false);
        expect(tooOldRemote.requiresUpdate).toBe('remote');
        expect(tooOldRemote.reason).toBe('remote-outdated');
    });
    it.each([0, -1, 1.5, '1', null, NaN, Infinity, 3])('rejects malformed or contradictory minimum %s', (minimum) => {
        expect(checkProtocolCompatibility({ protocolVersion: 2, minProtocolVersion: minimum }).compatible).toBe(false);
    });

});
