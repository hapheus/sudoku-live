import React from 'react';
import { getDigitCounts } from '../domain/sudoku-engine.js';

export function PlayerControls({
    board,
    notesMode,
    canUndo,
    onUndo,
    onErase,
    onToggleNotes,
    onLocalHint,
    onDigit,
}) {
    const counts = getDigitCounts(board);

    return (
        <section id="player-controls" className="player-controls" aria-label="Puzzle Controls">
            <div className="tool-bar" role="toolbar" aria-label="Cell tools">
                <button
                    type="button"
                    id="undo-btn"
                    className="tool-btn"
                    disabled={!canUndo}
                    onClick={onUndo}
                >
                    <svg className="tool-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                    </svg>
                    <span>Undo</span>
                </button>

                <button type="button" id="erase-btn" className="tool-btn" onClick={onErase}>
                    <svg className="tool-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 20H7L3 16a1 1 0 0 1 0-1.41l9.59-9.59a2 2 0 0 1 2.82 0l5.18 5.18a2 2 0 0 1 0 2.82L13.41 20" />
                    </svg>
                    <span>Erase</span>
                </button>

                <button
                    type="button"
                    id="notes-btn"
                    className={`tool-btn ${notesMode ? 'tool-btn--active' : ''}`}
                    aria-pressed={notesMode}
                    onClick={onToggleNotes}
                >
                    <svg className="tool-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    <span>{notesMode ? 'Notes: On' : 'Notes: Off'}</span>
                </button>

                <button type="button" id="hint-btn" className="tool-btn" onClick={onLocalHint}>
                    <svg className="tool-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" />
                    </svg>
                    <span>Hint</span>
                </button>
            </div>

            <div className="numpad" role="group" aria-label="Number pad 1 to 9">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
                    const remaining = Math.max(0, 9 - (counts[d] || 0));
                    return (
                        <button
                            key={d}
                            type="button"
                            className={`numpad-btn ${remaining === 0 ? 'numpad-btn--complete' : ''}`}
                            data-digit={d}
                            aria-label={`Enter ${d}`}
                            onClick={() => onDigit(d)}
                        >
                            <span className="numpad-btn__digit">{d}</span>
                            <span className="numpad-btn__count" aria-hidden="true">
                                {remaining > 0 ? remaining : ''}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
