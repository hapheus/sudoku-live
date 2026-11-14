import {
    getCandidateDigits,
    getPeerIndices,
    resolveVariantForState,
} from './sudoku-board-metrics.js';
import { getCellCoords, getUnitsForVariant, getVariantSpec } from './sudoku-variants.js';

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

function pickPreferredOrFirst(candidates, preferredIndex) {
    if (candidates.length === 0) return null;
    if (Number.isInteger(preferredIndex)) {
        const preferred = candidates.find((c) => c.index === preferredIndex);
        if (preferred) return preferred;
    }
    return candidates[0];
}

function findFullHouseHints({ board, givens, units, spec, isBoardCellValid, matchesSolution }) {
    const matches = [];
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
            matches.push({
                index: targetIdx,
                digit: missingDigit,
                technique: 'full_house',
                unitType: unit.type,
                unitIndex: unit.index,
                contextDelays: buildHintDelays(targetIdx, unit.indices, spec.id),
            });
        }
    }
    return matches;
}

function findHiddenSingleHints({
    board,
    givens,
    units,
    spec,
    candidatesByCell,
    isBoardCellValid,
    matchesSolution,
}) {
    const matches = [];
    for (const unit of units) {
        if (!unit.indices.every(isBoardCellValid)) continue;
        const placed = new Set(unit.indices.map((idx) => board[idx]).filter((v) => v > 0));

        for (let d = 1; d <= spec.maxDigit; d++) {
            if (placed.has(d)) continue;
            const spots = unit.indices.filter(
                (idx) => board[idx] === 0 && !givens[idx] && candidatesByCell[idx].includes(d),
            );
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

            matches.push({
                index: targetIdx,
                digit: d,
                technique: 'hidden_single',
                unitType: unit.type,
                unitIndex: unit.index,
                contextDelays: buildHintDelays(targetIdx, [...unit.indices, ...blockingPeers], spec.id),
            });
        }
    }
    return matches;
}

function findNakedSingleHints({ board, givens, spec, candidatesByCell, isBoardCellValid, matchesSolution }) {
    const matches = [];
    for (let idx = 0; idx < spec.totalCells; idx++) {
        if (board[idx] !== 0 || givens[idx]) continue;
        const cands = candidatesByCell[idx];
        if (cands.length !== 1) continue;

        const digit = cands[0];
        if (!matchesSolution(idx, digit)) continue;

        const filledPeers = getPeerIndices(idx, spec.id).filter((p) => board[p] > 0);
        if (!filledPeers.every(isBoardCellValid)) continue;

        matches.push({
            index: idx,
            digit,
            technique: 'naked_single',
            unitType: 'cell',
            unitIndex: null,
            contextDelays: buildHintDelays(idx, filledPeers, spec.id),
        });
    }
    return matches;
}

function findFallbackHint({ board, givens, solution, spec, preferredIndex }) {
    let fallbackIdx;
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

    const fullHouse = pickPreferredOrFirst(
        findFullHouseHints({ board, givens, units, spec, isBoardCellValid, matchesSolution }),
        preferredIndex,
    );
    if (fullHouse) return fullHouse;

    const candidatesByCell = Array.from({ length: spec.totalCells }, (_, idx) => (
        board[idx] === 0 && !givens[idx] ? getCandidateDigits(board, idx, spec.id) : []
    ));

    const hiddenSingle = pickPreferredOrFirst(
        findHiddenSingleHints({
            board,
            givens,
            units,
            spec,
            candidatesByCell,
            isBoardCellValid,
            matchesSolution,
        }),
        preferredIndex,
    );
    if (hiddenSingle) return hiddenSingle;

    const nakedSingle = pickPreferredOrFirst(
        findNakedSingleHints({ board, givens, spec, candidatesByCell, isBoardCellValid, matchesSolution }),
        preferredIndex,
    );
    if (nakedSingle) return nakedSingle;

    if (!hasSolution) return null;
    return findFallbackHint({ board, givens, solution, spec, preferredIndex });
}
