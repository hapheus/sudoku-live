import React from 'react';
import { getDigitCounts } from '../domain/sudoku-engine.js';
import { getVariantSpec, inferVariantFromBoardLength } from '../domain/sudoku-generator.js';
import enMessages from '../locales/en.json';

export function PlayerControls({
    board,
    variant = null,
    notesMode,
    canUndo,
    activeDigit = null,
    highlightedDigit = null,
    isSolved = false,
    isHintArmed = false,
    onUndo,
    onErase,
    onToggleNotes,
    onFillCandidates,
    onClearNotes,
    onLocalHint,
    onDigit,
    messages = enMessages,
}) {
    const resolvedVariant = variant || inferVariantFromBoardLength(board?.length);
    const { maxDigit, gridSize } = getVariantSpec(resolvedVariant);
    const counts = getDigitCounts(board, resolvedVariant);
    const digits = Array.from({ length: maxDigit }, (_, i) => i + 1);

    return (
        <section id="player-controls" className="player-controls" aria-label="Puzzle Controls">
            <div className="tool-bar" role="toolbar" aria-label="Cell tools">
                <button
                    type="button"
                    id="undo-btn"
                    className="tool-btn"
                    disabled={!canUndo || isSolved}
                    title="Undo last move (Ctrl/Cmd+Z)"
                    onClick={onUndo}
                >
                    <svg className="tool-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                    </svg>
                    <span>{messages.undo}</span>
                </button>

                <button
                    type="button"
                    id="erase-btn"
                    className="tool-btn"
                    disabled={isSolved}
                    title="Erase cell (Backspace / Delete / 0)"
                    onClick={onErase}
                >
                    <svg className="tool-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 20H7L3 16a1 1 0 0 1 0-1.41l9.59-9.59a2 2 0 0 1 2.82 0l5.18 5.18a2 2 0 0 1 0 2.82L13.41 20" />
                    </svg>
                    <span>{messages.erase}</span>
                </button>

                <button
                    type="button"
                    id="notes-btn"
                    className={`tool-btn ${notesMode ? 'tool-btn--active' : ''}`}
                    aria-pressed={notesMode}
                    disabled={isSolved}
                    title="Toggle pencil notes (N)"
                    onClick={onToggleNotes}
                >
                    <svg className="tool-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    <span>{notesMode ? messages.notesOn : messages.notes}</span>
                    <kbd className="tool-btn__kbd" aria-hidden="true">N</kbd>
                </button>

                <button
                    type="button"
                    id="hint-btn"
                    className={`tool-btn ${isHintArmed ? 'tool-btn--hint-armed' : ''}`}
                    disabled={isSolved}
                    title={isHintArmed ? 'Tap again to fill the highlighted cell' : 'Highlight a logically solvable cell'}
                    onClick={onLocalHint}
                >
                    <svg className="tool-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" />
                    </svg>
                    <span>{messages.hint}</span>
                </button>
            </div>

            {notesMode && !isSolved && (onFillCandidates || onClearNotes) && (
                <div className="notes-quick-bar" role="group" aria-label="Pencil note helpers">
                    {onFillCandidates && (
                        <button
                            type="button"
                            id="auto-notes-btn"
                            className="notes-quick-btn"
                            onClick={onFillCandidates}
                        >
                            {messages.fillCandidates}
                        </button>
                    )}
                    {onClearNotes && (
                        <button
                            type="button"
                            id="clear-notes-btn"
                            className="notes-quick-btn notes-quick-btn--muted"
                            onClick={onClearNotes}
                        >
                            {messages.clearNotes}
                        </button>
                    )}
                </div>
            )}

            <div
                className={`numpad ${maxDigit === 6 ? 'numpad--6x6' : ''}`}
                role="group"
                aria-label={`Number pad 1 to ${maxDigit}`}
            >
                {digits.map((d) => {
                    const remaining = Math.max(0, gridSize - (counts[d] || 0));
                    const isComplete = remaining === 0;
                    const isDisabled = isSolved || (isComplete && !notesMode);
                    const isActiveDigit = activeDigit === d;
                    const isMatchedDigit = !isActiveDigit && highlightedDigit === d;

                    return (
                        <button
                            key={d}
                            type="button"
                            className={[
                                'numpad-btn',
                                isComplete ? 'numpad-btn--complete' : '',
                                isActiveDigit ? 'numpad-btn--active' : '',
                                isMatchedDigit ? 'numpad-btn--matched' : '',
                            ].filter(Boolean).join(' ')}
                            data-digit={d}
                            disabled={isDisabled}
                            aria-pressed={activeDigit !== null ? isActiveDigit : undefined}
                            aria-label={isComplete ? `${d}, all ${gridSize} placed` : `Enter ${d}, ${remaining} remaining`}
                            onClick={() => onDigit(d)}
                        >
                            <span className="numpad-btn__digit">{d}</span>{' '}
                            <span className="numpad-btn__count" aria-hidden="true">
                                {remaining > 0 ? remaining : '✓'}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
