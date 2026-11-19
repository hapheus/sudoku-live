import React from 'react';

export function GameToolbar({
    isSpectating,
    start,
    children,
    isGameInfoOpen,
    gameInfoOpenerRef,
    onToggleInfo,
    isHelpOpen,
    onToggleGuide,
    messages,
}) {
    return (
        <div id={isSpectating ? 'spectator-bar' : undefined} className="game-top-bar">
            {start || <span />}
            <div className="game-top-bar__actions">
                <button
                    ref={gameInfoOpenerRef}
                    type="button"
                    id="game-info-btn"
                    className="game-top-bar__icon-btn"
                    aria-label={isGameInfoOpen ? messages.closeGameInfo : messages.openGameInfo}
                    title={isGameInfoOpen ? messages.closeGameInfo : messages.openGameInfo}
                    aria-expanded={isGameInfoOpen}
                    aria-controls={isGameInfoOpen ? 'game-info-dialog' : undefined}
                    onClick={onToggleInfo}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 11v5m0-8h.01" />
                    </svg>
                </button>
                <button
                    type="button"
                    id="game-help-btn"
                    className="game-top-bar__icon-btn"
                    aria-label={isHelpOpen ? messages.closeGuide : messages.openGuide}
                    title={isHelpOpen ? messages.closeGuide : messages.openGuide}
                    aria-expanded={isHelpOpen}
                    aria-controls={isHelpOpen ? 'help-dialog' : undefined}
                    onClick={onToggleGuide}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <path d="M12 17h.01" />
                    </svg>
                </button>
                {children}
            </div>
        </div>
    );
}
