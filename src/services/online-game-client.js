import { Centrifuge } from 'centrifuge';
import { createRoomAuthority } from './room-authority.js';
import { createEventDeduper } from './event-deduper.js';
import { normalizeJoinPolicy } from './join-settings.js';
import {
    createMessageOrderGuard,
    createSenderIdentityGuard,
    validateIncomingGameMessage,
    validateLobbyUpdateMessage,
    validatePresenceAnnounce,
} from './message-security.js';
import {
    buildProtocolMetadata,
    checkProtocolCompatibility,
    PROTOCOL_VERSION,
    SUPPORTED_MULTIPLAYER_FEATURES,
} from './multiplayer-protocol.js';
import {
    assignUniqueMemberNames,
    loadOrCreatePlayerName,
    sanitizePlayerName,
} from './player-name.js';
import {
    buildWsUrl,
    generateEventId,
    generateGameId,
    getOrCreateClientId,
    isValidGameId,
    resolveRuntimeWsConfig,
} from './ws-config.js';

export { generateEventId, generateGameId, isValidGameId, resolveRuntimeWsConfig };

const PRESENCE_ANNOUNCE = 'presence-announce';
const LOBBY_UPDATE = 'lobby-update';
const RECOVERABLE_EVENTS = new Set(['init', 'sync', 'cell-update', 'new-puzzle-accept', 'new-puzzle-request', 'join-policy', 'tic-tac-toe-state', 'retro-mode']);
const PRESENCE_SETTLE_TIMEOUT_MS = 350;

function normalizeRole(role) {
    return role === 'host' || role === 'guest' || role === 'spectator' ? role : 'spectator';
}

function normalizeGameMode(mode) {
    return mode === 'solo' || mode === 'online' ? mode : 'online';
}

function replayPublications(publications) {
    const orderedPubs = [...publications].sort((a, b) => {
        const ao = Number.isFinite(a?.offset) ? a.offset : 0;
        const bo = Number.isFinite(b?.offset) ? b.offset : 0;
        return ao - bo;
    });
    let startIdx = 0;
    for (let i = orderedPubs.length - 1; i >= 0; i -= 1) {
        const t = orderedPubs[i]?.data?.type;
        if (t === 'new-puzzle-accept' || t === 'init' || t === 'sync') {
            startIdx = i;
            break;
        }
    }
    return orderedPubs.slice(startIdx);
}

export class OnlineGameClient {
    constructor({ wsConfig, onConnectionChange, playerName = null } = {}) {
        this.wsConfig = resolveRuntimeWsConfig(wsConfig || {});
        this.onConnectionChange = onConnectionChange || (() => {});
        this.client = null;
        this.serverClientId = null;
        this.gameChannel = null;
        this.lobbyChannel = null;
        this.currentGameId = null;
        this.authorityRoomId = null;
        this.roomAuthority = createRoomAuthority();
        this.boardCells = 81;
        this.activeServerClients = new Set();
        this.gameMembersByServerClient = new Map();
        this.gamePresenceReady = false;
        this.gameRole = 'spectator';
        this.gameMode = 'online';
        this.gameJoinPolicy = 'confirm';
        this.presenceSettleTimer = null;
        this.lobbyActiveServerClients = new Set();
        this.lobbyRoomsByGameId = new Map();
        this.hostedLobbyMeta = null;
        this.eventDeduper = createEventDeduper();
        this.messageOrderGuard = createMessageOrderGuard();
        this.senderIdentityGuard = createSenderIdentityGuard();
        this.protocolMeta = buildProtocolMetadata();
        this.negotiatedFeatures = new Set(SUPPORTED_MULTIPLAYER_FEATURES);
        this.seqCounter = 0;
        this.clientId = getOrCreateClientId();
        this.playerName = sanitizePlayerName(playerName) || loadOrCreatePlayerName();
    }

    buildOutgoingEnvelope(data = {}) {
        return {
            ...data,
            eventId: data.eventId || generateEventId(),
            senderId: data.senderId || this.clientId,
            seq: ++this.seqCounter,
            sentAt: Date.now(),
            protocolVersion: PROTOCOL_VERSION,
        };
    }

    rememberEvent(eventId) {
        return this.eventDeduper.remember(eventId);
    }

    buildWsUrl() {
        return buildWsUrl(this.wsConfig);
    }

    ensureClient() {
        if (this.client) {
            return this.client;
        }

        const options = {};
        if (this.wsConfig.token) {
            options.token = this.wsConfig.token;
        }
        if (typeof this.wsConfig.getToken === 'function') {
            options.getToken = this.wsConfig.getToken;
        }

        this.client = new Centrifuge(this.buildWsUrl(), options);

        this.client.on('state', (ctx) => {
            this.onConnectionChange(ctx.newState);
        });

        this.client.on('connected', (ctx) => {
            this.serverClientId = ctx.client || null;
        });

        this.client.on('disconnected', () => {
            this.serverClientId = null;
        });

        this.onConnectionChange(this.client.state);
        this.client.connect();

        return this.client;
    }

    getGameMembers() {
        if (!this.gameChannel || !this.gamePresenceReady) {
            return null;
        }
        return assignUniqueMemberNames(Array.from(this.gameMembersByServerClient.values(), (member) => ({
            ...member, role: this.roomAuthority.role(member.serverClientId) || 'spectator',
        })));
    }

    publishHostedLobbyMeta() {
        if (!this.lobbyChannel || !this.hostedLobbyMeta) return;
        try {
            Promise.resolve(this.lobbyChannel.publish({
                type: LOBBY_UPDATE,
                data: {
                    ...this.hostedLobbyMeta,
                    serverClientId: this.serverClientId || this.clientId,
                    updated_at: Date.now(),
                },
            })).catch(() => {});
        } catch {
            // Publication remains best-effort during disconnects.
        }
    }

    acceptPublication(ctx, authority = this.roomAuthority, identity = this.senderIdentityGuard, cells = this.boardCells) {
        const connection = ctx?.info?.client;
        const payload = ctx?.data;
        if (!connection || !payload) return false;
        if (payload.type === PRESENCE_ANNOUNCE) {
            if (!validatePresenceAnnounce(payload.data)) return false;
        } else {
            if (!validateIncomingGameMessage(payload.type, payload.data, cells, cells === 36 ? 6 : 9)) return false;
            if (!authority.allows(connection, payload.type, payload.data)) return false;
        }
        return identity.verify({
            serverClientId: connection,
            serverUser: ctx.info.user,
            senderId: payload.data?.senderId || payload.data?.id,
        });
    }

    async replayGameHistory(sub, onEvent) {
        const hist = await sub.history({ limit: 25 });
        if (this.gameChannel !== sub || !Array.isArray(hist?.publications)) return;
        if (this.gameRole === 'host' && this.gameMode === 'solo') return;
        const authority = this.roomAuthority.fork();
        const identity = createSenderIdentityGuard();
        const accepted = [];
        const publications = [...hist.publications].sort((a, b) => (a.offset || 0) - (b.offset || 0));
        let cells = this.boardCells;
        for (const pub of publications) {
            if (!this.acceptPublication(pub, authority, identity, cells)) continue;
            const payload = pub.data;
            const connection = pub.info.client;
            if (payload.type === PRESENCE_ANNOUNCE) {
                authority.announce(connection, payload.data);
                continue;
            }
            authority.observe(payload.type, payload.data);
            if (payload.data.gameState) cells = payload.data.gameState.board.length;
            if (RECOVERABLE_EVENTS.has(payload.type)) accepted.push({ ...pub, data: { type: payload.type, data: authority.project(connection, payload.data) } });
        }
        for (const pub of replayPublications(accepted)) {
            const { type, data } = pub.data;
            if (data.eventId && this.rememberEvent(data.eventId)) continue;
            if (data.gameState) this.boardCells = data.gameState.board.length;
            onEvent(type, data);
        }
    }

    handlePresenceAnnouncement(ctx, payload, { onIncompatibleClient, onPresenceChange, onMemberJoin, finalizeInitialPresence }) {
        const sc = ctx?.info?.client;
        if (!sc || payload.data?.id === this.clientId) return;
        if (!validatePresenceAnnounce(payload.data)) return;

        const compat = checkProtocolCompatibility(payload.data || {});
        if (!compat.compatible) {
            onIncompatibleClient(compat, payload.data || {});
        } else {
            const nextNegotiated = compat.negotiatedFeatures.filter((f) => this.negotiatedFeatures.has(f));
            this.negotiatedFeatures = new Set(nextNegotiated);
        }

        const acceptedRole = this.roomAuthority.announce(sc, payload.data);
        const existed = this.gameMembersByServerClient.has(sc);
        const member = {
            id: payload.data?.id || sc,
            serverClientId: sc,
            role: acceptedRole,
            game_mode: normalizeGameMode(payload.data?.game_mode),
            join_policy: normalizeJoinPolicy(payload.data?.join_policy),
            name: sanitizePlayerName(payload.data?.name) || 'Player',
            protocolVersion: compat.remoteVersion,
            clientPlatform: payload.data?.clientPlatform || 'web',
        };

        this.activeServerClients.add(sc);
        this.gameMembersByServerClient.set(sc, member);

        if (!this.gamePresenceReady) {
            const announcedAll = Array.from(this.activeServerClients).every(
                (id) => id === this.serverClientId || this.gameMembersByServerClient.has(id),
            );
            if (announcedAll) {
                finalizeInitialPresence();
            }
            return;
        }

        if (existed) {
            onPresenceChange(this.getGameMembers());
        } else {
            onMemberJoin(member);
        }
    }

    updatePlayerName(name) {
        const nextName = sanitizePlayerName(name);
        if (!nextName || nextName === this.playerName) {
            return this.playerName;
        }
        this.playerName = nextName;
        if (this.gameChannel) {
            const selfKey = this.serverClientId || this.clientId;
            const currentSelf = this.gameMembersByServerClient.get(selfKey);
            if (currentSelf) {
                this.gameMembersByServerClient.set(selfKey, {
                    ...currentSelf,
                    name: nextName,
                });
            }
            this.sendWhisperEvent(PRESENCE_ANNOUNCE, {
                id: this.clientId,
                serverClientId: selfKey,
                role: this.gameRole,
                game_mode: this.gameMode,
                join_policy: this.gameJoinPolicy,
                name: nextName,
            });
        }
        if (this.hostedLobbyMeta) {
            this.hostedLobbyMeta = {
                ...this.hostedLobbyMeta,
                host_name: nextName,
            };
            this.publishHostedLobbyMeta();
        }
        return this.playerName;
    }

    isSelfClientPublication(ctx) {
        return Boolean(ctx?.info?.client && this.serverClientId && ctx.info.client === this.serverClientId);
    }

    clearPresenceSettleTimer() {
        if (this.presenceSettleTimer !== null) {
            clearTimeout(this.presenceSettleTimer);
            this.presenceSettleTimer = null;
        }
    }

    joinGameChannel(gameId, {
        role = 'spectator',
        gameMode = 'online',
        joinPolicy = 'confirm',
        onEvent = () => {},
        onPresenceChange = () => {},
        onMemberJoin = () => {},
        onMemberLeave = () => {},
        onIncompatibleClient = () => {},
        onSubscribed = null,
    } = {}) {
        if (!isValidGameId(gameId)) {
            throw new Error('Invalid game room identifier.');
        }

        this.leaveGameChannel();
        this.eventDeduper.clear();
        this.messageOrderGuard.clear();
        this.senderIdentityGuard.clear();
        this.negotiatedFeatures = new Set(SUPPORTED_MULTIPLAYER_FEATURES);

        if (this.authorityRoomId !== gameId) {
            this.roomAuthority = createRoomAuthority();
            this.authorityRoomId = gameId;
            this.boardCells = 81;
        }
        this.currentGameId = gameId;
        this.activeServerClients.clear();
        this.gameMembersByServerClient.clear();
        this.gamePresenceReady = false;

        const normalizedRole = normalizeRole(role);
        const normalizedMode = normalizeGameMode(gameMode);
        const normalizedJoinPolicy = normalizeJoinPolicy(joinPolicy);
        this.gameRole = normalizedRole;
        this.gameMode = normalizedMode;
        this.gameJoinPolicy = normalizedJoinPolicy;

        const client = this.ensureClient();
        const channel = `sudoku:game.${gameId}`;
        const sub = client.newSubscription(channel);
        this.gameChannel = sub;

        const announceSelf = () => {
            if (this.gameChannel !== sub) return;
            const selfKey = this.serverClientId || this.clientId;
            this.roomAuthority.announce(selfKey, { id: this.clientId, role: this.gameRole, join_policy: this.gameJoinPolicy });
            this.gameMembersByServerClient.set(selfKey, {
                id: this.clientId,
                serverClientId: selfKey,
                role: this.gameRole,
                game_mode: this.gameMode,
                join_policy: this.gameJoinPolicy,
                name: this.playerName,
            });
            Promise.resolve(sub.publish({
                type: PRESENCE_ANNOUNCE,
                data: {
                    id: this.clientId,
                    serverClientId: selfKey,
                    role: this.gameRole,
                    game_mode: this.gameMode,
                    join_policy: this.gameJoinPolicy,
                    name: this.playerName,
                    ...this.protocolMeta,
                    approvedGuestIds: this.gameRole === 'host' ? this.roomAuthority.approvedGuestIds() : undefined,
                },
            })).catch(() => {});
        };

        const finalizeInitialPresence = () => {
            if (this.gameChannel !== sub || this.gamePresenceReady) return;
            this.clearPresenceSettleTimer();
            this.gamePresenceReady = true;
            onPresenceChange(this.getGameMembers());
        };

        sub.on('subscribed', async () => {
            if (this.gameChannel !== sub) return;

            this.clearPresenceSettleTimer();
            this.gameMembersByServerClient.clear();
            this.senderIdentityGuard.clear();
            this.gamePresenceReady = false;

            let expectedRemoteCount = 0;
            try {
                const res = await sub.presence();
                if (this.gameChannel !== sub) return;

                const clientIds = Object.keys(res?.clients || {});
                this.activeServerClients = new Set(clientIds);
                this.roomAuthority.retainConnections(this.activeServerClients);
                expectedRemoteCount = clientIds.filter((sc) => sc !== this.serverClientId).length;
            } catch {
                if (this.gameChannel !== sub) return;
            }

            announceSelf();
            if (typeof onSubscribed === 'function') {
                onSubscribed();
            }

            // History replay remains best-effort on reconnect.
            try {
                await this.replayGameHistory(sub, onEvent);
            } catch {
                // A stale/disconnected subscription may reject history.
            }

            if (expectedRemoteCount === 0) {
                finalizeInitialPresence();
            } else {
                this.presenceSettleTimer = setTimeout(() => {
                    finalizeInitialPresence();
                }, PRESENCE_SETTLE_TIMEOUT_MS);
            }
        });

        sub.on('join', (ctx) => {
            if (this.gameChannel !== sub) return;
            const sc = ctx?.info?.client;
            if (sc) {
                this.activeServerClients.add(sc);
            }
            announceSelf();
        });

        sub.on('leave', (ctx) => {
            if (this.gameChannel !== sub) return;
            const sc = ctx?.info?.client;
            if (!sc) return;

            this.activeServerClients.delete(sc);
            this.roomAuthority.leave(sc);
            this.senderIdentityGuard.releaseServerClient(sc);
            const leaving = this.gameMembersByServerClient.get(sc);
            this.gameMembersByServerClient.delete(sc);

            if (leaving && this.gamePresenceReady) {
                onMemberLeave(leaving);
            }
        });

        sub.on('publication', (ctx) => {
            if (this.gameChannel !== sub) return;
            if (this.isSelfClientPublication(ctx)) return;

            const payload = ctx?.data;
            if (!payload || typeof payload.type !== 'string') return;

            if (!this.acceptPublication(ctx)) return;
            if (payload.type === PRESENCE_ANNOUNCE) {
                this.handlePresenceAnnouncement(ctx, payload, { onIncompatibleClient, onPresenceChange, onMemberJoin, finalizeInitialPresence });
                return;
            }

            const eventId = payload.data?.eventId;
            if (eventId && this.eventDeduper.has(eventId)) {
                return;
            }
            if (!this.messageOrderGuard.accept(payload.data || {})) {
                return;
            }

            if (eventId) this.rememberEvent(eventId);
            this.roomAuthority.observe(payload.type, payload.data);
            if (payload.data.gameState) this.boardCells = payload.data.gameState.board.length;
            onEvent(payload.type, this.roomAuthority.project(ctx.info.client, payload.data));
        });

        sub.subscribe();

        return sub;
    }

    sendWhisperEvent(type, data = {}) {
        if (this.gameChannel) {
            const payloadData = this.buildOutgoingEnvelope({
                ...data,
                ...(type === PRESENCE_ANNOUNCE && this.gameRole === 'host'
                    ? { approvedGuestIds: this.roomAuthority.approvedGuestIds(), ...this.protocolMeta } : {}),
            });
            this.rememberEvent(payloadData.eventId);
            if (payloadData.gameState) this.boardCells = payloadData.gameState.board.length;
            try {
                Promise.resolve(this.gameChannel.publish({ type, data: payloadData })).catch(() => {});
            } catch {
                // Ignore publish failure if channel is not ready
            }
        }
    }

    sendGamePing(payload = {}) {
        this.sendWhisperEvent('ping', payload);
    }

    async broadcastGameEvent(gameId, type, data = {}) {
        if (!isValidGameId(gameId)) return;

        const payloadData = this.buildOutgoingEnvelope(data);
        this.rememberEvent(payloadData.eventId);
        if (payloadData.gameState) this.boardCells = payloadData.gameState.board.length;
        if (this.gameRole === 'host' && type === 'join-response') {
            this.roomAuthority.observe(type, payloadData);
            this.sendWhisperEvent(PRESENCE_ANNOUNCE, {
                id: this.clientId, role: 'host', game_mode: this.gameMode, join_policy: this.gameJoinPolicy, name: this.playerName,
            });
        }

        if (this.gameChannel) {
            try {
                await this.gameChannel.publish({ type, data: payloadData });
            } catch {
                // Ignore publish failure if offline / solo
            }
        }
    }

    updateGameJoinPolicy(joinPolicy) {
        const normalized = normalizeJoinPolicy(joinPolicy);
        this.gameJoinPolicy = normalized;
        if (!this.gameChannel) return;

        const selfKey = this.serverClientId || this.clientId;
        const currentSelf = this.gameMembersByServerClient.get(selfKey);
        if (currentSelf) {
            this.gameMembersByServerClient.set(selfKey, {
                ...currentSelf,
                join_policy: normalized,
            });
        }
        this.sendWhisperEvent(PRESENCE_ANNOUNCE, {
            id: this.clientId,
            serverClientId: selfKey,
            role: this.gameRole,
            game_mode: this.gameMode,
            join_policy: normalized,
            name: this.playerName,
        });
        this.sendWhisperEvent('join-policy', {
            joinPolicy: normalized,
        });
    }

    joinLobby({
        gameId = null,
        status = 'waiting',
        gameMode = 'solo',
        difficulty = 'medium',
        variant = '3x3',
        totalCells = null,
        hasGuest = false,
        filledCount = 0,
        joinPolicy = 'confirm',
        hostName = null,
        elapsedSeconds = 0,
        onLobbyPresenceChange = () => {},
        onLobbyMemberJoin = () => {},
        onLobbyMemberLeave = () => {},
        onLobbyUpdate = () => {},
    } = {}) {
        this.leaveLobby();

        const safeGameId = isValidGameId(gameId) ? gameId : null;
        this.lobbyActiveServerClients.clear();
        this.lobbyRoomsByGameId.clear();

        const resolvedVariant = variant === '2x3' || variant === '6x6' ? '2x3' : '3x3';
        const resolvedTotalCells = totalCells || (resolvedVariant === '2x3' ? 36 : 81);
        const resolvedJoinPolicy = normalizeJoinPolicy(joinPolicy);
        const resolvedHostName = sanitizePlayerName(hostName) || this.playerName;
        const resolvedElapsed = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));

        this.hostedLobbyMeta = safeGameId
            ? {
                id: this.clientId,
                game_id: safeGameId,
                status,
                game_mode: normalizeGameMode(gameMode),
                difficulty,
                variant: resolvedVariant,
                total_cells: resolvedTotalCells,
                has_guest: Boolean(hasGuest),
                filled_count: filledCount,
                join_policy: resolvedJoinPolicy,
                host_name: resolvedHostName,
                elapsed_seconds: resolvedElapsed,
                ...this.protocolMeta,
            }
            : null;

        const client = this.ensureClient();
        const channel = 'sudoku:lobby';
        const sub = client.newSubscription(channel);
        this.lobbyChannel = sub;

        const publishHostedMeta = () => {
            if (this.lobbyChannel !== sub || !this.hostedLobbyMeta) return;
            this.publishHostedLobbyMeta();
        };

        sub.on('subscribed', async () => {
            if (this.lobbyChannel !== sub) return;
            // Rebuild from current presence/history after an outage; leave events may have been missed.
            this.lobbyRoomsByGameId.clear();

            try {
                const res = await sub.presence();
                if (this.lobbyChannel !== sub) return;
                this.lobbyActiveServerClients = new Set(Object.keys(res?.clients || {}));
            } catch {
                if (this.lobbyChannel !== sub) return;
            }

            if (this.hostedLobbyMeta) {
                publishHostedMeta();
                return;
            }

            try {
                const hist = await sub.history({ limit: 25 });
                if (this.lobbyChannel !== sub) return;

                for (const pub of hist?.publications || []) {
                    const payload = pub?.data;
                    const data = payload?.data;
                    const sc = pub?.info?.client || data?.serverClientId;
                    if (payload?.type !== LOBBY_UPDATE || !validateLobbyUpdateMessage(data)) {
                        continue;
                    }
                    if (sc && this.lobbyActiveServerClients.size > 0 && !this.lobbyActiveServerClients.has(sc)) {
                        continue;
                    }
                    if (data.status === 'solved' || data.status === 'finished') {
                        this.lobbyRoomsByGameId.delete(data.game_id);
                    } else {
                        this.lobbyRoomsByGameId.set(data.game_id, {
                            ...data,
                            host_name: sanitizePlayerName(data.host_name) || null,
                            serverClientId: sc || data.id,
                        });
                    }
                }
            } catch {
                // History best-effort
            }

            if (this.lobbyChannel === sub) {
                onLobbyPresenceChange(Array.from(this.lobbyRoomsByGameId.values()));
            }
        });

        sub.on('join', (ctx) => {
            if (this.lobbyChannel !== sub) return;
            const sc = ctx?.info?.client;
            if (sc) {
                this.lobbyActiveServerClients.add(sc);
            }
            if (this.hostedLobbyMeta) {
                publishHostedMeta();
            }
        });

        sub.on('leave', (ctx) => {
            if (this.lobbyChannel !== sub) return;
            const sc = ctx?.info?.client;
            if (!sc) return;

            this.lobbyActiveServerClients.delete(sc);

            for (const [gId, room] of this.lobbyRoomsByGameId.entries()) {
                if (room.serverClientId === sc) {
                    this.lobbyRoomsByGameId.delete(gId);
                    onLobbyMemberLeave(room);
                }
            }
        });

        sub.on('publication', (ctx) => {
            if (this.lobbyChannel !== sub) return;
            if (this.isSelfClientPublication(ctx)) return;

            const payload = ctx?.data;
            const data = payload?.data;
            if (payload?.type !== LOBBY_UPDATE || !validateLobbyUpdateMessage(data)) {
                return;
            }

            const sc = ctx?.info?.client || data.serverClientId || data.id;
            if (sc) {
                this.lobbyActiveServerClients.add(sc);
            }

            const room = {
                ...data,
                host_name: sanitizePlayerName(data.host_name) || null,
                serverClientId: sc,
            };

            if (room.status === 'solved' || room.status === 'finished') {
                this.lobbyRoomsByGameId.delete(room.game_id);
                onLobbyMemberLeave(room);
                onLobbyUpdate(room);
                return;
            }

            const existed = this.lobbyRoomsByGameId.has(room.game_id);
            this.lobbyRoomsByGameId.set(room.game_id, room);

            if (existed) {
                onLobbyUpdate(room);
            } else {
                onLobbyMemberJoin(room);
            }
        });

        sub.subscribe();

        return sub;
    }

    broadcastLobbyUpdate(
        gameId,
        status,
        filledCount,
        difficulty = 'medium',
        gameMode = 'solo',
        {
            variant = '3x3',
            totalCells = null,
            hasGuest = false,
            joinPolicy = 'confirm',
            ticTacToe = false,
            hostName = null,
            elapsedSeconds = 0,
        } = {},
    ) {
        if (!isValidGameId(gameId)) return;

        const resolvedVariant = variant === '2x3' || variant === '6x6' ? '2x3' : '3x3';
        const resolvedTotalCells = totalCells || (resolvedVariant === '2x3' ? 36 : 81);
        const resolvedJoinPolicy = normalizeJoinPolicy(joinPolicy);
        const resolvedHostName = sanitizePlayerName(hostName) || this.playerName;
        const resolvedElapsed = Math.max(0, Math.floor(Number(elapsedSeconds) || 0));

        this.hostedLobbyMeta = {
            id: this.clientId,
            game_id: gameId,
            status,
            game_mode: normalizeGameMode(gameMode),
            difficulty,
            variant: resolvedVariant,
            total_cells: resolvedTotalCells,
            has_guest: Boolean(hasGuest),
            filled_count: filledCount,
            join_policy: resolvedJoinPolicy,
            tic_tac_toe: Boolean(ticTacToe),
            host_name: resolvedHostName,
            elapsed_seconds: resolvedElapsed,
            ...this.protocolMeta,
        };

        this.publishHostedLobbyMeta();
    }

    leaveGameChannel() {
        this.clearPresenceSettleTimer();
        if (this.gameChannel) {
            try {
                this.gameChannel.unsubscribe?.();
                this.client?.removeSubscription?.(this.gameChannel);
            } catch {
                // Ignore
            }
            this.gameChannel = null;
            this.currentGameId = null;
            this.activeServerClients.clear();
            this.gameMembersByServerClient.clear();
            this.messageOrderGuard.clear();
            this.senderIdentityGuard.clear();
            this.gamePresenceReady = false;
        }
    }

    leaveLobby() {
        this.hostedLobbyMeta = null;
        if (this.lobbyChannel) {
            try {
                this.lobbyChannel.unsubscribe?.();
                this.client?.removeSubscription?.(this.lobbyChannel);
            } catch {
                // Ignore
            }
            this.lobbyChannel = null;
            this.lobbyActiveServerClients.clear();
            this.lobbyRoomsByGameId.clear();
        }
    }

    disconnect() {
        this.leaveGameChannel();
        this.leaveLobby();
        if (this.client) {
            try {
                this.client.disconnect();
            } catch {
                // Ignore
            }
            this.client = null;
            this.serverClientId = null;
        }
    }
}
