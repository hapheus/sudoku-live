import { getCellCoords } from '../domain/sudoku-generator.js';

export function getSudokuCellAriaLabel(index, value, {
    variant = '3x3',
    isGiven = false,
    isConflict = false,
    notes = [],
    hint = null,
    isPartnerOwned = false,
    isPartnerFocused = false,
    isPlayerFocused = false,
} = {}) {
    const { row, col } = getCellCoords(index, variant);
    const parts = [`Row ${row + 1}, Column ${col + 1}`];

    if (value >= 1 && value <= 9) {
        if (isGiven) {
            parts.push(`given ${value}`);
        } else if (isPartnerOwned) {
            parts.push(`${value} by partner`);
        } else {
            parts.push(`${value}`);
        }
    } else {
        parts.push('empty');
        if (notes && notes.length > 0) {
            parts.push(`notes ${notes.join(', ')}`);
        }
    }

    if (isConflict) {
        parts.push('conflict');
    }

    if (hint && hint.topValue) {
        parts.push(`spectator hint ${hint.topValue}`);
    } else if (hint) {
        parts.push('spectator nudge');
    }

    if (isPlayerFocused) {
        parts.push('player cursor');
    }

    if (isPartnerFocused) {
        parts.push('partner cursor');
    }

    return parts.join(', ');
}
