import React from 'react';
import { getCellCoords, getColLabel, getVariantSpec, inferVariantFromBoardLength } from '../domain/sudoku-generator.js';
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
    playerCursorIndex = null,
    partnerCursorIndex = null,
    partnerCursorIndices = null,
    unitCelebration = null,
    hintHighlight = null,
    fistBump = null,
    boardBackground = null,
    messages = null,
}) {
    const variant = gameState.variant || inferVariantFromBoardLength(gameState.board?.length);
    const spec = getVariantSpec(variant);
    const { gridSize, boxRows, boxCols, maxDigit } = spec;
    const is6x6 = gridSize === 6;

    const focusAnchorIndex = selectedIndex !== null ? selectedIndex : playerCursorIndex;
    const focusCoords = focusAnchorIndex !== null ? getCellCoords(focusAnchorIndex, spec.id) : null;
    const focusValue = focusAnchorIndex !== null ? gameState.board[focusAnchorIndex] : 0;
    const highlightedDigit = focusValue > 0 ? focusValue : (activeDigit || 0);
    const partnerCursorSet = new Set(Array.isArray(partnerCursorIndices) ? partnerCursorIndices : []);
    if (partnerCursorIndex !== null && partnerCursorIndex !== undefined) {
        partnerCursorSet.add(partnerCursorIndex);
    }
    const conflictSet = new Set(gameState.conflicts || []);
    const activeTabStop = selectedIndex !== null && selectedIndex < spec.totalCells ? selectedIndex : 0;
    const isSolved = gameState.status === 'solved';
    const hasArtwork = Boolean(boardBackground?.src);
    const celebrationId = unitCelebration?.id || 0;
    const celebrationDelays = unitCelebration?.cellDelays || null;
    const hintHighlightId = hintHighlight?.id || 0;
    const hintHighlightMode = hintHighlight?.mode || 'solve';
    const isHintPreview = hintHighlightMode === 'preview';
    const hintHighlightTarget = hintHighlight?.targetIndex ?? null;
    const hintHighlightDelays = hintHighlight?.contextDelays || null;

    const completedUnitCells = new Set();
    if (hasArtwork && Array.isArray(gameState.board) && gameState.board.length === spec.totalCells) {
        for (let r = 0; r < gridSize; r += 1) {
            let rowComplete = true;
            for (let c = 0; c < gridSize; c += 1) {
                const i = r * gridSize + c;
                if (gameState.board[i] <= 0 || conflictSet.has(i)) {
                    rowComplete = false;
                    break;
                }
            }
            if (rowComplete) {
                for (let c = 0; c < gridSize; c += 1) {
                    completedUnitCells.add(r * gridSize + c);
                }
            }
        }
        for (let c = 0; c < gridSize; c += 1) {
            let colComplete = true;
            for (let r = 0; r < gridSize; r += 1) {
                const i = r * gridSize + c;
                if (gameState.board[i] <= 0 || conflictSet.has(i)) {
                    colComplete = false;
                    break;
                }
            }
            if (colComplete) {
                for (let r = 0; r < gridSize; r += 1) {
                    completedUnitCells.add(r * gridSize + c);
                }
            }
        }
        const boxCountCols = gridSize / boxCols;
        const boxCountRows = gridSize / boxRows;
        for (let br = 0; br < boxCountRows; br += 1) {
            for (let bc = 0; bc < boxCountCols; bc += 1) {
                let boxComplete = true;
                const indices = [];
                for (let dr = 0; dr < boxRows; dr += 1) {
                    for (let dc = 0; dc < boxCols; dc += 1) {
                        const i = (br * boxRows + dr) * gridSize + (bc * boxCols + dc);
                        indices.push(i);
                        if (gameState.board[i] <= 0 || conflictSet.has(i)) {
                            boxComplete = false;
                        }
                    }
                }
                if (boxComplete) {
                    for (const i of indices) {
                        completedUnitCells.add(i);
                    }
                }
            }
        }
    }

    const digitsList = Array.from({ length: maxDigit }, (_, i) => i + 1);
    const axisIndices = Array.from({ length: gridSize }, (_, i) => i + 1);

    return (
        <div id="game-panel" className="board-wrapper">
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
                        <span key={col} className="board-axis-label">{getColLabel(col - 1)}</span>
                    ))}
                </div>

                <div className="board-main-row">
                    <div className={`board-row-axes ${is6x6 ? 'board-row-axes--6x6' : ''}`} aria-hidden="true">
                        {axisIndices.map((row) => (
                            <span key={row} className="board-axis-label">{String(row)}</span>
                        ))}
                    </div>

                    <div
                        id="sudoku-board"
                        className={[
                            'sudoku-board',
                            is6x6 ? 'sudoku-board--6x6' : '',
                            hasArtwork ? 'sudoku-board--has-artwork' : '',
                            isSolved ? 'sudoku-board--solved' : '',
                        ].filter(Boolean).join(' ')}
                        role="grid"
                        aria-label={`${gridSize} by ${gridSize} Sudoku grid`}
                    >
                        {hasArtwork && (
                            <div className="sudoku-board__artwork" aria-hidden="true">
                                <img
                                    src={boardBackground.src}
                                    alt=""
                                    className="sudoku-board__artwork-img"
                                    draggable={false}
                                />
                            </div>
                        )}
                        {Array.from({ length: gridSize }, (_, r) => (
                            <div key={r} className={`sudoku-row ${is6x6 ? 'sudoku-row--6x6' : ''}`} role="row">
                                {Array.from({ length: gridSize }, (_, c) => {
                                    const idx = r * gridSize + c;
                                    const value = gameState.board[idx];
                                    const isGiven = Boolean(gameState.givens[idx]);
                                    const isSelected = idx === selectedIndex;
                                    const isConflict = conflictSet.has(idx);
                                    const isRevealed = hasArtwork && value > 0 && !isConflict;
                                    const isUnitRevealed = isRevealed && completedUnitCells.has(idx);
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
                                    const isPlayerFocused = playerCursorIndex === idx;
                                    const isPartnerFocused = partnerCursorSet.has(idx);

                                    const isFocusAnchor = isSelected || (selectedIndex === null && isPlayerFocused);
                                    const isPeer = focusCoords !== null && !isFocusAnchor && (
                                        coords.row === focusCoords.row
                                        || coords.col === focusCoords.col
                                        || coords.box === focusCoords.box
                                    );
                                    const isSameDigit = highlightedDigit > 0 && value === highlightedDigit && !isFocusAnchor;

                                    const isBoxRight = (c + 1) % boxCols === 0 && c < gridSize - 1;
                                    const isBoxBottom = (r + 1) % boxRows === 0 && r < gridSize - 1;
                                    const celebrateDelay = celebrationDelays?.get(idx);
                                    const isUnitCelebrating = celebrateDelay !== undefined;
                                    const hintDelay = hintHighlightDelays?.get(idx);
                                    const isHintTarget = hintHighlightTarget === idx && hintDelay !== undefined;
                                    const isHintContext = hintDelay !== undefined && !isHintTarget;
                                    const isFistBumpCell = fistBump?.index === idx;

                                    const cellStyle = {};
                                    if (isUnitCelebrating) {
                                        cellStyle['--complete-delay'] = `${celebrateDelay}ms`;
                                    }
                                    if (hasArtwork && isSolved) {
                                        cellStyle['--solve-delay'] = `${(r + c) * 42}ms`;
                                    }

                                    const classNames = [
                                        'sudoku-cell',
                                        isGiven
                                            ? 'sudoku-cell--given'
                                            : (value > 0
                                                ? (isPartnerOwned ? 'sudoku-cell--partner' : 'sudoku-cell--user')
                                                : ''),
                                        isRevealed ? 'sudoku-cell--revealed' : '',
                                        isUnitRevealed ? 'sudoku-cell--unit-revealed' : '',
                                        isSelected ? 'sudoku-cell--selected' : '',
                                        isPlayerFocused ? 'sudoku-cell--player-cursor' : '',
                                        isPartnerFocused ? 'sudoku-cell--partner-cursor' : '',
                                        isPeer ? 'sudoku-cell--peer' : '',
                                        isSameDigit ? 'sudoku-cell--same-digit' : '',
                                        isConflict ? 'sudoku-cell--conflict' : '',
                                        hint ? 'sudoku-cell--hinted' : '',
                                        isUnitCelebrating ? 'sudoku-cell--unit-complete' : '',
                                        isHintTarget ? 'sudoku-cell--hint-target' : '',
                                        isHintContext ? 'sudoku-cell--hint-context' : '',
                                        (isHintTarget || isHintContext) && isHintPreview ? 'sudoku-cell--hint-preview' : '',
                                        isFistBumpCell ? 'sudoku-cell--fist-bump' : '',
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
                                            style={Object.keys(cellStyle).length > 0 ? cellStyle : undefined}
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
                                                isPlayerFocused,
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
                                            {(isHintTarget || isHintContext) && (
                                                <span
                                                    key={`hint-hl-${hintHighlightId}-${hintHighlightMode}`}
                                                    className={isHintTarget ? 'sudoku-cell__hint-flash sudoku-cell__hint-flash--target' : 'sudoku-cell__hint-flash'}
                                                    style={{ '--hint-delay': `${hintDelay}ms` }}
                                                    aria-hidden="true"
                                                />
                                            )}
                                            {isFistBumpCell && (
                                                <span
                                                    key={`fist-bump-${fistBump.id}`}
                                                    className="sudoku-cell__fist-bump"
                                                    aria-hidden="true"
                                                >
                                                    <span className="sudoku-cell__fist-bump-emoji">🤜🤛</span>
                                                    <span className="sudoku-cell__fist-bump-text">
                                                        {messages?.[fistBump.phraseKey] || 'Awesome!'}
                                                    </span>
                                                </span>
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
                                            {isPlayerFocused && (
                                                <span className="sudoku-cell__player-pip" aria-hidden="true" />
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
        </div>
    );
}
