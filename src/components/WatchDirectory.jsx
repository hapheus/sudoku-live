import React from 'react';
import { getVariantSpec, inferVariantFromBoardLength } from '../domain/sudoku-generator.js';
import { isValidGameId } from '../services/online-game-client.js';
import enMessages from '../locales/en.json';

export function WatchDirectory({
    rooms,
    connectionStatus = 'connected',
    onReconnect = null,
    onRefresh,
    onWatchGame,
    onJoinGame = null,
    messages = enMessages,
}) {
    const difficultyLabels = {
        easy: messages.diffEasy,
        medium: messages.diffMedium,
        hard: messages.diffHard,
        expert: messages.diffExpert,
    };

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
        <section id="watch-directory" className="watch-box" aria-label={messages.watchTitle}>
            <div className="watch-box__header">
                <h2 className="watch-box__title">{messages.watchTitle}</h2>
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
                        {messages.watchRefresh}
                    </button>
                </div>
            </div>
            <div id="live-games-list" className="live-games-list" role="feed">
                {liveGames.length === 0 ? (
                    <div className="watch-empty">
                        <p className="live-game-card__meta">
                            {canReconnect
                                ? 'Not connected to the live server right now.'
                                : messages.watchEmpty}
                        </p>
                        <p className="watch-empty__sub">
                            {messages.watchEmptySub}
                        </p>
                    </div>
                ) : (
                    liveGames.map((game) => {
                        const inferredVariant = game.variant || inferVariantFromBoardLength(game.total_cells);
                        const spec = getVariantSpec(inferredVariant);
                        const totalCells = spec.totalCells;
                        const filledCount = Math.max(
                            0,
                            Math.min(totalCells, parseInt(game.filled_count ?? game.moves_count ?? 0, 10) || 0),
                        );
                        const diffLabel = difficultyLabels[game.difficulty] || messages.diffMedium;
                        const hasGuest = Boolean(game.has_guest);
                        const statusLabel = hasGuest ? messages.watchCoop : messages.watchOpen;

                        return (
                            <div key={game.game_id} className="live-game-card">
                                <div className="live-game-card__info">
                                    <span className="live-game-card__title">
                                        {`Room #${game.game_id.slice(0, 8)}`}
                                    </span>
                                    <span className="live-game-card__meta">
                                        {`${spec.shortLabel} • ${diffLabel} • ${statusLabel} • ${filledCount}/${totalCells}`}
                                    </span>
                                </div>
                                <div className="live-game-card__actions">
                                    {onJoinGame && (
                                        <button
                                            type="button"
                                            className="live-game-card__join-btn"
                                            data-join-id={game.game_id}
                                            disabled={hasGuest}
                                            onClick={() => onJoinGame(game.game_id)}
                                        >
                                            {hasGuest ? messages.watchFull : messages.watchJoin}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className="live-game-card__action-btn"
                                        data-watch-id={game.game_id}
                                        onClick={() => onWatchGame(game.game_id)}
                                    >
                                        {messages.watchLiveBtn}
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
}
