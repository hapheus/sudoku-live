import React from 'react';
import { isValidGameId } from '../services/online-game-client.js';

const DIFFICULTY_LABELS = {
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
    expert: 'Expert',
};

export function WatchDirectory({
    rooms,
    connectionStatus = 'connected',
    onReconnect = null,
    onRefresh,
    onWatchGame,
}) {
    const seenGameIds = new Set();
    const liveGames = [];

    for (const room of rooms || []) {
        if (!room || !isValidGameId(room.game_id) || room.status === 'solved' || room.status === 'finished') {
            continue;
        }
        if (seenGameIds.has(room.game_id)) {
            continue;
        }
        seenGameIds.add(room.game_id);
        liveGames.push(room);
    }

    const canReconnect = connectionStatus === 'failed' || connectionStatus === 'disconnected' || connectionStatus === 'unavailable';
    const connectionLabels = {
        connected: 'Live',
        connecting: 'Connecting...',
        unavailable: 'Offline',
        failed: 'Connection lost',
        disconnected: 'Disconnected',
    };

    return (
        <section id="watch-directory" className="watch-box" aria-label="Live Games Directory">
            <div className="watch-box__header">
                <h2 className="watch-box__title">Live Sudoku Matches</h2>
                <div className="watch-box__actions">
                    <span className={`connection-badge connection-badge--${connectionStatus}`} aria-live="polite">
                        {connectionLabels[connectionStatus] || connectionStatus}
                    </span>
                    {canReconnect && onReconnect && (
                        <button
                            type="button"
                            className="connection-retry-btn"
                            onClick={onReconnect}
                        >
                            Reconnect
                        </button>
                    )}
                    <button
                        type="button"
                        id="refresh-live-games-btn"
                        className="watch-box__refresh-btn"
                        onClick={onRefresh}
                    >
                        Refresh
                    </button>
                </div>
            </div>
            <div id="live-games-list" className="live-games-list" role="feed">
                {liveGames.length === 0 ? (
                    <div className="watch-empty">
                        <p className="live-game-card__meta">
                            {canReconnect
                                ? 'Not connected to the live server right now.'
                                : 'No live Sudoku matches right now.'}
                        </p>
                        <p className="watch-empty__sub">
                            Start a Solo or Online Co-op game and it will appear here in real time.
                        </p>
                    </div>
                ) : (
                    liveGames.map((game) => {
                        const filledCount = Math.max(
                            0,
                            Math.min(81, parseInt(game.filled_count ?? game.moves_count ?? 0, 10) || 0),
                        );
                        const diffLabel = DIFFICULTY_LABELS[game.difficulty] || 'Medium';
                        const modeLabel = game.game_mode === 'solo' ? 'Solo' : 'Co-op';
                        const statusLabel = game.status === 'waiting' && game.game_mode !== 'solo'
                            ? 'Waiting for partner'
                            : 'Solving live';

                        return (
                            <div key={game.game_id} className="live-game-card">
                                <div className="live-game-card__info">
                                    <span className="live-game-card__title">
                                        {`Room #${game.game_id.slice(0, 8)}`}
                                    </span>
                                    <span className="live-game-card__meta">
                                        {`${modeLabel} • ${diffLabel} • ${statusLabel} • ${filledCount}/81`}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className="live-game-card__action-btn"
                                    data-watch-id={game.game_id}
                                    onClick={() => onWatchGame(game.game_id)}
                                >
                                    Watch Live
                                </button>
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
}
