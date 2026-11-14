import { Centrifuge } from 'centrifuge';
import { createEventDeduper } from './event-deduper.js';
import { normalizeJoinPolicy } from './join-settings.js';
import {
    buildWsUrl,
    generateEventId,
    generateGameId,
    getOrCreateClientId,
    isValidGameId,
    resolveRuntimeWsConfig,
} from './ws-config.js';

export { generateEventId, generateGameId, isValidGameId, resolveRuntimeWsConfig };

const PRESENCE_SETTLE_TIMEOUT_MS = 350;

function normalizeRole(role) {
    return role === 'host' || role === 'guest' || role === 'spectator' ? role : 'spectator';
}

function normalizeGameMode(mode) {
    return mode === 'solo' || mode === 'online' ? mode : 'online';
}

export class OnlineGameClient {
    constructor({ wsConfig, onConnectionChange } = {}) {
        this.wsConfig = resolveRuntimeWsConfig(wsConfig || {});
        this.onConnectionChange = onConnectionChange || (() => {});
        this.client = null;
        this.serverClientId = null;
        this.gameChannel = null;
        this.lobbyChannel = null;
        this.currentGameId = null;
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
        this.clientId = getOrCreateClientId();
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
        return Array.from(this.gameMembersByServerClient.values());
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
        onSubscribed = null,
    } = {}) {
        if (!isValidGameId(gameId)) {
            throw new Error('Invalid game room identifier.');
        }

        this.leaveGameChannel();
        this.eventDeduper.clear();

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
            this.gameMembersByServerClient.set(selfKey, {
                id: this.clientId,
                serverClientId: selfKey,
                role: this.gameRole,
                game_mode: this.gameMode,
                join_policy: this.gameJoinPolicy,
            });
            Promise.resolve(sub.publish({
                type: 'presence-announce',
                data: {
                    id: this.clientId,
                    serverClientId: selfKey,
                    role: this.gameRole,
                    game_mode: this.gameMode,
                    join_policy: this.gameJoinPolicy,
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

            let expectedRemoteCount = 0;
            try {
                const res = await sub.presence();
                if (this.gameChannel !== sub) return;

                const clientIds = Object.keys(res?.clients || {});
                this.activeServerClients = new Set(clientIds);
                expectedRemoteCount = clientIds.filter((sc) => sc !== this.serverClientId).length;
            } catch {
                if (this.gameChannel !== sub) return;
            }

            announceSelf();
            if (typeof onSubscribed === 'function') {
                onSubscribed();
            }

            // Replay recent room history so late joiners / reconnects catch up cleanly
            try {
                const hist = await sub.history({ limit: 25 });
                if (this.gameChannel === sub && Array.isArray(hist?.publications)) {
                    const isAuthoritativeSoloHost = this.gameRole === 'host' && this.gameMode === 'solo';
                    if (!isAuthoritativeSoloHost) {
                        const orderedPubs = [...hist.publications].sort((a, b) => {
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
                        for (const pub of orderedPubs.slice(startIdx)) {
                            const payload = pub?.data;
                            if (!payload || !payload.type || payload.type === 'presence-announce') {
                                continue;
                            }
                            const eventId = payload.data?.eventId;
                            if (eventId && this.rememberEvent(eventId)) {
                                continue;
                            }
                            if (payload.type === 'init' || payload.type === 'sync' || payload.type === 'cell-update' || payload.type === 'new-puzzle-accept' || payload.type === 'new-puzzle-request' || payload.type === 'join-policy') {
                                onEvent(payload.type, payload.data || {});
                            }
                        }
                    }
                }
            } catch {
                // History replay is best-effort
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
            if (!payload || !payload.type) return;

            if (payload.type === 'presence-announce') {
                const sc = ctx?.info?.client || payload.data?.serverClientId || payload.data?.id;
                if (!sc || payload.data?.id === this.clientId) return;

                const existed = this.gameMembersByServerClient.has(sc);
                const member = {
                    id: payload.data?.id || sc,
                    serverClientId: sc,
                    role: normalizeRole(payload.data?.role),
                    game_mode: normalizeGameMode(payload.data?.game_mode),
                    join_policy: normalizeJoinPolicy(payload.data?.join_policy),
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
                return;
            }

            const eventId = payload.data?.eventId;
            if (eventId && this.rememberEvent(eventId)) {
                return;
            }

            onEvent(payload.type, payload.data || {});
        });

        sub.subscribe();

        return sub;
    }

    sendWhisperEvent(type, data = {}) {
        if (this.gameChannel) {
            try {
                Promise.resolve(this.gameChannel.publish({ type, data })).catch(() => {});
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

        const eventId = data.eventId || generateEventId();
        const payloadData = {
            ...data,
            eventId,
        };

        this.rememberEvent(eventId);

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
        this.sendWhisperEvent('presence-announce', {
            id: this.clientId,
            serverClientId: selfKey,
            role: this.gameRole,
            game_mode: this.gameMode,
            join_policy: normalized,
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
            }
            : null;

        const client = this.ensureClient();
        const channel = 'sudoku:lobby';
        const sub = client.newSubscription(channel);
        this.lobbyChannel = sub;

        const publishHostedMeta = () => {
            if (this.lobbyChannel !== sub || !this.hostedLobbyMeta) return;
            Promise.resolve(sub.publish({
                type: 'lobby-update',
                data: {
                    ...this.hostedLobbyMeta,
                    serverClientId: this.serverClientId || this.clientId,
                    updated_at: Date.now(),
                },
            })).catch(() => {});
        };

        sub.on('subscribed', async () => {
            if (this.lobbyChannel !== sub) return;

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
                    if (payload?.type !== 'lobby-update' || !data || !isValidGameId(data.game_id)) {
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
            if (payload?.type !== 'lobby-update' || !data || !isValidGameId(data.game_id)) {
                return;
            }

            const sc = ctx?.info?.client || data.serverClientId || data.id;
            if (sc) {
                this.lobbyActiveServerClients.add(sc);
            }

            const room = {
                ...data,
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
        { variant = '3x3', totalCells = null, hasGuest = false, joinPolicy = 'confirm' } = {},
    ) {
        if (!isValidGameId(gameId)) return;

        const resolvedVariant = variant === '2x3' || variant === '6x6' ? '2x3' : '3x3';
        const resolvedTotalCells = totalCells || (resolvedVariant === '2x3' ? 36 : 81);
        const resolvedJoinPolicy = normalizeJoinPolicy(joinPolicy);

        const payload = {
            id: this.clientId,
            serverClientId: this.serverClientId || this.clientId,
            game_id: gameId,
            status,
            game_mode: normalizeGameMode(gameMode),
            difficulty,
            variant: resolvedVariant,
            total_cells: resolvedTotalCells,
            has_guest: Boolean(hasGuest),
            filled_count: filledCount,
            join_policy: resolvedJoinPolicy,
            updated_at: Date.now(),
        };

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
        };

        if (this.lobbyChannel) {
            try {
                Promise.resolve(this.lobbyChannel.publish({
                    type: 'lobby-update',
                    data: payload,
                })).catch(() => {});
            } catch {
                // Ignore publish error
            }
        }
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
