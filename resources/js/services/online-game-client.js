import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

// Make Pusher available globally for Echo
if (typeof window !== 'undefined') {
    window.Pusher = Pusher;
}

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

export class OnlineGameClient {
    constructor({ reverbConfig, onConnectionChange }) {
        this.reverbConfig = reverbConfig;
        this.onConnectionChange = onConnectionChange || (() => {});
        this.echo = null;
        this.gameChannel = null;
        this.lobbyChannel = null;
        this.currentGameId = null;
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

    ensureEcho(customHeaders = {}) {
        if (this.echo) {
            return this.echo;
        }

        const isHttps = this.reverbConfig.scheme === 'https' || window.location.protocol === 'https:';
        const port = parseInt(this.reverbConfig.port || (isHttps ? 443 : 80), 10);
        const host = (this.reverbConfig.host && this.reverbConfig.host !== 'localhost' && this.reverbConfig.host !== '127.0.0.1')
            ? this.reverbConfig.host
            : (window.location.hostname || 'localhost');

        const authHeaders = {
            'X-Client-Id': this.clientId,
            ...customHeaders,
        };

        this.echo = new Echo({
            broadcaster: 'reverb',
            key: this.reverbConfig.key,
            wsHost: host,
            wsPort: port,
            wssPort: port,
            forceTLS: isHttps,
            enabledTransports: ['ws', 'wss'],
            authEndpoint: '/broadcasting/auth',
            auth: {
                headers: authHeaders,
            },
        });

        const pusherConnection = this.echo.connector.pusher.connection;
        this.onConnectionChange(pusherConnection.state);

        pusherConnection.bind('state_change', (states) => {
            this.onConnectionChange(states.current);
        });

        return this.echo;
    }

    setAuthHeaders(headers = {}) {
        if (!this.echo || !this.echo.connector) return;

        if (this.echo.connector.options && this.echo.connector.options.auth) {
            Object.assign(this.echo.connector.options.auth.headers, headers);
        }

        const pusherConfig = this.echo.connector.pusher && this.echo.connector.pusher.config;
        if (pusherConfig) {
            if (pusherConfig.channelAuthorization && pusherConfig.channelAuthorization.headers) {
                Object.assign(pusherConfig.channelAuthorization.headers, headers);
            }
            if (pusherConfig.auth && pusherConfig.auth.headers) {
                Object.assign(pusherConfig.auth.headers, headers);
            }
        }
    }

    getGameMembers() {
        const membersMap = this.gameChannel?.subscription?.members?.members;
        if (!membersMap) return null;
        return Object.values(membersMap);
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
        this.ensureEcho({
            'X-Player-Role': role,
            'X-Player-Symbol': symbol || '',
            'X-Game-Mode': gameMode,
            'X-Game-Id': gameId,
        });
        this.setAuthHeaders({
            'X-Player-Role': role,
            'X-Player-Symbol': symbol || '',
            'X-Game-Mode': gameMode,
            'X-Game-Id': gameId,
        });

        const dispatchUniqueEvent = (payload) => {
            if (!payload || !payload.type) return;
            const eventId = payload.data?.eventId;
            if (eventId && this.rememberEvent(eventId)) {
                return;
            }
            onEvent(payload.type, payload.data || {});
        };

        this.gameChannel = this.echo.join(`games.${gameId}`);

        this.gameChannel
            .here((members) => onPresenceChange(members))
            .joining((member) => onMemberJoin(member))
            .leaving((member) => onMemberLeave(member))
            .listen('.GameBroadcastEvent', dispatchUniqueEvent)
            .listenForWhisper('game-event', dispatchUniqueEvent);

        return this.gameChannel;
    }

    sendWhisperEvent(type, data = {}) {
        if (this.gameChannel) {
            try {
                this.gameChannel.whisper('game-event', { type, data });
            } catch {
                // Ignore whisper failure if channel is not ready
            }
        }
    }

    sendGamePing(payload = {}) {
        this.sendWhisperEvent('ping', payload);
    }

    async broadcastGameEvent(gameId, type, data = {}) {
        if (!isValidGameId(gameId)) return;

        const payloadData = {
            ...data,
            eventId: data.eventId || generateEventId(),
        };

        // 1. Whisper directly peer-to-peer over WebSocket
        if (this.gameChannel) {
            try {
                this.gameChannel.whisper('game-event', { type, data: payloadData });
            } catch {
                // Ignore whisper failure
            }
        }

        // 2. Stateless HTTP broadcast relay to ensure 100% delivery
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

        this.ensureEcho({
            'X-Game-Id': safeGameId,
            'X-Status': status,
            'X-Game-Mode': gameMode,
            'X-Difficulty': difficulty,
            'X-Filled-Count': filledCount.toString(),
        });
        this.setAuthHeaders({
            'X-Game-Id': safeGameId,
            'X-Status': status,
            'X-Game-Mode': gameMode,
            'X-Difficulty': difficulty,
            'X-Filled-Count': filledCount.toString(),
        });

        this.lobbyChannel = this.echo.join('lobby');

        this.lobbyChannel
            .here((members) => onLobbyPresenceChange(members))
            .joining((member) => onLobbyMemberJoin(member))
            .leaving((member) => onLobbyMemberLeave(member))
            .listenForWhisper('lobby-update', (data) => onLobbyUpdate(data));

        return this.lobbyChannel;
    }

    broadcastLobbyUpdate(gameId, status, filledCount, difficulty = 'medium', gameMode = 'online') {
        if (this.lobbyChannel && isValidGameId(gameId)) {
            try {
                this.lobbyChannel.whisper('lobby-update', {
                    id: this.clientId,
                    game_id: gameId,
                    status,
                    game_mode: gameMode,
                    difficulty,
                    filled_count: filledCount,
                });
            } catch {
                // Ignore whisper error
            }
        }
    }

    leaveGameChannel() {
        if (this.gameChannel && this.currentGameId && this.echo) {
            try {
                this.echo.leave(`games.${this.currentGameId}`);
            } catch {
                // Ignore
            }
            this.gameChannel = null;
            this.currentGameId = null;
        }
    }

    leaveLobby() {
        if (this.lobbyChannel && this.echo) {
            try {
                this.echo.leave('lobby');
            } catch {
                // Ignore
            }
            this.lobbyChannel = null;
        }
    }

    disconnect() {
        this.leaveGameChannel();
        this.leaveLobby();
        if (this.echo) {
            try {
                this.echo.disconnect();
            } catch {
                // Ignore
            }
            this.echo = null;
        }
    }
}
