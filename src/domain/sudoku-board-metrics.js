import {
    getCellCoords,
    getUnitsForVariant,
    getVariantSpec,
    inferVariantFromBoardLength,
    normalizeVariant,
} from './sudoku-variants.js';

export function resolveVariantForState(stateOrBoard, explicitVariant = null) {
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

    for (const unit of getUnitsForVariant(spec)) {
        const seen = new Map();
        for (const idx of unit.indices) {
            const val = board[idx];
            if (!val) continue;
            if (seen.has(val)) {
                conflicts.add(seen.get(val));
                conflicts.add(idx);
            } else {
                seen.set(val, idx);
            }
        }
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

export function cloneNotes(notes) {
    return notes.map((cellNotes) => [...cellNotes]);
}

export function cloneOwners(owners, totalCells = 81) {
    if (!Array.isArray(owners)) return Array(totalCells).fill(null);
    return owners.map((owner) => owner ?? null);
}
