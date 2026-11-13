import React from 'react';

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
}) {
    const diffLabel = difficulty
        ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
        : 'Medium';
    const modeLabel = mode === 'online' ? 'Co-op' : 'Solo';

    return (
        <section id="solve-summary" className="solve-summary" aria-label="Puzzle Completed">
            <div className="solve-summary__info">
                <h2 className="solve-summary__title">
                    {isSpectating ? 'Puzzle Completed' : 'Puzzle Solved'}
                </h2>
                <p className="solve-summary__meta">
                    {`${diffLabel} ${modeLabel} finished in ${formatDuration(elapsedSeconds || 0)}`}
                </p>
            </div>
            {!isSpectating && (
                <button
                    type="button"
                    className="solve-summary__cta"
                    disabled={restartDisabled}
                    onClick={onPlayAgain}
                >
                    {restartLabel === 'New Puzzle' ? 'Play Again' : restartLabel}
                </button>
            )}
        </section>
    );
}
