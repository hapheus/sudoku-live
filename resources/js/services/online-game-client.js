import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

// Make Pusher available globally for Echo
window.Pusher = Pusher;

export class OnlineGameClient {
    constructor({ reverbConfig, onConnectionChange }) {
        this.reverbConfig = reverbConfig;
        this.onConnectionChange = onConnectionChange || (() => {});
        this.echo = null;
        this.gameChannel = null;
        this.lobbyChannel = null;
        this.currentGameId = null;

        // Persistent client id per browser session
        this.clientId = sessionStorage.getItem('ttt_client_id');
        if (!this.clientId) {
            this.clientId = 'client_' + Math.random().toString(36).substring(2, 10);
            sessionStorage.setItem('ttt_client_id', this.clientId);
        }
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
        onEvent = () => {},
        onPresenceChange = () => {},
        onMemberJoin = () => {},
        onMemberLeave = () => {},
    } = {}) {
        this.leaveGameChannel();

        this.currentGameId = gameId;
        this.ensureEcho({
            'X-Player-Role': role,
            'X-Player-Symbol': symbol || '',
            'X-Game-Id': gameId,
        });
        this.setAuthHeaders({
            'X-Player-Role': role,
            'X-Player-Symbol': symbol || '',
            'X-Game-Id': gameId,
        });

        this.gameChannel = this.echo.join(`games.${gameId}`);

        this.gameChannel
            .here((members) => onPresenceChange(members))
            .joining((member) => onMemberJoin(member))
            .leaving((member) => onMemberLeave(member))
            .listen('.GameBroadcastEvent', (payload) => {
                if (payload && payload.type) {
                    onEvent(payload.type, payload.data);
                }
            })
            .listenForWhisper('game-event', (payload) => {
                if (payload && payload.type) {
                    onEvent(payload.type, payload.data);
                }
            });

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
        // 1. Whisper directly peer-to-peer over WebSocket
        if (this.gameChannel) {
            try {
                this.gameChannel.whisper('game-event', { type, data });
            } catch {
                // Ignore whisper failure
            }
        }

        // 2. Stateless HTTP broadcast relay to ensure 100% delivery
        try {
            await fetch(`/api/games/${gameId}/events`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Client-Id': this.clientId,
                },
                body: JSON.stringify({ type, data }),
            });
        } catch {
            // Ignore HTTP relay error
        }
    }

    joinLobby({
        gameId = null,
        status = 'waiting',
        movesCount = 0,
        onLobbyPresenceChange = () => {},
        onLobbyMemberJoin = () => {},
        onLobbyMemberLeave = () => {},
        onLobbyUpdate = () => {},
    } = {}) {
        this.leaveLobby();

        this.ensureEcho({
            'X-Game-Id': gameId || '',
            'X-Status': status,
            'X-Moves-Count': movesCount.toString(),
        });
        this.setAuthHeaders({
            'X-Game-Id': gameId || '',
            'X-Status': status,
            'X-Moves-Count': movesCount.toString(),
        });

        this.lobbyChannel = this.echo.join('lobby');

        this.lobbyChannel
            .here((members) => onLobbyPresenceChange(members))
            .joining((member) => onLobbyMemberJoin(member))
            .leaving((member) => onLobbyMemberLeave(member))
            .listenForWhisper('lobby-update', (data) => onLobbyUpdate(data));

        return this.lobbyChannel;
    }

    broadcastLobbyUpdate(gameId, status, movesCount) {
        if (this.lobbyChannel) {
            try {
                this.lobbyChannel.whisper('lobby-update', {
                    id: this.clientId,
                    game_id: gameId,
                    status,
                    moves_count: movesCount,
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
