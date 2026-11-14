import { generateSudoku } from './sudoku-generator.js';
import {
    getCellCoords,
    getVariantSpec,
    inferVariantFromBoardLength,
    normalizeVariant,
} from './sudoku-variants.js';
import {
    cloneNotes,
    cloneOwners,
    countFilledCells,
    findConflicts,
    getCandidateDigits,
    getDigitCounts,
    getPeerIndices,
    isSolved,
    resolveVariantForState,
} from './sudoku-board-metrics.js';
import { shiftBand, shiftCol, shiftRow, shiftStack } from './sudoku-shifts.js';
import { findLogicalHint } from './sudoku-hints.js';

export {
    cloneNotes,
    countFilledCells,
    findConflicts,
    findLogicalHint,
    getCandidateDigits,
    getDigitCounts,
    getPeerIndices,
    isSolved,
    shiftBand,
    shiftCol,
    shiftRow,
    shiftStack,
};

function isUnitComplete(board, indices, maxDigit) {
    if (!Array.isArray(board)) return false;
    const seen = new Set();
    for (const idx of indices) {
        const val = board[idx];
        if (!Number.isInteger(val) || val < 1 || val > maxDigit || seen.has(val)) {
            return false;
        }
        seen.add(val);
    }
    return seen.size === indices.length;
}

export function detectNewlyCompletedUnits(prevBoard, nextBoard, variant = null, pivotIndex = null) {
    const resolvedVariant = resolveVariantForState(nextBoard, variant);
    const spec = getVariantSpec(resolvedVariant);
    const rows = [];
    const cols = [];
    const boxes = [];
    const cellDelays = new Map();

    if (!Array.isArray(prevBoard) || !Array.isArray(nextBoard) || prevBoard.length !== spec.totalCells || nextBoard.length !== spec.totalCells) {
        return { rows, cols, boxes, cellDelays, hasAny: false };
    }

    const hasPivot = Number.isInteger(pivotIndex) && pivotIndex >= 0 && pivotIndex < spec.totalCells;
    const pivotCoords = hasPivot ? getCellCoords(pivotIndex, spec.id) : null;

    const recordUnitCells = (indices) => {
        indices.forEach((idx, posInUnit) => {
            let delayMs = posInUnit * 28;
            if (pivotCoords) {
                const coords = getCellCoords(idx, spec.id);
                const dist = Math.abs(coords.row - pivotCoords.row) + Math.abs(coords.col - pivotCoords.col);
                delayMs = dist * 28;
            }
            const existing = cellDelays.get(idx);
            if (existing === undefined || delayMs < existing) {
                cellDelays.set(idx, delayMs);
            }
        });
    };

    for (let r = 0; r < spec.gridSize; r++) {
        const indices = Array.from({ length: spec.gridSize }, (_, c) => r * spec.gridSize + c);
        if (!isUnitComplete(prevBoard, indices, spec.maxDigit) && isUnitComplete(nextBoard, indices, spec.maxDigit)) {
            rows.push(r);
            recordUnitCells(indices);
        }
    }

    for (let c = 0; c < spec.gridSize; c++) {
        const indices = Array.from({ length: spec.gridSize }, (_, r) => r * spec.gridSize + c);
        if (!isUnitComplete(prevBoard, indices, spec.maxDigit) && isUnitComplete(nextBoard, indices, spec.maxDigit)) {
            cols.push(c);
            recordUnitCells(indices);
        }
    }

    for (let b = 0; b < spec.gridSize; b++) {
        const br = Math.floor(b / spec.boxesPerRow) * spec.boxRows;
        const bc = (b % spec.boxesPerRow) * spec.boxCols;
        const indices = [];
        for (let r = 0; r < spec.boxRows; r++) {
            for (let c = 0; c < spec.boxCols; c++) {
                indices.push((br + r) * spec.gridSize + (bc + c));
            }
        }
        if (!isUnitComplete(prevBoard, indices, spec.maxDigit) && isUnitComplete(nextBoard, indices, spec.maxDigit)) {
            boxes.push(b);
            recordUnitCells(indices);
        }
    }

    return {
        rows,
        cols,
        boxes,
        cellDelays,
        hasAny: rows.length > 0 || cols.length > 0 || boxes.length > 0,
    };
}

export function createSudokuGame({ difficulty = 'medium', variant = null, puzzle = null, solution = null } = {}) {
    const resolvedVariant = puzzle
        ? resolveVariantForState(puzzle, variant)
        : normalizeVariant(variant || '3x3');
    const spec = getVariantSpec(resolvedVariant);

    const generated = puzzle && solution
        ? { puzzle: [...puzzle], solution: [...solution], difficulty, variant: spec.id }
        : generateSudoku(difficulty, Math.random, spec.id);

    const board = [...generated.puzzle];
    const givens = generated.puzzle.map((v) => v !== 0);
    const notes = Array.from({ length: spec.totalCells }, () => []);
    const cellOwners = Array(spec.totalCells).fill(null);

    return {
        variant: spec.id,
        gridSize: spec.gridSize,
        totalCells: spec.totalCells,
        boxRows: spec.boxRows,
        boxCols: spec.boxCols,
        maxDigit: spec.maxDigit,
        difficulty: generated.difficulty,
        board,
        givens,
        solution: [...generated.solution],
        notes,
        cellOwners,
        conflicts: findConflicts(board, spec.id),
        filledCount: countFilledCells(board, spec.id),
        status: isSolved(board, spec.id) ? 'solved' : 'in_progress',
        history: [],
        elapsedSeconds: 0,
    };
}

export function setCellValue(state, index, value, { recordHistory = true, owner = null } = {}) {
    const spec = getVariantSpec(resolveVariantForState(state));
    if (index < 0 || index >= spec.totalCells) {
        throw new Error(`Invalid cell index ${index}.`);
    }
    if (value < 0 || value > spec.maxDigit || !Number.isInteger(value)) {
        throw new Error(`Invalid digit ${value}. Must be 0..${spec.maxDigit}.`);
    }
    if (state.givens[index]) {
        throw new Error('Cannot modify a given clue cell.');
    }
    if (state.status === 'solved') {
        throw new Error('Puzzle is already solved.');
    }

    if (state.board[index] === value && state.notes[index].length === 0) {
        return state;
    }

    const nextBoard = [...state.board];
    const nextNotes = cloneNotes(state.notes);
    const nextOwners = cloneOwners(state.cellOwners, spec.totalCells);
    const nextHistory = recordHistory
        ? [
            ...state.history.slice(-49),
            {
                board: [...state.board],
                notes: cloneNotes(state.notes),
                cellOwners: cloneOwners(state.cellOwners, spec.totalCells),
            },
        ]
        : state.history;

    nextBoard[index] = value;
    nextOwners[index] = value === 0 ? null : owner;

    if (value !== 0) {
        nextNotes[index] = [];
        // Tidy pencil marks in row, column, and box peers
        for (const peerIdx of getPeerIndices(index, spec.id)) {
            if (nextNotes[peerIdx].length > 0) {
                nextNotes[peerIdx] = nextNotes[peerIdx].filter((n) => n !== value);
            }
        }
    }

    const conflicts = findConflicts(nextBoard, spec.id);
    const filledCount = countFilledCells(nextBoard, spec.id);
    const solved = filledCount === spec.totalCells && conflicts.length === 0;

    return {
        ...state,
        board: nextBoard,
        notes: nextNotes,
        cellOwners: nextOwners,
        conflicts,
        filledCount,
        status: solved ? 'solved' : 'in_progress',
        history: nextHistory,
    };
}

export function toggleCellNote(state, index, digit, { recordHistory = true } = {}) {
    const spec = getVariantSpec(resolveVariantForState(state));
    if (index < 0 || index >= spec.totalCells) {
        throw new Error(`Invalid cell index ${index}.`);
    }
    if (digit < 1 || digit > spec.maxDigit || !Number.isInteger(digit)) {
        throw new Error(`Invalid note digit ${digit}. Must be 1..${spec.maxDigit}.`);
    }
    if (state.givens[index]) {
        throw new Error('Cannot add notes to a given clue cell.');
    }
    if (state.board[index] !== 0) {
        return state;
    }
    if (state.status === 'solved') {
        throw new Error('Puzzle is already solved.');
    }

    const nextNotes = cloneNotes(state.notes);
    const nextHistory = recordHistory
        ? [
            ...state.history.slice(-49),
            {
                board: [...state.board],
                notes: cloneNotes(state.notes),
                cellOwners: cloneOwners(state.cellOwners, spec.totalCells),
            },
        ]
        : state.history;

    const current = nextNotes[index];
    if (current.includes(digit)) {
        nextNotes[index] = current.filter((n) => n !== digit);
    } else {
        nextNotes[index] = [...current, digit].sort((a, b) => a - b);
    }

    return {
        ...state,
        notes: nextNotes,
        history: nextHistory,
    };
}

export function fillCandidateNotes(state) {
    if (state.status === 'solved') return state;
    const spec = getVariantSpec(resolveVariantForState(state));
    const nextNotes = state.board.map((val, idx) => (
        val === 0 && !state.givens[idx] ? getCandidateDigits(state.board, idx, spec.id) : []
    ));

    const unchanged = nextNotes.every((arr, idx) => (
        arr.length === state.notes[idx].length && arr.every((d, i) => d === state.notes[idx][i])
    ));
    if (unchanged) return state;

    return {
        ...state,
        notes: nextNotes,
        history: [
            ...state.history.slice(-49),
            {
                board: [...state.board],
                notes: cloneNotes(state.notes),
                cellOwners: cloneOwners(state.cellOwners, spec.totalCells),
            },
        ],
    };
}

export function clearAllNotes(state) {
    if (state.status === 'solved') return state;
    const spec = getVariantSpec(resolveVariantForState(state));
    const hasAnyNotes = state.notes.some((arr) => arr.length > 0);
    if (!hasAnyNotes) return state;

    return {
        ...state,
        notes: Array.from({ length: spec.totalCells }, () => []),
        history: [
            ...state.history.slice(-49),
            {
                board: [...state.board],
                notes: cloneNotes(state.notes),
                cellOwners: cloneOwners(state.cellOwners, spec.totalCells),
            },
        ],
    };
}

export function applyRemoteCellPatch(state, { index, value, notes = null, owner = null }) {
    const spec = getVariantSpec(resolveVariantForState(state));
    if (index < 0 || index >= spec.totalCells || state.givens[index]) {
        return state;
    }

    const nextBoard = [...state.board];
    const nextNotes = cloneNotes(state.notes);
    const nextOwners = cloneOwners(state.cellOwners, spec.totalCells);

    if (typeof value === 'number' && value >= 0 && value <= spec.maxDigit) {
        nextBoard[index] = value;
        if (value === 0) {
            nextOwners[index] = null;
        } else {
            nextOwners[index] = owner === 'host' || owner === 'guest' ? owner : (nextOwners[index] || null);
            nextNotes[index] = [];
            for (const peerIdx of getPeerIndices(index, spec.id)) {
                if (nextNotes[peerIdx].length > 0) {
                    nextNotes[peerIdx] = nextNotes[peerIdx].filter((n) => n !== value);
                }
            }
        }
    }

    if (Array.isArray(notes) && nextBoard[index] === 0) {
        nextNotes[index] = notes
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= spec.maxDigit)
            .sort((a, b) => a - b);
    }

    const conflicts = findConflicts(nextBoard, spec.id);
    const filledCount = countFilledCells(nextBoard, spec.id);
    const solved = filledCount === spec.totalCells && conflicts.length === 0;

    return {
        ...state,
        board: nextBoard,
        notes: nextNotes,
        cellOwners: nextOwners,
        conflicts,
        filledCount,
        status: solved ? 'solved' : 'in_progress',
    };
}

export function undoLastMove(state) {
    if (!state.history || state.history.length === 0 || state.status === 'solved') {
        return state;
    }

    const spec = getVariantSpec(resolveVariantForState(state));
    const previous = state.history[state.history.length - 1];
    const nextHistory = state.history.slice(0, -1);
    const conflicts = findConflicts(previous.board, spec.id);
    const filledCount = countFilledCells(previous.board, spec.id);

    return {
        ...state,
        board: [...previous.board],
        givens: Array.isArray(previous.givens) ? [...previous.givens] : state.givens,
        solution: Array.isArray(previous.solution) ? [...previous.solution] : state.solution,
        notes: cloneNotes(previous.notes),
        cellOwners: cloneOwners(previous.cellOwners, spec.totalCells),
        conflicts,
        filledCount,
        status: 'in_progress',
        history: nextHistory,
    };
}

export function serializeGameState(state) {
    const spec = getVariantSpec(resolveVariantForState(state));
    return {
        variant: spec.id,
        difficulty: state.difficulty,
        board: state.board,
        givens: state.givens,
        solution: state.solution,
        notes: state.notes,
        cellOwners: cloneOwners(state.cellOwners, spec.totalCells),
        status: state.status,
        elapsedSeconds: state.elapsedSeconds || 0,
    };
}

export function hydrateGameState(raw) {
    if (!raw || !Array.isArray(raw.board) || !Array.isArray(raw.givens)) {
        return null;
    }
    const len = raw.board.length;
    if ((len !== 81 && len !== 36) || raw.givens.length !== len) {
        return null;
    }

    const spec = getVariantSpec(raw.variant || inferVariantFromBoardLength(len));
    if (len !== spec.totalCells) {
        return null;
    }

    const board = raw.board.map((v) => (Number.isInteger(v) && v >= 0 && v <= spec.maxDigit ? v : 0));
    const givens = raw.givens.map(Boolean);
    const notes = Array.isArray(raw.notes) && raw.notes.length === spec.totalCells
        ? raw.notes.map((arr) => (Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n) && n >= 1 && n <= spec.maxDigit) : []))
        : Array.from({ length: spec.totalCells }, () => []);
    const cellOwners = Array.isArray(raw.cellOwners) && raw.cellOwners.length === spec.totalCells
        ? raw.cellOwners.map((owner, idx) => (board[idx] !== 0 && !givens[idx] && (owner === 'host' || owner === 'guest') ? owner : null))
        : Array(spec.totalCells).fill(null);
    const solution = Array.isArray(raw.solution) && raw.solution.length === spec.totalCells
        ? raw.solution.map((v) => (Number.isInteger(v) && v >= 1 && v <= spec.maxDigit ? v : 0))
        : Array(spec.totalCells).fill(0);

    const conflicts = findConflicts(board, spec.id);
    const filledCount = countFilledCells(board, spec.id);
    const solved = filledCount === spec.totalCells && conflicts.length === 0;

    return {
        variant: spec.id,
        gridSize: spec.gridSize,
        totalCells: spec.totalCells,
        boxRows: spec.boxRows,
        boxCols: spec.boxCols,
        maxDigit: spec.maxDigit,
        difficulty: raw.difficulty || 'medium',
        board,
        givens,
        solution,
        notes,
        cellOwners,
        conflicts,
        filledCount,
        status: solved ? 'solved' : 'in_progress',
        history: [],
        elapsedSeconds: Number.isInteger(raw.elapsedSeconds) ? raw.elapsedSeconds : 0,
    };
}

