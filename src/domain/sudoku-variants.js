/**
 * Sudoku variant specifications, coordinate helpers, and unit definitions.
 *
 * Supports:
 * - '3x3' (9x9 grid, 3x3 boxes, digits 1..9, 81 cells)
 * - '2x3' (6x6 grid, 2x3 boxes, digits 1..6, 36 cells)
 */

export const DIFFICULTY_PRESETS = {
    easy: { label: 'Easy', minClues: 38, maxClues: 42 },
    medium: { label: 'Medium', minClues: 30, maxClues: 34 },
    hard: { label: 'Hard', minClues: 25, maxClues: 28 },
    expert: { label: 'Expert', minClues: 22, maxClues: 25 },
};

export const SUDOKU_VARIANTS = {
    '3x3': {
        id: '3x3',
        label: '3×3 (9×9)',
        shortLabel: '3×3',
        gridSize: 9,
        totalCells: 81,
        boxRows: 3,
        boxCols: 3,
        maxDigit: 9,
        presets: DIFFICULTY_PRESETS,
    },
    '2x3': {
        id: '2x3',
        label: '2×3 (6×6)',
        shortLabel: '2×3',
        gridSize: 6,
        totalCells: 36,
        boxRows: 2,
        boxCols: 3,
        maxDigit: 6,
        presets: {
            easy: { label: 'Easy', minClues: 18, maxClues: 22 },
            medium: { label: 'Medium', minClues: 14, maxClues: 17 },
            hard: { label: 'Hard', minClues: 11, maxClues: 13 },
            expert: { label: 'Expert', minClues: 9, maxClues: 11 },
        },
    },
};

export function normalizeVariant(variant) {
    if (variant === '2x3' || variant === '6x6') return '2x3';
    return '3x3';
}

export function inferVariantFromBoardLength(length) {
    return length === 36 ? '2x3' : '3x3';
}

export function getVariantSpec(variant = '3x3') {
    const id = normalizeVariant(variant);
    const base = SUDOKU_VARIANTS[id];
    return {
        ...base,
        boxesPerRow: base.gridSize / base.boxCols,
        allDigitsMask: (1 << (base.maxDigit + 1)) - 2,
    };
}

export function resolveSpec(variantOrBoard) {
    if (Array.isArray(variantOrBoard)) {
        return getVariantSpec(inferVariantFromBoardLength(variantOrBoard.length));
    }
    return getVariantSpec(variantOrBoard || '3x3');
}

export function getBoxIndex(row, col, variant = '3x3') {
    const spec = getVariantSpec(variant);
    return Math.floor(row / spec.boxRows) * spec.boxesPerRow + Math.floor(col / spec.boxCols);
}

export function getCellCoords(index, variant = '3x3') {
    const spec = getVariantSpec(variant);
    const row = Math.floor(index / spec.gridSize);
    const col = index % spec.gridSize;
    return { row, col, box: getBoxIndex(row, col, spec.id) };
}

/**
 * Convert a 0-based column index into a chess-style column letter (0 -> 'A').
 * @param {number} col
 * @returns {string}
 */
export function getColLabel(col) {
    return String.fromCharCode(65 + col);
}

/**
 * Format a cell index as chess-style coordinates (e.g. index 0 -> 'A1').
 * @param {number} index
 * @param {string} [variant='3x3']
 * @returns {string}
 */
export function formatCellCoord(index, variant = '3x3') {
    const { row, col } = getCellCoords(index, variant);
    return `${getColLabel(col)}${row + 1}`;
}

export function getUnitsForVariant(spec) {
    const units = [];

    for (let b = 0; b < spec.gridSize; b++) {
        const br = Math.floor(b / spec.boxesPerRow) * spec.boxRows;
        const bc = (b % spec.boxesPerRow) * spec.boxCols;
        const indices = [];
        for (let r = 0; r < spec.boxRows; r++) {
            for (let c = 0; c < spec.boxCols; c++) {
                indices.push((br + r) * spec.gridSize + (bc + c));
            }
        }
        units.push({ type: 'box', index: b, indices });
    }

    for (let r = 0; r < spec.gridSize; r++) {
        const indices = Array.from({ length: spec.gridSize }, (_, c) => r * spec.gridSize + c);
        units.push({ type: 'row', index: r, indices });
    }

    for (let c = 0; c < spec.gridSize; c++) {
        const indices = Array.from({ length: spec.gridSize }, (_, r) => r * spec.gridSize + c);
        units.push({ type: 'col', index: c, indices });
    }

    return units;
}
