import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

// Make Pusher available in window for Echo
window.Pusher = Pusher;

export class OnlineGameClient {
    constructor({
        reverbConfig,
        onStateUpdated,
        onConnectionChange,
        onPresenceChange,
        onMemberJoin,
        onMemberLeave,
    }) {
        this.reverbConfig = reverbConfig;
        this.onStateUpdated = onStateUpdated || (() => {});
        this.onConnectionChange = onConnectionChange || (() => {});
        this.onPresenceChange = onPresenceChange || (() => {});
        this.onMemberJoin = onMemberJoin || (() => {});
        this.onMemberLeave = onMemberLeave || (() => {});
        this.echo = null;
        this.channel = null;
        this.gameId = null;
        this.token = null;
    }

    async createGame() {
        const response = await fetch('/api/games', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to create game.');
        }

        return await response.json();
    }

    async joinGame(gameId, token = null) {
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        };
        if (token) {
            headers['X-Participant-Token'] = token;
        }

        const response = await fetch(`/api/games/${gameId}/join`, {
            method: 'POST',
            headers,
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to join game.');
        }

        return await response.json();
    }

    async fetchGameState(gameId, token = null) {
        const headers = { 'Accept': 'application/json' };
        if (token) {
            headers['X-Participant-Token'] = token;
        }

        const response = await fetch(`/api/games/${gameId}`, { headers });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to load game.');
        }

        const data = await response.json();
        return data.state;
    }

    async fetchLiveGames() {
        const response = await fetch('/api/games/live', {
            headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to load live games.');
        }

        return await response.json();
    }

    async sendMove(gameId, token, index, expectedVersion) {
        const response = await fetch(`/api/games/${gameId}/moves`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Participant-Token': token,
            },
            body: JSON.stringify({ index, expected_version: expectedVersion }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || 'Move failed.');
        }

        const data = await response.json();
        return data.state;
    }

    async requestRematch(gameId, token) {
        const response = await fetch(`/api/games/${gameId}/rematch`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'X-Participant-Token': token,
            },
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || 'Failed to request rematch.');
        }

        const data = await response.json();
        return data.state;
    }

    subscribe(gameId, token = null) {
        this.gameId = gameId;
        this.token = token;

        if (this.echo) {
            this.disconnect();
        }

        const isHttps = this.reverbConfig.scheme === 'https' || window.location.protocol === 'https:';
        const port = parseInt(this.reverbConfig.port || (isHttps ? 443 : 80), 10);
        const host = (this.reverbConfig.host && this.reverbConfig.host !== 'localhost' && this.reverbConfig.host !== '127.0.0.1')
            ? this.reverbConfig.host
            : (window.location.hostname || 'localhost');

        const authHeaders = {};
        if (token) {
            authHeaders['X-Participant-Token'] = token;
        }

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

        // Connection status tracking
        const pusherConnection = this.echo.connector.pusher.connection;
        this.onConnectionChange(pusherConnection.state);

        pusherConnection.bind('state_change', (states) => {
            this.onConnectionChange(states.current);

            // Reconnected: fetch latest authoritative state in case events were missed
            if (states.current === 'connected' && states.previous !== 'connecting') {
                this.fetchGameState(this.gameId, this.token)
                    .then((state) => this.onStateUpdated(state))
                    .catch(() => {});
            }
        });

        // Presence Channel: tracks active players and spectators in real time with zero DB writes
        this.channel = this.echo.join(`games.${gameId}`);

        this.channel
            .here((members) => {
                this.onPresenceChange(members);
            })
            .joining((member) => {
                this.onMemberJoin(member);
            })
            .leaving((member) => {
                this.onMemberLeave(member);
            })
            .listen('.GameUpdated', (payload) => {
                if (payload && payload.state) {
                    this.onStateUpdated(payload.state);
                }
            });
    }

    disconnect() {
        if (this.channel && this.gameId && this.echo) {
            try {
                this.echo.leave(`games.${this.gameId}`);
            } catch {
                // Ignore
            }
            this.channel = null;
        }
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
