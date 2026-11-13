import React from 'react';
import { getCellCoords } from '../domain/sudoku-generator.js';

export function SpectatorHintsFeed({ hintsByCell, canApply, onSelectHint, onApplyHint }) {
    if (!hintsByCell || hintsByCell.size === 0) {
        return null;
    }

    return (
        <section id="spectator-hints-feed" className="hints-feed" aria-label="Spectator Hints">
            <span className="hints-feed__label">Spectator hints:</span>
            {Array.from(hintsByCell.values()).map((hint) => {
                const { row, col } = getCellCoords(hint.index);
                const digitPart = hint.topValue ? ` → ${hint.topValue}` : ' (check cell)';
                const countPart = hint.count > 1 ? ` ×${hint.count}` : '';
                const title = canApply && hint.topValue
                    ? `Apply hint ${hint.topValue} to Row ${row + 1}, Column ${col + 1}`
                    : `Highlight Row ${row + 1}, Column ${col + 1}`;

                return (
                    <button
                        key={hint.index}
                        type="button"
                        className="hint-chip"
                        title={title}
                        onClick={() => {
                            if (canApply && hint.topValue) {
                                onApplyHint(hint.index, hint.topValue);
                            } else {
                                onSelectHint(hint.index);
                            }
                        }}
                    >
                        {`R${row + 1}C${col + 1}${digitPart}${countPart}`}
                    </button>
                );
            })}
        </section>
    );
}
