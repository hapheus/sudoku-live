import { generateSudoku, getCellCoords } from './sudoku-generator.js';

export function getPeerIndices(index) {
    const { row, col, box } = getCellCoords(index);
    const peers = new Set();

    for (let i = 0; i < 81; i++) {
        if (i === index) continue;
        const coords = getCellCoords(i);
        if (coords.row === row || coords.col === col || coords.box === box) {
            peers.add(i);
        }
    }

    return Array.from(peers);
}

export function findConflicts(board) {
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

    for (let r = 0; r < 9; r++) {
        checkUnit(Array.from({ length: 9 }, (_, c) => r * 9 + c));
    }

    for (let c = 0; c < 9; c++) {
        checkUnit(Array.from({ length: 9 }, (_, r) => r * 9 + c));
    }

    for (let b = 0; b < 9; b++) {
        const br = Math.floor(b / 3) * 3;
        const bc = (b % 3) * 3;
        const boxIndices = [];
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                boxIndices.push((br + r) * 9 + (bc + c));
            }
        }
        checkUnit(boxIndices);
    }

    return Array.from(conflicts).sort((a, b) => a - b);
}

export function countFilledCells(board) {
    let count = 0;
    for (let i = 0; i < 81; i++) {
        if (board[i] >= 1 && board[i] <= 9) count++;
    }
    return count;
}

export function getDigitCounts(board) {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
    for (let i = 0; i < 81; i++) {
        const v = board[i];
        if (v >= 1 && v <= 9) {
            counts[v]++;
        }
    }
    return counts;
}

export function isSolved(board) {
    return countFilledCells(board) === 81 && findConflicts(board).length === 0;
}

export function createSudokuGame({ difficulty = 'medium', puzzle = null, solution = null } = {}) {
    const generated = puzzle && solution
        ? { puzzle: [...puzzle], solution: [...solution], difficulty }
        : generateSudoku(difficulty);

    const board = [...generated.puzzle];
    const givens = generated.puzzle.map((v) => v !== 0);
    const notes = Array.from({ length: 81 }, () => []);
    const cellOwners = Array(81).fill(null);

    return {
        difficulty: generated.difficulty,
        board,
        givens,
        solution: [...generated.solution],
        notes,
        cellOwners,
        conflicts: findConflicts(board),
        filledCount: countFilledCells(board),
        status: isSolved(board) ? 'solved' : 'in_progress',
        history: [],
        elapsedSeconds: 0,
    };
}

export function cloneNotes(notes) {
    return notes.map((arr) => [...arr]);
}

function cloneOwners(owners) {
    return Array.isArray(owners) && owners.length === 81 ? [...owners] : Array(81).fill(null);
}

export function setCellValue(state, index, value, { recordHistory = true, owner = null } = {}) {
    if (index < 0 || index >= 81) {
        throw new Error(`Invalid cell index ${index}.`);
    }
    if (value < 0 || value > 9 || !Number.isInteger(value)) {
        throw new Error(`Invalid digit ${value}. Must be 0..9.`);
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
    const nextOwners = cloneOwners(state.cellOwners);
    const nextHistory = recordHistory
        ? [
            ...state.history.slice(-49),
            {
                board: [...state.board],
                notes: cloneNotes(state.notes),
                cellOwners: cloneOwners(state.cellOwners),
            },
        ]
        : state.history;

    nextBoard[index] = value;
    nextOwners[index] = value === 0 ? null : owner;

    if (value !== 0) {
        nextNotes[index] = [];
        // Tidy pencil marks in row, column, and 3x3 box peers
        for (const peerIdx of getPeerIndices(index)) {
            if (nextNotes[peerIdx].length > 0) {
                nextNotes[peerIdx] = nextNotes[peerIdx].filter((n) => n !== value);
            }
        }
    }

    const conflicts = findConflicts(nextBoard);
    const filledCount = countFilledCells(nextBoard);
    const solved = filledCount === 81 && conflicts.length === 0;

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
    if (index < 0 || index >= 81) {
        throw new Error(`Invalid cell index ${index}.`);
    }
    if (digit < 1 || digit > 9 || !Number.isInteger(digit)) {
        throw new Error(`Invalid note digit ${digit}. Must be 1..9.`);
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
                cellOwners: cloneOwners(state.cellOwners),
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

export function applyRemoteCellPatch(state, { index, value, notes = null, owner = null }) {
    if (index < 0 || index >= 81 || state.givens[index]) {
        return state;
    }

    const nextBoard = [...state.board];
    const nextNotes = cloneNotes(state.notes);
    const nextOwners = cloneOwners(state.cellOwners);

    if (typeof value === 'number' && value >= 0 && value <= 9) {
        nextBoard[index] = value;
        if (value === 0) {
            nextOwners[index] = null;
        } else {
            nextOwners[index] = owner === 'host' || owner === 'guest' ? owner : (nextOwners[index] || null);
            nextNotes[index] = [];
            for (const peerIdx of getPeerIndices(index)) {
                if (nextNotes[peerIdx].length > 0) {
                    nextNotes[peerIdx] = nextNotes[peerIdx].filter((n) => n !== value);
                }
            }
        }
    }

    if (Array.isArray(notes) && nextBoard[index] === 0) {
        nextNotes[index] = notes
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= 9)
            .sort((a, b) => a - b);
    }

    const conflicts = findConflicts(nextBoard);
    const filledCount = countFilledCells(nextBoard);
    const solved = filledCount === 81 && conflicts.length === 0;

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

    const previous = state.history[state.history.length - 1];
    const nextHistory = state.history.slice(0, -1);
    const conflicts = findConflicts(previous.board);
    const filledCount = countFilledCells(previous.board);

    return {
        ...state,
        board: [...previous.board],
        notes: cloneNotes(previous.notes),
        cellOwners: cloneOwners(previous.cellOwners),
        conflicts,
        filledCount,
        status: 'in_progress',
        history: nextHistory,
    };
}

export function serializeGameState(state) {
    return {
        difficulty: state.difficulty,
        board: state.board,
        givens: state.givens,
        solution: state.solution,
        notes: state.notes,
        cellOwners: cloneOwners(state.cellOwners),
        status: state.status,
        elapsedSeconds: state.elapsedSeconds || 0,
    };
}

export function hydrateGameState(raw) {
    if (!raw || !Array.isArray(raw.board) || raw.board.length !== 81 || !Array.isArray(raw.givens)) {
        return null;
    }

    const board = raw.board.map((v) => (Number.isInteger(v) && v >= 0 && v <= 9 ? v : 0));
    const givens = raw.givens.map(Boolean);
    const notes = Array.isArray(raw.notes) && raw.notes.length === 81
        ? raw.notes.map((arr) => (Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n) && n >= 1 && n <= 9) : []))
        : Array.from({ length: 81 }, () => []);
    const cellOwners = Array.isArray(raw.cellOwners) && raw.cellOwners.length === 81
        ? raw.cellOwners.map((owner, idx) => (board[idx] !== 0 && !givens[idx] && (owner === 'host' || owner === 'guest') ? owner : null))
        : Array(81).fill(null);
    const solution = Array.isArray(raw.solution) && raw.solution.length === 81
        ? raw.solution.map((v) => (Number.isInteger(v) && v >= 1 && v <= 9 ? v : 0))
        : Array(81).fill(0);

    const conflicts = findConflicts(board);
    const filledCount = countFilledCells(board);
    const solved = filledCount === 81 && conflicts.length === 0;

    return {
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
