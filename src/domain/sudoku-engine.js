import {
    generateSudoku,
    getCellCoords,
    getVariantSpec,
    inferVariantFromBoardLength,
    normalizeVariant,
} from './sudoku-generator.js';

function resolveVariantForState(stateOrBoard, explicitVariant = null) {
    if (explicitVariant) return normalizeVariant(explicitVariant);
    if (Array.isArray(stateOrBoard)) {
        return inferVariantFromBoardLength(stateOrBoard.length);
    }
    if (stateOrBoard?.variant) {
        return normalizeVariant(stateOrBoard.variant);
    }
    if (Array.isArray(stateOrBoard?.board)) {
        return inferVariantFromBoardLength(stateOrBoard.board.length);
    }
    return '3x3';
}

export function getPeerIndices(index, variant = '3x3') {
    const spec = getVariantSpec(variant);
    const { row, col, box } = getCellCoords(index, spec.id);
    const peers = new Set();

    for (let i = 0; i < spec.totalCells; i++) {
        if (i === index) continue;
        const coords = getCellCoords(i, spec.id);
        if (coords.row === row || coords.col === col || coords.box === box) {
            peers.add(i);
        }
    }

    return Array.from(peers);
}

export function findConflicts(board, variant = null) {
    const spec = getVariantSpec(resolveVariantForState(board, variant));
    const conflicts = new Set();

    const checkUnit = (indices) => {
        const seen = new Map();
        for (const idx of indices) {
            const val = board[idx];
            if (!val) continue;
            if (seen.has(val)) {
                conflicts.add(seen.get(val));
                conflicts.add(idx);
            } else {
                seen.set(val, idx);
            }
        }
    };

    for (let r = 0; r < spec.gridSize; r++) {
        checkUnit(Array.from({ length: spec.gridSize }, (_, c) => r * spec.gridSize + c));
    }

    for (let c = 0; c < spec.gridSize; c++) {
        checkUnit(Array.from({ length: spec.gridSize }, (_, r) => r * spec.gridSize + c));
    }

    for (let b = 0; b < spec.gridSize; b++) {
        const br = Math.floor(b / spec.boxesPerRow) * spec.boxRows;
        const bc = (b % spec.boxesPerRow) * spec.boxCols;
        const boxIndices = [];
        for (let r = 0; r < spec.boxRows; r++) {
            for (let c = 0; c < spec.boxCols; c++) {
                boxIndices.push((br + r) * spec.gridSize + (bc + c));
            }
        }
        checkUnit(boxIndices);
    }

    return Array.from(conflicts).sort((a, b) => a - b);
}

export function countFilledCells(board, variant = null) {
    const spec = getVariantSpec(resolveVariantForState(board, variant));
    let count = 0;
    for (let i = 0; i < spec.totalCells; i++) {
        if (board[i] >= 1 && board[i] <= spec.maxDigit) count++;
    }
    return count;
}

export function getDigitCounts(board, variant = null) {
    const spec = getVariantSpec(resolveVariantForState(board, variant));
    const counts = {};
    for (let d = 1; d <= spec.maxDigit; d++) {
        counts[d] = 0;
    }
    for (let i = 0; i < spec.totalCells; i++) {
        const v = board[i];
        if (v >= 1 && v <= spec.maxDigit) {
            counts[v]++;
        }
    }
    return counts;
}

export function isSolved(board, variant = null) {
    const spec = getVariantSpec(resolveVariantForState(board, variant));
    return countFilledCells(board, spec.id) === spec.totalCells && findConflicts(board, spec.id).length === 0;
}

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

export function cloneNotes(notes) {
    return notes.map((arr) => [...arr]);
}

function cloneOwners(owners, totalCells = 81) {
    return Array.isArray(owners) && owners.length === totalCells ? [...owners] : Array(totalCells).fill(null);
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

export function getCandidateDigits(board, index, variant = null) {
    const spec = getVariantSpec(resolveVariantForState(board, variant));
    if (index < 0 || index >= spec.totalCells || board[index] !== 0) {
        return [];
    }
    const used = new Set();
    for (const peerIdx of getPeerIndices(index, spec.id)) {
        const val = board[peerIdx];
        if (val >= 1 && val <= spec.maxDigit) {
            used.add(val);
        }
    }
    const candidates = [];
    for (let d = 1; d <= spec.maxDigit; d++) {
        if (!used.has(d)) candidates.push(d);
    }
    return candidates;
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

/**
 * Swap a row with its neighbor inside the same box band (preserves Sudoku validity).
 */
export function shiftRow(state, row, direction = 1, { recordHistory = true } = {}) {
    if (!state || state.status === 'solved') return state;
    const spec = getVariantSpec(resolveVariantForState(state));
    if (!Number.isInteger(row) || row < 0 || row >= spec.gridSize) {
        throw new Error(`Invalid row ${row}.`);
    }
    const dir = normalizeDirection(direction);
    const bandStart = Math.floor(row / spec.boxRows) * spec.boxRows;
    const targetRow = bandStart + ((row - bandStart + dir + spec.boxRows) % spec.boxRows);
    if (targetRow === row) return state;

    const indexMap = Array.from({ length: spec.totalCells }, (_, idx) => idx);
    for (let c = 0; c < spec.gridSize; c++) {
        const a = row * spec.gridSize + c;
        const b = targetRow * spec.gridSize + c;
        indexMap[a] = b;
        indexMap[b] = a;
    }
    return applyCellPermutation(state, indexMap, { recordHistory });
}

/**
 * Swap a column with its neighbor inside the same box stack (preserves Sudoku validity).
 */
export function shiftCol(state, col, direction = 1, { recordHistory = true } = {}) {
    if (!state || state.status === 'solved') return state;
    const spec = getVariantSpec(resolveVariantForState(state));
    if (!Number.isInteger(col) || col < 0 || col >= spec.gridSize) {
        throw new Error(`Invalid column ${col}.`);
    }
    const dir = normalizeDirection(direction);
    const stackStart = Math.floor(col / spec.boxCols) * spec.boxCols;
    const targetCol = stackStart + ((col - stackStart + dir + spec.boxCols) % spec.boxCols);
    if (targetCol === col) return state;

    const indexMap = Array.from({ length: spec.totalCells }, (_, idx) => idx);
    for (let r = 0; r < spec.gridSize; r++) {
        const a = r * spec.gridSize + col;
        const b = r * spec.gridSize + targetCol;
        indexMap[a] = b;
        indexMap[b] = a;
    }
    return applyCellPermutation(state, indexMap, { recordHistory });
}

/**
 * Swap an entire horizontal band of boxes with its neighbor band (preserves Sudoku validity).
 */
export function shiftBand(state, bandIndex, direction = 1, { recordHistory = true } = {}) {
    if (!state || state.status === 'solved') return state;
    const spec = getVariantSpec(resolveVariantForState(state));
    const bandCount = spec.gridSize / spec.boxRows;
    if (!Number.isInteger(bandIndex) || bandIndex < 0 || bandIndex >= bandCount) {
        throw new Error(`Invalid band ${bandIndex}.`);
    }
    const dir = normalizeDirection(direction);
    const targetBand = (bandIndex + dir + bandCount) % bandCount;
    if (targetBand === bandIndex) return state;

    const indexMap = Array.from({ length: spec.totalCells }, (_, idx) => idx);
    for (let dr = 0; dr < spec.boxRows; dr++) {
        const rA = bandIndex * spec.boxRows + dr;
        const rB = targetBand * spec.boxRows + dr;
        for (let c = 0; c < spec.gridSize; c++) {
            const a = rA * spec.gridSize + c;
            const b = rB * spec.gridSize + c;
            indexMap[a] = b;
            indexMap[b] = a;
        }
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
    if (!Number.isInteger(stackIndex) || stackIndex < 0 || stackIndex >= stackCount) {
        throw new Error(`Invalid stack ${stackIndex}.`);
    }
    const dir = normalizeDirection(direction);
    const targetStack = (stackIndex + dir + stackCount) % stackCount;
    if (targetStack === stackIndex) return state;

    const indexMap = Array.from({ length: spec.totalCells }, (_, idx) => idx);
    for (let dc = 0; dc < spec.boxCols; dc++) {
        const cA = stackIndex * spec.boxCols + dc;
        const cB = targetStack * spec.boxCols + dc;
        for (let r = 0; r < spec.gridSize; r++) {
            const a = r * spec.gridSize + cA;
            const b = r * spec.gridSize + cB;
            indexMap[a] = b;
            indexMap[b] = a;
        }
    }
    return applyCellPermutation(state, indexMap, { recordHistory });
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

function getUnitsForVariant(spec) {
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

function buildHintDelays(targetIndex, contextIndices, specId) {
    const delays = new Map();
    const pivot = getCellCoords(targetIndex, specId);
    delays.set(targetIndex, 0);

    for (const idx of contextIndices) {
        const coords = getCellCoords(idx, specId);
        const dist = Math.abs(coords.row - pivot.row) + Math.abs(coords.col - pivot.col);
        const delayMs = dist * 28;
        const prev = delays.get(idx);
        if (prev === undefined || delayMs < prev) {
            delays.set(idx, delayMs);
        }
    }
    return delays;
}

export function findLogicalHint(state, { preferredIndex = null } = {}) {
    if (!state || !Array.isArray(state.board) || state.status === 'solved') {
        return null;
    }

    const spec = getVariantSpec(resolveVariantForState(state));
    const { board, givens = [], solution = [] } = state;
    const hasSolution = Array.isArray(solution) && solution.length === spec.totalCells && solution.some((v) => v > 0);
    const units = getUnitsForVariant(spec);
    const isBoardCellValid = (idx) => !hasSolution || board[idx] === 0 || board[idx] === solution[idx];
    const matchesSolution = (idx, digit) => !hasSolution || solution[idx] <= 0 || solution[idx] === digit;

    const pickPreferredOrFirst = (candidates) => {
        if (candidates.length === 0) return null;
        if (Number.isInteger(preferredIndex)) {
            const preferred = candidates.find((c) => c.index === preferredIndex);
            if (preferred) return preferred;
        }
        return candidates[0];
    };

    // 1. Full House: a box, row, or column with only 1 empty cell left
    const fullHouseMatches = [];
    for (const unit of units) {
        const emptyIndices = unit.indices.filter((idx) => board[idx] === 0 && !givens[idx]);
        if (emptyIndices.length !== 1) continue;
        const targetIdx = emptyIndices[0];
        if (!unit.indices.every((idx) => idx === targetIdx || (board[idx] > 0 && isBoardCellValid(idx)))) {
            continue;
        }
        const used = new Set(unit.indices.filter((idx) => idx !== targetIdx).map((idx) => board[idx]));
        if (used.size !== spec.gridSize - 1) continue;

        let missingDigit = 0;
        for (let d = 1; d <= spec.maxDigit; d++) {
            if (!used.has(d)) {
                missingDigit = d;
                break;
            }
        }
        if (missingDigit > 0 && matchesSolution(targetIdx, missingDigit)) {
            fullHouseMatches.push({
                index: targetIdx,
                digit: missingDigit,
                technique: 'full_house',
                unitType: unit.type,
                unitIndex: unit.index,
                contextDelays: buildHintDelays(targetIdx, unit.indices, spec.id),
            });
        }
    }
    const chosenFullHouse = pickPreferredOrFirst(fullHouseMatches);
    if (chosenFullHouse) return chosenFullHouse;

    // 2. Hidden Single: a digit that fits in only 1 cell within a box, row, or column
    const candidatesByCell = Array.from({ length: spec.totalCells }, (_, idx) => (
        board[idx] === 0 && !givens[idx] ? getCandidateDigits(board, idx, spec.id) : []
    ));

    const hiddenSingleMatches = [];
    for (const unit of units) {
        if (!unit.indices.every(isBoardCellValid)) continue;
        const placed = new Set(unit.indices.map((idx) => board[idx]).filter((v) => v > 0));

        for (let d = 1; d <= spec.maxDigit; d++) {
            if (placed.has(d)) continue;
            const spots = unit.indices.filter((idx) => board[idx] === 0 && !givens[idx] && candidatesByCell[idx].includes(d));
            if (spots.length !== 1) continue;

            const targetIdx = spots[0];
            if (!matchesSolution(targetIdx, d)) continue;

            const blockingPeers = [];
            let peersSound = true;
            for (const otherIdx of unit.indices) {
                if (otherIdx === targetIdx || board[otherIdx] !== 0) continue;
                const blocker = getPeerIndices(otherIdx, spec.id).find((p) => board[p] === d);
                if (blocker !== undefined) {
                    if (!isBoardCellValid(blocker)) {
                        peersSound = false;
                        break;
                    }
                    blockingPeers.push(blocker);
                }
            }
            if (!peersSound) continue;

            const contextIndices = [...unit.indices, ...blockingPeers];
            hiddenSingleMatches.push({
                index: targetIdx,
                digit: d,
                technique: 'hidden_single',
                unitType: unit.type,
                unitIndex: unit.index,
                contextDelays: buildHintDelays(targetIdx, contextIndices, spec.id),
            });
        }
    }
    const chosenHidden = pickPreferredOrFirst(hiddenSingleMatches);
    if (chosenHidden) return chosenHidden;

    // 3. Naked Single: an empty cell with only 1 possible candidate left
    const nakedSingleMatches = [];
    for (let idx = 0; idx < spec.totalCells; idx++) {
        if (board[idx] !== 0 || givens[idx]) continue;
        const cands = candidatesByCell[idx];
        if (cands.length !== 1) continue;

        const digit = cands[0];
        if (!matchesSolution(idx, digit)) continue;

        const peers = getPeerIndices(idx, spec.id);
        const filledPeers = peers.filter((p) => board[p] > 0);
        if (!filledPeers.every(isBoardCellValid)) continue;

        nakedSingleMatches.push({
            index: idx,
            digit,
            technique: 'naked_single',
            unitType: 'cell',
            unitIndex: null,
            contextDelays: buildHintDelays(idx, filledPeers, spec.id),
        });
    }
    const chosenNaked = pickPreferredOrFirst(nakedSingleMatches);
    if (chosenNaked) return chosenNaked;

    // 4. Fallback when no single-step logical deduction is available on the current board
    if (!hasSolution) return null;

    let fallbackIdx = null;
    if (
        Number.isInteger(preferredIndex)
        && preferredIndex >= 0
        && preferredIndex < spec.totalCells
        && !givens[preferredIndex]
        && board[preferredIndex] !== solution[preferredIndex]
        && solution[preferredIndex] > 0
    ) {
        fallbackIdx = preferredIndex;
    } else {
        const emptyWrongIndices = [];
        const incorrectFilledIndices = [];
        for (let i = 0; i < spec.totalCells; i++) {
            if (!givens[i] && solution[i] > 0 && board[i] !== solution[i]) {
                if (board[i] === 0) {
                    emptyWrongIndices.push(i);
                } else {
                    incorrectFilledIndices.push(i);
                }
            }
        }
        const pool = emptyWrongIndices.length > 0 ? emptyWrongIndices : incorrectFilledIndices;
        if (pool.length === 0) return null;
        fallbackIdx = pool[0];
    }

    return {
        index: fallbackIdx,
        digit: solution[fallbackIdx],
        technique: 'fallback',
        unitType: 'cell',
        unitIndex: null,
        contextDelays: buildHintDelays(fallbackIdx, [], spec.id),
    };
}

