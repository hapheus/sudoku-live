import { Centrifuge, UnauthorizedError } from 'centrifuge';

const VALID_GAME_ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_SEEN_EVENT_IDS = 200;

export function isValidGameId(gameId) {
    return typeof gameId === 'string' && VALID_GAME_ID_RE.test(gameId);
}

function randomHex(byteCount) {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(byteCount);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    return Math.random().toString(36).substring(2, 2 + byteCount * 2);
}

export function generateGameId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `game_${randomHex(12)}`;
}

export function generateEventId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `evt_${Date.now().toString(36)}_${randomHex(6)}`;
}

export function extractMemberFromClientInfo(info) {
    if (!info || typeof info !== 'object') {
        return null;
    }

    const chanInfo = info.chanInfo && typeof info.chanInfo === 'object' ? info.chanInfo : {};
    const id = chanInfo.id || info.user || info.client;
    if (!id) {
        return null;
    }

    return {
        ...chanInfo,
        id,
    };
}

export class OnlineGameClient {
    constructor({ wsConfig, reverbConfig, onConnectionChange } = {}) {
        this.wsConfig = wsConfig || reverbConfig || {};
        this.onConnectionChange = onConnectionChange || (() => {});
        this.client = null;
        this.serverClientId = null;
        this.gameChannel = null;
        this.lobbyChannel = null;
        this.currentGameId = null;
        this.gameMembers = new Map();
        this.gamePresenceReady = false;
        this.seenEventIds = new Set();

        // Persistent client id per browser session
        this.clientId = sessionStorage.getItem('ttt_client_id');
        if (!this.clientId || !/^[A-Za-z0-9_-]{4,64}$/.test(this.clientId)) {
            this.clientId = `client_${randomHex(8)}`;
            sessionStorage.setItem('ttt_client_id', this.clientId);
        }
    }

    rememberEvent(eventId) {
        if (!eventId || typeof eventId !== 'string') {
            return false;
        }
        if (this.seenEventIds.has(eventId)) {
            return true;
        }
        this.seenEventIds.add(eventId);
        if (this.seenEventIds.size > MAX_SEEN_EVENT_IDS) {
            const oldest = this.seenEventIds.values().next().value;
            this.seenEventIds.delete(oldest);
        }
        return false;
    }

    buildWsUrl() {
        if (typeof this.wsConfig.wsUrl === 'string' && this.wsConfig.wsUrl.trim() !== '') {
            return this.wsConfig.wsUrl.trim();
        }

        const browserProtocol = typeof window !== 'undefined' && window.location ? window.location.protocol : 'http:';
        const browserHostname = typeof window !== 'undefined' && window.location ? window.location.hostname : 'localhost';

        const isHttps = this.wsConfig.scheme === 'https' || browserProtocol === 'https:';
        const wsScheme = isHttps ? 'wss' : 'ws';
        const port = parseInt(this.wsConfig.port || (isHttps ? 443 : 80), 10);
        const host = (this.wsConfig.host && this.wsConfig.host !== 'localhost' && this.wsConfig.host !== '127.0.0.1')
            ? this.wsConfig.host
            : (browserHostname || 'localhost');

        const omitPort = Number.isNaN(port) || (isHttps && port === 443) || (!isHttps && port === 80);
        const portSuffix = omitPort ? '' : `:${port}`;

        return `${wsScheme}://${host}${portSuffix}/connection/websocket`;
    }

    async fetchToken(endpoint, body = {}, headers = {}) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Client-Id': this.clientId,
                ...headers,
            },
            body: JSON.stringify({
                client_id: this.clientId,
                ...body,
            }),
        });

        if (response.status === 401 || response.status === 403) {
            throw new UnauthorizedError(`Unauthorized token request (${response.status})`);
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch Centrifugo token (${response.status})`);
        }

        const payload = await response.json();
        if (!payload || typeof payload.token !== 'string' || payload.token === '') {
            throw new Error('Invalid Centrifugo token response.');
        }

        return payload.token;
    }

    ensureClient() {
        if (this.client) {
            return this.client;
        }

        this.client = new Centrifuge(this.buildWsUrl(), {
            getToken: () => this.fetchToken('/api/centrifugo/connection-token'),
        });

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
        return Array.from(this.gameMembers.values());
    }

    isSelfClientPublication(ctx) {
        return Boolean(ctx?.info?.client && this.serverClientId && ctx.info.client === this.serverClientId);
    }

    joinGameChannel(gameId, {
        role = 'spectator',
        symbol = null,
        gameMode = 'online',
        onEvent = () => {},
        onPresenceChange = () => {},
        onMemberJoin = () => {},
        onMemberLeave = () => {},
    } = {}) {
        if (!isValidGameId(gameId)) {
            throw new Error('Invalid game room identifier.');
        }

        this.leaveGameChannel();
        this.seenEventIds.clear();

        this.currentGameId = gameId;
        this.gameMembers.clear();
        this.gamePresenceReady = false;

        const client = this.ensureClient();
        const channel = `sudoku:game.${gameId}`;

        const sub = client.newSubscription(channel, {
            getToken: (ctx) => this.fetchToken('/api/centrifugo/subscription-token', {
                channel: ctx.channel,
                role,
                symbol: symbol || '',
                game_mode: gameMode,
                game_id: gameId,
            }, {
                'X-Player-Role': role,
                'X-Player-Symbol': symbol || '',
                'X-Game-Mode': gameMode,
                'X-Game-Id': gameId,
            }),
        });

        this.gameChannel = sub;

        sub.on('subscribed', async () => {
            if (this.gameChannel !== sub) return;

            try {
                const res = await sub.presence();
                if (this.gameChannel !== sub) return;

                this.gameMembers.clear();
                Object.values(res?.clients || {}).forEach((info) => {
                    const member = extractMemberFromClientInfo(info);
                    if (member) {
                        this.gameMembers.set(member.id, member);
                    }
                });
                this.gamePresenceReady = true;
                onPresenceChange(this.getGameMembers());
            } catch {
                if (this.gameChannel === sub) {
                    this.gamePresenceReady = true;
                    onPresenceChange(this.getGameMembers());
                }
            }
        });

        sub.on('join', (ctx) => {
            if (this.gameChannel !== sub) return;
            const member = extractMemberFromClientInfo(ctx?.info);
            if (!member) return;

            this.gameMembers.set(member.id, member);
            onMemberJoin(member);
        });

        sub.on('leave', (ctx) => {
            if (this.gameChannel !== sub) return;
            const member = extractMemberFromClientInfo(ctx?.info);
            if (!member) return;

            this.gameMembers.delete(member.id);
            onMemberLeave(member);
        });

        sub.on('publication', (ctx) => {
            if (this.gameChannel !== sub) return;
            if (this.isSelfClientPublication(ctx)) return;

            const payload = ctx?.data;
            if (!payload || !payload.type) return;

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

        // Record eventId before publishing so server-relayed echoes without client info are ignored by the sender
        this.rememberEvent(eventId);

        // 1. Publish directly over Centrifugo WebSocket for minimal latency
        if (this.gameChannel) {
            try {
                await this.gameChannel.publish({ type, data: payloadData });
            } catch {
                // Ignore client publish error; HTTP relay still delivers
            }
        }

        // 2. Stateless HTTP broadcast relay via Centrifugo Server API to guarantee delivery
        try {
            await fetch(`/api/games/${encodeURIComponent(gameId)}/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Client-Id': this.clientId,
                },
                body: JSON.stringify({ type, data: payloadData }),
            });
        } catch {
            // Ignore HTTP relay error
        }
    }

    joinLobby({
        gameId = null,
        status = 'waiting',
        gameMode = 'online',
        difficulty = 'medium',
        filledCount = 0,
        onLobbyPresenceChange = () => {},
        onLobbyMemberJoin = () => {},
        onLobbyMemberLeave = () => {},
        onLobbyUpdate = () => {},
    } = {}) {
        this.leaveLobby();

        const safeGameId = isValidGameId(gameId) ? gameId : '';
        const client = this.ensureClient();
        const channel = 'sudoku:lobby';

        const sub = client.newSubscription(channel, {
            getToken: (ctx) => this.fetchToken('/api/centrifugo/subscription-token', {
                channel: ctx.channel,
                game_id: safeGameId,
                status,
                game_mode: gameMode,
                difficulty,
                filled_count: filledCount,
            }, {
                'X-Game-Id': safeGameId,
                'X-Status': status,
                'X-Game-Mode': gameMode,
                'X-Difficulty': difficulty,
                'X-Filled-Count': filledCount.toString(),
            }),
        });

        this.lobbyChannel = sub;

        sub.on('subscribed', async () => {
            if (this.lobbyChannel !== sub) return;

            try {
                const res = await sub.presence();
                if (this.lobbyChannel !== sub) return;

                const membersById = new Map();
                Object.values(res?.clients || {}).forEach((info) => {
                    const member = extractMemberFromClientInfo(info);
                    if (member) {
                        membersById.set(member.id, member);
                    }
                });
                onLobbyPresenceChange(Array.from(membersById.values()));
            } catch {
                if (this.lobbyChannel === sub) {
                    onLobbyPresenceChange([]);
                }
            }
        });

        sub.on('join', (ctx) => {
            if (this.lobbyChannel !== sub) return;
            const member = extractMemberFromClientInfo(ctx?.info);
            if (member) {
                onLobbyMemberJoin(member);
            }
        });

        sub.on('leave', (ctx) => {
            if (this.lobbyChannel !== sub) return;
            const member = extractMemberFromClientInfo(ctx?.info);
            if (member) {
                onLobbyMemberLeave(member);
            }
        });

        sub.on('publication', (ctx) => {
            if (this.lobbyChannel !== sub) return;
            if (this.isSelfClientPublication(ctx)) return;

            const payload = ctx?.data;
            if (payload && payload.type === 'lobby-update' && payload.data) {
                onLobbyUpdate(payload.data);
            }
        });

        sub.subscribe();

        return sub;
    }

    broadcastLobbyUpdate(gameId, status, filledCount, difficulty = 'medium', gameMode = 'online') {
        if (this.lobbyChannel && isValidGameId(gameId)) {
            try {
                Promise.resolve(this.lobbyChannel.publish({
                    type: 'lobby-update',
                    data: {
                        id: this.clientId,
                        game_id: gameId,
                        status,
                        game_mode: gameMode,
                        difficulty,
                        filled_count: filledCount,
                    },
                })).catch(() => {});
            } catch {
                // Ignore publish error
            }
        }
    }

    leaveGameChannel() {
        if (this.gameChannel) {
            try {
                this.gameChannel.unsubscribe?.();
                this.client?.removeSubscription?.(this.gameChannel);
            } catch {
                // Ignore
            }
            this.gameChannel = null;
            this.currentGameId = null;
            this.gameMembers.clear();
            this.gamePresenceReady = false;
        }
    }

    leaveLobby() {
        if (this.lobbyChannel) {
            try {
                this.lobbyChannel.unsubscribe?.();
                this.client?.removeSubscription?.(this.lobbyChannel);
            } catch {
                // Ignore
            }
            this.lobbyChannel = null;
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
