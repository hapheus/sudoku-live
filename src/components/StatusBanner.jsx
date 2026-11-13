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
}) {
    const diffLabel = gameState.difficulty
        ? gameState.difficulty.charAt(0).toUpperCase() + gameState.difficulty.slice(1)
        : 'Medium';

    let statusText = `${diffLabel} — ${gameState.filledCount}/81 filled`;
    let badgeType = 'active-turn';

    if (gameState.status === 'solved') {
        statusText = mode === 'online' || isSpectating
            ? `Puzzle solved! (${diffLabel})`
            : `Solved! (${diffLabel})`;
        badgeType = 'success';
    } else if (gameState.conflicts && gameState.conflicts.length > 0) {
        statusText = `${diffLabel} — ${gameState.conflicts.length} conflicting cell${gameState.conflicts.length === 1 ? '' : 's'}`;
        badgeType = 'alert';
    } else if (isSpectating) {
        statusText = `Watching Live (${diffLabel}) — ${gameState.filledCount}/81 filled`;
        badgeType = 'waiting';
    } else if (mode === 'online') {
        statusText = `Co-op (${diffLabel}) — ${gameState.filledCount}/81 filled`;
    }

    // Connection badge
    let connectionBadge = null;
    if (mode === 'solo' && !isSpectating) {
        if (connectionStatus === 'connected') {
            connectionBadge = (
                <span id="connection-status" className="connection-badge connection-badge--connected" aria-live="polite">
                    Live Watch Ready
                </span>
            );
        }
    } else if (mode === 'online' || isSpectating) {
        const labels = {
            connected: 'Connected',
            connecting: 'Connecting...',
            unavailable: 'Offline',
            failed: 'Connection error',
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

    return (
        <section className="status-banner" aria-label="Game Status">
            <div className="status-meta-row">
                {connectionBadge}
                {opponentBadge}
                {spectatorBadge}
            </div>

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
