import React from 'react';

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function StatusBanner({
    connectionStatus,
    mode,
    isSpectating,
    myRole,
    currentMembers,
    spectatedGameMode,
    gameState,
    onReconnect,
}) {
    const diffLabel = gameState.difficulty
        ? gameState.difficulty.charAt(0).toUpperCase() + gameState.difficulty.slice(1)
        : 'Medium';

    let statusText = `${diffLabel} • Solo`;
    let badgeType = 'active-turn';

    if (gameState.status === 'solved') {
        statusText = mode === 'online' || isSpectating
            ? `Puzzle solved • ${diffLabel}`
            : `Solved • ${diffLabel}`;
        badgeType = 'success';
    } else if (gameState.conflicts && gameState.conflicts.length > 0) {
        statusText = `${gameState.conflicts.length} conflicting cell${gameState.conflicts.length === 1 ? '' : 's'}`;
        badgeType = 'alert';
    } else if (isSpectating) {
        statusText = `Watching Live • ${diffLabel}`;
        badgeType = 'waiting';
    } else if (mode === 'online') {
        statusText = `Co-op • ${diffLabel}`;
    }

    // Connection badge (shown only for multiplayer or live spectating)
    let connectionBadge = null;
    const isRealtimeMode = mode === 'online' || isSpectating;
    const canRetryConnection = isRealtimeMode
        && (connectionStatus === 'failed' || connectionStatus === 'disconnected' || connectionStatus === 'unavailable');

    if (isRealtimeMode) {
        const labels = {
            connected: 'Live',
            connecting: 'Connecting...',
            unavailable: 'Offline',
            failed: 'Connection lost',
            disconnected: 'Disconnected',
        };
        connectionBadge = (
            <span
                id="connection-status"
                className={`connection-badge connection-badge--${connectionStatus}`}
                aria-live="polite"
            >
                {labels[connectionStatus] || connectionStatus}
            </span>
        );
    }

    // Presence badges
    let opponentBadge = null;
    let spectatorBadge = null;
    let coopLegend = null;
    const spectatorCount = currentMembers.filter((m) => m.role === 'spectator').length;

    if ((mode === 'online' || mode === 'solo') && !isSpectating) {
        if (mode === 'online' && (myRole === 'host' || myRole === 'guest')) {
            const partnerRole = myRole === 'host' ? 'guest' : 'host';
            const partnerOnline = currentMembers.some((m) => m.role === partnerRole);
            opponentBadge = (
                <span
                    id="opponent-status"
                    className={`presence-badge ${partnerOnline ? 'presence-badge--online' : 'presence-badge--offline'}`}
                    aria-live="polite"
                >
                    {partnerOnline ? 'Partner online' : 'Waiting for partner'}
                </span>
            );

            coopLegend = (
                <span className="coop-legend" aria-label="Cell ownership colors">
                    <span className="coop-legend__item coop-legend__item--self">
                        <span className="coop-legend__swatch" aria-hidden="true" />
                        You
                    </span>
                    <span className="coop-legend__item coop-legend__item--partner">
                        <span className="coop-legend__swatch" aria-hidden="true" />
                        Partner
                    </span>
                </span>
            );
        }

        if (spectatorCount > 0) {
            spectatorBadge = (
                <span id="spectator-status" className="presence-badge presence-badge--spectators" aria-live="polite">
                    {`${spectatorCount} Spectator${spectatorCount === 1 ? '' : 's'}`}
                </span>
            );
        }
    } else if (isSpectating) {
        const hostMember = currentMembers.find((m) => m.role === 'host');
        const hostOnline = Boolean(hostMember);
        const guestOnline = currentMembers.some((m) => m.role === 'guest');
        const resolvedMode = hostMember?.game_mode || spectatedGameMode;

        opponentBadge = (
            <span id="opponent-status" className="presence-badge" aria-live="polite">
                {resolvedMode === 'solo'
                    ? `Solo Player: ${hostOnline ? 'Online' : 'Offline'}`
                    : `Host: ${hostOnline ? 'Online' : 'Offline'} | Partner: ${guestOnline ? 'Online' : 'Offline'}`}
            </span>
        );

        spectatorBadge = (
            <span id="spectator-status" className="presence-badge presence-badge--spectators" aria-live="polite">
                {`${spectatorCount} Watching`}
            </span>
        );
    }

    const hasMetaBadges = Boolean(connectionBadge || canRetryConnection || opponentBadge || spectatorBadge || coopLegend);

    return (
        <section className="status-banner" aria-label="Game Status">
            {hasMetaBadges && (
                <div className="status-meta-row">
                    {connectionBadge}
                    {canRetryConnection && onReconnect && (
                        <button
                            type="button"
                            id="reconnect-btn"
                            className="connection-retry-btn"
                            onClick={onReconnect}
                        >
                            Reconnect
                        </button>
                    )}
                    {opponentBadge}
                    {spectatorBadge}
                    {coopLegend}
                </div>
            )}

            <div className="status-primary-row">
                <div id="game-status-text" className={`status-badge status-badge--${badgeType}`} role="status">
                    {statusText}
                </div>
                <div className="telemetry-pills">
                    <span id="sudoku-progress" className="telemetry-pill" aria-label="Filled cells">
                        {`${gameState.filledCount}/81`}
                    </span>
                    <span id="sudoku-timer" className="telemetry-pill" aria-label="Elapsed time">
                        {formatTime(gameState.elapsedSeconds || 0)}
                    </span>
                </div>
            </div>
        </section>
    );
}
