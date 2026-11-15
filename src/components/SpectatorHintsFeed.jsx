import React from 'react';
import { formatCellCoord, getCellCoords } from '../domain/sudoku-generator.js';
import enMessages from '../locales/en.json';

export function SpectatorHintsFeed({ hintsByCell, variant = '3x3', canApply, onSelectHint, onApplyHint, messages = enMessages }) {
    if (!hintsByCell || hintsByCell.size === 0) {
        return null;
    }

    return (
        <section id="spectator-hints-feed" className="hints-feed" aria-label="Spectator Hints">
            <span className="hints-feed__label">{messages.hintsFeedLabel}</span>
            {Array.from(hintsByCell.values()).map((hint) => {
                const { row, col } = getCellCoords(hint.index, variant);
                const cellLabel = formatCellCoord(hint.index, variant);
                const digitPart = hint.topValue ? ` → ${hint.topValue}` : ' (check cell)';
                const countPart = hint.count > 1 ? ` ×${hint.count}` : '';
                const title = canApply && hint.topValue
                    ? `Apply hint ${hint.topValue} to ${cellLabel} (Row ${row + 1}, Column ${col + 1})`
                    : `Highlight ${cellLabel} (Row ${row + 1}, Column ${col + 1})`;

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
                        {`${cellLabel}${digitPart}${countPart}`}
                    </button>
                );
            })}
        </section>
    );
}
