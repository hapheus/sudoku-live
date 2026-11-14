import {
    cloneNotes,
    cloneOwners,
    countFilledCells,
    findConflicts,
    resolveVariantForState,
} from './sudoku-board-metrics.js';
import { getVariantSpec } from './sudoku-variants.js';

function applyCellPermutation(state, indexMap, { recordHistory = true } = {}) {
    const spec = getVariantSpec(resolveVariantForState(state));
    const nextBoard = indexMap.map((oldIdx) => state.board[oldIdx]);
    const nextGivens = indexMap.map((oldIdx) => Boolean(state.givens[oldIdx]));
    const nextSolution = Array.isArray(state.solution) && state.solution.length === spec.totalCells
        ? indexMap.map((oldIdx) => state.solution[oldIdx])
        : state.solution;
    const nextNotes = indexMap.map((oldIdx) => [...(state.notes[oldIdx] || [])]);
    const nextOwners = indexMap.map((oldIdx) => state.cellOwners?.[oldIdx] ?? null);

    const nextHistory = recordHistory
        ? [
            ...state.history.slice(-49),
            {
                board: [...state.board],
                givens: [...state.givens],
                solution: Array.isArray(state.solution) ? [...state.solution] : state.solution,
                notes: cloneNotes(state.notes),
                cellOwners: cloneOwners(state.cellOwners, spec.totalCells),
            },
        ]
        : state.history;

    return {
        ...state,
        board: nextBoard,
        givens: nextGivens,
        solution: nextSolution,
        notes: nextNotes,
        cellOwners: nextOwners,
        conflicts: findConflicts(nextBoard, spec.id),
        filledCount: countFilledCells(nextBoard, spec.id),
        status: state.status,
        history: nextHistory,
    };
}

function normalizeDirection(direction) {
    return direction < 0 ? -1 : 1;
}

function swapIndexPair(indexMap, a, b) {
    indexMap[a] = b;
    indexMap[b] = a;
}

function swapRowsInMap(indexMap, gridSize, rowA, rowB) {
    for (let c = 0; c < gridSize; c++) {
        swapIndexPair(indexMap, rowA * gridSize + c, rowB * gridSize + c);
    }
}

function swapColsInMap(indexMap, gridSize, colA, colB) {
    for (let r = 0; r < gridSize; r++) {
        swapIndexPair(indexMap, r * gridSize + colA, r * gridSize + colB);
    }
}

function resolveShiftTarget(index, count, groupSize, direction, label) {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
        throw new Error(`Invalid ${label} ${index}.`);
    }
    const dir = normalizeDirection(direction);
    const groupStart = Math.floor(index / groupSize) * groupSize;
    return groupStart + ((index - groupStart + dir + groupSize) % groupSize);
}

/**
 * Swap a row with its neighbor inside the same box band (preserves Sudoku validity).
 */
export function shiftRow(state, row, direction = 1, { recordHistory = true } = {}) {
    if (!state || state.status === 'solved') return state;
    const spec = getVariantSpec(resolveVariantForState(state));
    const targetRow = resolveShiftTarget(row, spec.gridSize, spec.boxRows, direction, 'row');
    if (targetRow === row) return state;

    const indexMap = Array.from({ length: spec.totalCells }, (_, idx) => idx);
    swapRowsInMap(indexMap, spec.gridSize, row, targetRow);
    return applyCellPermutation(state, indexMap, { recordHistory });
}

/**
 * Swap a column with its neighbor inside the same box stack (preserves Sudoku validity).
 */
export function shiftCol(state, col, direction = 1, { recordHistory = true } = {}) {
    if (!state || state.status === 'solved') return state;
    const spec = getVariantSpec(resolveVariantForState(state));
    const targetCol = resolveShiftTarget(col, spec.gridSize, spec.boxCols, direction, 'column');
    if (targetCol === col) return state;

    const indexMap = Array.from({ length: spec.totalCells }, (_, idx) => idx);
    swapColsInMap(indexMap, spec.gridSize, col, targetCol);
    return applyCellPermutation(state, indexMap, { recordHistory });
}

/**
 * Swap an entire horizontal band of boxes with its neighbor band (preserves Sudoku validity).
 */
export function shiftBand(state, bandIndex, direction = 1, { recordHistory = true } = {}) {
    if (!state || state.status === 'solved') return state;
    const spec = getVariantSpec(resolveVariantForState(state));
    const bandCount = spec.gridSize / spec.boxRows;
    const targetBand = resolveShiftTarget(bandIndex, bandCount, bandCount, direction, 'band');
    if (targetBand === bandIndex) return state;

    const indexMap = Array.from({ length: spec.totalCells }, (_, idx) => idx);
    for (let dr = 0; dr < spec.boxRows; dr++) {
        swapRowsInMap(
            indexMap,
            spec.gridSize,
            bandIndex * spec.boxRows + dr,
            targetBand * spec.boxRows + dr,
        );
    }
    return applyCellPermutation(state, indexMap, { recordHistory });
}

/**
 * Swap an entire vertical stack of boxes with its neighbor stack (preserves Sudoku validity).
 */
export function shiftStack(state, stackIndex, direction = 1, { recordHistory = true } = {}) {
    if (!state || state.status === 'solved') return state;
    const spec = getVariantSpec(resolveVariantForState(state));
    const stackCount = spec.gridSize / spec.boxCols;
    const targetStack = resolveShiftTarget(stackIndex, stackCount, stackCount, direction, 'stack');
    if (targetStack === stackIndex) return state;

    const indexMap = Array.from({ length: spec.totalCells }, (_, idx) => idx);
    for (let dc = 0; dc < spec.boxCols; dc++) {
        swapColsInMap(
            indexMap,
            spec.gridSize,
            stackIndex * spec.boxCols + dc,
            targetStack * spec.boxCols + dc,
        );
    }
    return applyCellPermutation(state, indexMap, { recordHistory });
}
