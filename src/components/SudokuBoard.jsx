import React from 'react';
import { getCellCoords, getVariantSpec, inferVariantFromBoardLength } from '../domain/sudoku-generator.js';
import { getSudokuCellAriaLabel } from '../utils/aria-helpers.js';

export function SudokuBoard({
    gameState,
    selectedIndex,
    activeDigit = null,
    hintsByCell,
    floatingReactions,
    cellRefs,
    onCellSelect,
    myRole = null,
    partnerCursorIndex = null,
    unitCelebration = null,
}) {
    const variant = gameState.variant || inferVariantFromBoardLength(gameState.board?.length);
    const spec = getVariantSpec(variant);
    const { gridSize, boxRows, boxCols, maxDigit } = spec;
    const is6x6 = gridSize === 6;

    const selectedCoords = selectedIndex !== null ? getCellCoords(selectedIndex, spec.id) : null;
    const selectedValue = selectedIndex !== null ? gameState.board[selectedIndex] : 0;
    const highlightedDigit = selectedValue > 0 ? selectedValue : (activeDigit || 0);
    const conflictSet = new Set(gameState.conflicts || []);
    const activeTabStop = selectedIndex !== null && selectedIndex < spec.totalCells ? selectedIndex : 0;
    const isSolved = gameState.status === 'solved';
    const celebrationId = unitCelebration?.id || 0;
    const celebrationDelays = unitCelebration?.cellDelays || null;

    const digitsList = Array.from({ length: maxDigit }, (_, i) => i + 1);
    const axisIndices = Array.from({ length: gridSize }, (_, i) => i + 1);

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

            <div className="board-frame">
                <div className={`board-col-axes ${is6x6 ? 'board-col-axes--6x6' : ''}`} aria-hidden="true">
                    {axisIndices.map((col) => (
                        <span key={col} className="board-axis-label">{`C${col}`}</span>
                    ))}
                </div>

                <div className="board-main-row">
                    <div className={`board-row-axes ${is6x6 ? 'board-row-axes--6x6' : ''}`} aria-hidden="true">
                        {axisIndices.map((row) => (
                            <span key={row} className="board-axis-label">{`R${row}`}</span>
                        ))}
                    </div>

                    <div
                        id="sudoku-board"
                        className={[
                            'sudoku-board',
                            is6x6 ? 'sudoku-board--6x6' : '',
                            isSolved ? 'sudoku-board--solved' : '',
                        ].filter(Boolean).join(' ')}
                        role="grid"
                        aria-label={`${gridSize} by ${gridSize} Sudoku grid`}
                    >
                        {Array.from({ length: gridSize }, (_, r) => (
                            <div key={r} className={`sudoku-row ${is6x6 ? 'sudoku-row--6x6' : ''}`} role="row">
                                {Array.from({ length: gridSize }, (_, c) => {
                                    const idx = r * gridSize + c;
                                    const value = gameState.board[idx];
                                    const isGiven = Boolean(gameState.givens[idx]);
                                    const isSelected = idx === selectedIndex;
                                    const isConflict = conflictSet.has(idx);
                                    const cellNotes = gameState.notes[idx] || [];
                                    const coords = getCellCoords(idx, spec.id);
                                    const hint = value === 0 ? (hintsByCell.get(idx) || null) : null;

                                    const owner = gameState.cellOwners?.[idx] || null;
                                    const isPartnerOwned = !isGiven && value > 0 && Boolean(
                                        owner && (
                                            ((myRole === 'host' || myRole === 'guest') && owner !== myRole)
                                            || (myRole === 'spectator' && owner === 'guest')
                                        ),
                                    );
                                    const isPartnerFocused = partnerCursorIndex === idx;

                                    const isPeer = selectedCoords !== null && !isSelected && (
                                        coords.row === selectedCoords.row
                                        || coords.col === selectedCoords.col
                                        || coords.box === selectedCoords.box
                                    );
                                    const isSameDigit = highlightedDigit > 0 && value === highlightedDigit && !isSelected;

                                    const isBoxRight = (c + 1) % boxCols === 0 && c < gridSize - 1;
                                    const isBoxBottom = (r + 1) % boxRows === 0 && r < gridSize - 1;
                                    const celebrateDelay = celebrationDelays?.get(idx);
                                    const isUnitCelebrating = celebrateDelay !== undefined;

                                    const classNames = [
                                        'sudoku-cell',
                                        isGiven
                                            ? 'sudoku-cell--given'
                                            : (value > 0
                                                ? (isPartnerOwned ? 'sudoku-cell--partner' : 'sudoku-cell--user')
                                                : ''),
                                        isSelected ? 'sudoku-cell--selected' : '',
                                        isPartnerFocused ? 'sudoku-cell--partner-cursor' : '',
                                        isPeer ? 'sudoku-cell--peer' : '',
                                        isSameDigit ? 'sudoku-cell--same-digit' : '',
                                        isConflict ? 'sudoku-cell--conflict' : '',
                                        hint ? 'sudoku-cell--hinted' : '',
                                        isUnitCelebrating ? 'sudoku-cell--unit-complete' : '',
                                        isBoxRight ? 'sudoku-cell--box-right' : '',
                                        isBoxBottom ? 'sudoku-cell--box-bottom' : '',
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
                                            tabIndex={idx === activeTabStop ? 0 : -1}
                                            data-index={idx}
                                            style={isUnitCelebrating ? { '--complete-delay': `${celebrateDelay}ms` } : undefined}
                                            aria-selected={isSelected}
                                            aria-invalid={isConflict ? 'true' : undefined}
                                            aria-label={getSudokuCellAriaLabel(idx, value, {
                                                variant: spec.id,
                                                isGiven,
                                                isConflict,
                                                notes: cellNotes,
                                                hint,
                                                isPartnerOwned,
                                                isPartnerFocused,
                                            })}
                                            onClick={() => onCellSelect(idx)}
                                        >
                                            {isUnitCelebrating && (
                                                <span
                                                    key={`celebrate-${celebrationId}`}
                                                    className="sudoku-cell__celebrate"
                                                    style={{ '--complete-delay': `${celebrateDelay}ms` }}
                                                    aria-hidden="true"
                                                />
                                            )}
                                            {value >= 1 && value <= maxDigit ? (
                                                <span className="sudoku-cell__digit">{value}</span>
                                            ) : (
                                                <>
                                                    {cellNotes.length > 0 && (
                                                        <span
                                                            className={`sudoku-cell__notes ${is6x6 ? 'sudoku-cell__notes--2x3' : ''}`}
                                                            aria-hidden="true"
                                                        >
                                                            {digitsList.map((d) => {
                                                                const hasNote = cellNotes.includes(d);
                                                                const isMatchedNote = hasNote && highlightedDigit === d;
                                                                return (
                                                                    <span
                                                                        key={d}
                                                                        className={`sudoku-cell__note ${isMatchedNote ? 'sudoku-cell__note--match' : ''}`}
                                                                    >
                                                                        {hasNote ? d : ''}
                                                                    </span>
                                                                );
                                                            })}
                                                        </span>
                                                    )}
                                                    {hint && (
                                                        <span className="sudoku-cell__hint-badge" aria-hidden="true">
                                                            {hint.topValue || '?'}
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                            {isPartnerFocused && (
                                                <span className="sudoku-cell__partner-pip" aria-hidden="true" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}
