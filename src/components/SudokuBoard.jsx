import React from 'react';
import { getCellCoords } from '../domain/sudoku-generator.js';
import { getSudokuCellAriaLabel } from '../utils/aria-helpers.js';

export function SudokuBoard({
    gameState,
    selectedIndex,
    hintsByCell,
    floatingReactions,
    cellRefs,
    onCellSelect,
}) {
    const selectedCoords = selectedIndex !== null ? getCellCoords(selectedIndex) : null;
    const selectedValue = selectedIndex !== null ? gameState.board[selectedIndex] : 0;
    const conflictSet = new Set(gameState.conflicts || []);

    return (
        <main id="game-panel" className="board-wrapper" role="tabpanel">
            <div id="reaction-stage" className="reaction-stage" aria-live="polite" aria-atomic="false">
                {floatingReactions.map((item) => (
                    <span
                        key={item.id}
                        className="floating-emoji"
                        aria-hidden="true"
                        style={{ left: `${item.left}%` }}
                    >
                        {item.emoji}
                    </span>
                ))}
            </div>

            <div id="sudoku-board" className="sudoku-board" role="grid" aria-label="9 by 9 Sudoku grid">
                {Array.from({ length: 9 }, (_, r) => (
                    <div key={r} className="sudoku-row" role="row">
                        {Array.from({ length: 9 }, (_, c) => {
                            const idx = r * 9 + c;
                            const value = gameState.board[idx];
                            const isGiven = Boolean(gameState.givens[idx]);
                            const isSelected = idx === selectedIndex;
                            const isConflict = conflictSet.has(idx);
                            const cellNotes = gameState.notes[idx] || [];
                            const coords = getCellCoords(idx);
                            const hint = value === 0 ? (hintsByCell.get(idx) || null) : null;

                            const isPeer = selectedCoords !== null && !isSelected && (
                                coords.row === selectedCoords.row
                                || coords.col === selectedCoords.col
                                || coords.box === selectedCoords.box
                            );
                            const isSameDigit = selectedValue > 0 && value === selectedValue && !isSelected;

                            const classNames = [
                                'sudoku-cell',
                                isGiven ? 'sudoku-cell--given' : (value > 0 ? 'sudoku-cell--user' : ''),
                                isSelected ? 'sudoku-cell--selected' : '',
                                isPeer ? 'sudoku-cell--peer' : '',
                                isSameDigit ? 'sudoku-cell--same-digit' : '',
                                isConflict ? 'sudoku-cell--conflict' : '',
                                hint ? 'sudoku-cell--hinted' : '',
                                c === 2 || c === 5 ? 'sudoku-cell--box-right' : '',
                                r === 2 || r === 5 ? 'sudoku-cell--box-bottom' : '',
                            ].filter(Boolean).join(' ');

                            return (
                                <button
                                    key={idx}
                                    ref={(el) => {
                                        if (cellRefs?.current) {
                                            cellRefs.current[idx] = el;
                                        }
                                    }}
                                    type="button"
                                    className={classNames}
                                    role="gridcell"
                                    data-index={idx}
                                    aria-selected={isSelected}
                                    aria-invalid={isConflict ? 'true' : undefined}
                                    aria-label={getSudokuCellAriaLabel(idx, value, {
                                        isGiven,
                                        isConflict,
                                        notes: cellNotes,
                                        hint,
                                    })}
                                    onClick={() => onCellSelect(idx)}
                                >
                                    {value >= 1 && value <= 9 ? (
                                        <span className="sudoku-cell__digit">{value}</span>
                                    ) : (
                                        <>
                                            {cellNotes.length > 0 && (
                                                <span className="sudoku-cell__notes" aria-hidden="true">
                                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                                                        <span key={d} className="sudoku-cell__note">
                                                            {cellNotes.includes(d) ? d : ''}
                                                        </span>
                                                    ))}
                                                </span>
                                            )}
                                            {hint && (
                                                <span className="sudoku-cell__hint-badge" aria-hidden="true">
                                                    {hint.topValue || '?'}
                                                </span>
                                            )}
                                        </>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </main>
    );
}
