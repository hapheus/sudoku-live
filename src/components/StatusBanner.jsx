import React from 'react';
import { getVariantSpec, inferVariantFromBoardLength } from '../domain/sudoku-generator.js';
import { formatGameDuration } from '../utils/format-duration.js';
import enMessages from '../locales/en.json';

function formatPartnerStatusLabel(partnerCount, partnerOnline, partnerMembers, messages) {
    if (partnerCount > 1) {
        return (messages.partnersOnline || '{count} Partners online').replace('{count}', String(partnerCount));
    }
    if (!partnerOnline) {
        return messages.partnerDisconnected;
    }
    const singlePartnerName = partnerMembers[0]?.displayName;
    return singlePartnerName ? `${singlePartnerName} (${messages.partnerOnline})` : messages.partnerOnline;
}

function formatSpectatorOpponentLabel(resolvedMode, hostOnline, guestCount, guestOnline) {
    const hostState = hostOnline ? 'Online' : 'Offline';
    if (resolvedMode === 'solo' && !guestOnline) {
        return `Solo Player: ${hostState}`;
    }
    if (guestCount > 1) {
        return `Host: ${hostState} | Partners: ${guestCount} Online`;
    }
    const guestState = guestOnline ? 'Online' : 'Offline';
    return `Host: ${hostState} | Partner: ${guestState}`;
}

export function StatusBanner({
    connectionStatus,
    mode,
    isSpectating,
    myRole,
    myClientId = null,
    currentMembers,
    spectatedGameMode,
    gameState,
    onReconnect,
    onContinueSolo = null,
    messages = enMessages,
}) {
    const variant = gameState.variant || inferVariantFromBoardLength(gameState.board?.length);
    const spec = getVariantSpec(variant);
    const diffLabels = {
        easy: messages.diffEasy,
        medium: messages.diffMedium,
        hard: messages.diffHard,
        expert: messages.diffExpert,
    };
    const diffLabel = diffLabels[gameState.difficulty] || messages.diffMedium;

    const partnerMembers = currentMembers.filter((m) => (
        (m.role === 'host' || m.role === 'guest')
        && (myClientId ? m.id !== myClientId : m.role !== myRole)
    ));
    const partnerCount = partnerMembers.length;
    const partnerOnline = partnerCount > 0;
    const myMember = currentMembers.find((m) => (myClientId ? m.id === myClientId : m.role === myRole));
    const isCoopActive = !isSpectating && (mode === 'online' || partnerOnline || myRole === 'guest');

    let statusText = `${spec.shortLabel} ${diffLabel} • ${messages.soloLabel}`;
    let badgeType = 'active-turn';

    if (gameState.status === 'solved') {
        statusText = isCoopActive || isSpectating
            ? `Puzzle solved • ${spec.shortLabel} ${diffLabel}`
            : `Solved • ${spec.shortLabel} ${diffLabel}`;
        badgeType = 'success';
    } else if (gameState.conflicts && gameState.conflicts.length > 0) {
        statusText = `${gameState.conflicts.length} conflicting cell${gameState.conflicts.length === 1 ? '' : 's'}`;
        badgeType = 'alert';
    } else if (isSpectating) {
        statusText = `${messages.watchingLabel} • ${spec.shortLabel} ${diffLabel}`;
        badgeType = 'waiting';
    } else if (isCoopActive) {
        statusText = `${messages.coopLabel} • ${spec.shortLabel} ${diffLabel}`;
    }

    // Connection badge (shown when playing co-op or spectating)
    let connectionBadge = null;
    const isRealtimeMode = isCoopActive || isSpectating;
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
    let continueSoloBtn = null;
    let spectatorBadge = null;
    let coopLegend = null;
    const spectatorCount = currentMembers.filter((m) => m.role === 'spectator').length;

    if (!isSpectating) {
        if (isCoopActive && (myRole === 'host' || myRole === 'guest')) {
            const partnerStatusLabel = formatPartnerStatusLabel(partnerCount, partnerOnline, partnerMembers, messages);
            opponentBadge = (
                <span
                    id="opponent-status"
                    className={`presence-badge ${partnerOnline ? 'presence-badge--online' : 'presence-badge--offline'}`}
                    aria-live="polite"
                >
                    {partnerStatusLabel}
                </span>
            );

            if (!partnerOnline && gameState.status !== 'solved' && onContinueSolo) {
                continueSoloBtn = (
                    <button
                        type="button"
                        id="continue-solo-btn"
                        className="connection-retry-btn"
                        onClick={onContinueSolo}
                    >
                        {messages.continueSolo || 'Continue Solo'}
                    </button>
                );
            }

            coopLegend = (
                <span className="coop-legend" aria-label="Cell ownership colors">
                    <span className="coop-legend__item coop-legend__item--self">
                        <span className="coop-legend__swatch" aria-hidden="true" />
                        {myMember?.displayName ? `${messages.youLabel} (${myMember.displayName})` : messages.youLabel}
                    </span>
                    <span className="coop-legend__item coop-legend__item--partner">
                        <span className="coop-legend__swatch" aria-hidden="true" />
                        {partnerCount === 1 && partnerMembers[0]?.displayName ? partnerMembers[0].displayName : messages.partnerLabel}
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
    } else {
        const hostMember = currentMembers.find((m) => m.role === 'host');
        const hostOnline = Boolean(hostMember);
        const guestCount = currentMembers.filter((m) => m.role === 'guest').length;
        const guestOnline = guestCount > 0;
        const resolvedMode = guestOnline ? 'online' : (hostMember?.game_mode || spectatedGameMode);

        opponentBadge = (
            <span id="opponent-status" className="presence-badge" aria-live="polite">
                {formatSpectatorOpponentLabel(resolvedMode, hostOnline, guestCount, guestOnline)}
            </span>
        );

        spectatorBadge = (
            <span id="spectator-status" className="presence-badge presence-badge--spectators" aria-live="polite">
                {`${spectatorCount} Watching`}
            </span>
        );
    }

    const hasMetaBadges = Boolean(connectionBadge || canRetryConnection || opponentBadge || continueSoloBtn || spectatorBadge || coopLegend);

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
                    {continueSoloBtn}
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
                        {`${gameState.filledCount}/${spec.totalCells}`}
                    </span>
                    <span id="sudoku-timer" className="telemetry-pill" aria-label="Elapsed time">
                        {formatGameDuration(gameState.elapsedSeconds || 0)}
                    </span>
                </div>
            </div>
        </section>
    );
}
