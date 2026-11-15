import React from 'react';
import enMessages from '../locales/en.json';

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function SolveSummary({
    difficulty,
    elapsedSeconds,
    mode,
    isSpectating,
    restartLabel,
    restartDisabled,
    onPlayAgain,
    onBackToSetup = null,
    messages = enMessages,
}) {
    const diffMap = {
        easy: messages.diffEasy,
        medium: messages.diffMedium,
        hard: messages.diffHard,
        expert: messages.diffExpert,
    };
    const diffLabel = diffMap[difficulty] || (difficulty
        ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
        : messages.diffMedium);
    const modeLabel = mode === 'online' ? messages.coopLabel : messages.soloLabel;
    const isDefaultNewPuzzle = restartLabel === 'New Puzzle' || restartLabel === messages.newPuzzle;

    return (
        <section id="solve-summary" className="solve-summary" aria-label={messages.puzzleCompletedTitle}>
            <div className="solve-summary__info">
                <h2 className="solve-summary__title">
                    {isSpectating ? messages.puzzleCompletedTitle : messages.puzzleSolvedTitle}
                </h2>
                <p className="solve-summary__meta">
                    {`${diffLabel} ${modeLabel} ${messages.finishedIn} ${formatDuration(elapsedSeconds || 0)}`}
                </p>
            </div>
            {!isSpectating && (
                <div className="solve-summary__actions">
                    <button
                        type="button"
                        className="solve-summary__cta"
                        disabled={restartDisabled}
                        onClick={onPlayAgain}
                    >
                        {isDefaultNewPuzzle ? messages.playAgain : restartLabel}
                    </button>
                    {onBackToSetup && (
                        <button
                            type="button"
                            id="solve-setup-btn"
                            className="btn-secondary solve-summary__secondary-btn"
                            onClick={onBackToSetup}
                        >
                            {messages.backToSetup || 'Back'}
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
