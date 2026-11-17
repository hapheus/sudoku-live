import { rateSudokuDifficulty } from './sudoku-rating.ts';
/**
 * Sudoku Generator & Uniqueness-Guaranteed Solver
 *
 * Supports:
 * - '3x3' (9x9 grid, 3x3 boxes, digits 1..9, 81 cells)
 * - '2x3' (6x6 grid, 2x3 boxes, digits 1..6, 36 cells)
 */

import {
    DIFFICULTY_PRESETS,
    SUDOKU_VARIANTS,
    formatCellCoord,
    getBoxIndex,
    getCellCoords,
    getColLabel,
    getVariantSpec,
    inferVariantFromBoardLength,
    normalizeVariant,
    resolveSpec,
} from './sudoku-variants.js';

export {
    DIFFICULTY_PRESETS,
    SUDOKU_VARIANTS,
    formatCellCoord,
    getBoxIndex,
    getCellCoords,
    getColLabel,
    getVariantSpec,
    inferVariantFromBoardLength,
    normalizeVariant,
};

function shuffleArray(arr, rng = Math.random) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function countBits(mask) {
    let n = mask;
    let count = 0;
    while (n) {
        n &= n - 1;
        count++;
    }
    return count;
}

function maskToDigits(mask, maxDigit = 9) {
    const digits = [];
    for (let d = 1; d <= maxDigit; d++) {
        if (mask & (1 << d)) digits.push(d);
    }
    return digits;
}

function isValidBoardShape(board, variant = null) {
    if (!Array.isArray(board)) return false;
    const spec = variant ? getVariantSpec(variant) : resolveSpec(board);
    if (board.length !== spec.totalCells) return false;
    for (let i = 0; i < spec.totalCells; i++) {
        const val = board[i];
        if (!Number.isInteger(val) || val < 0 || val > spec.maxDigit) {
            return false;
        }
    }
    return true;
}

function buildMasks(board, variant = null) {
    const spec = variant ? getVariantSpec(variant) : resolveSpec(board);
    if (!isValidBoardShape(board, spec.id)) return null;

    const rows = new Int32Array(spec.gridSize);
    const cols = new Int32Array(spec.gridSize);
    const boxes = new Int32Array(spec.gridSize);

    for (let i = 0; i < spec.totalCells; i++) {
        const val = board[i];
        if (val >= 1 && val <= spec.maxDigit) {
            const { row, col, box } = getCellCoords(i, spec.id);
            const bit = 1 << val;
            if ((rows[row] & bit) || (cols[col] & bit) || (boxes[box] & bit)) {
                return null; // Invalid initial board
            }
            rows[row] |= bit;
            cols[col] |= bit;
            boxes[box] |= bit;
        }
    }

    return { rows, cols, boxes, spec };
}

/**
 * Checks whether a board is a completely filled, conflict-free Sudoku solution.
 */
export function isValidSolvedBoard(board, variant = null) {
    const spec = variant ? getVariantSpec(variant) : resolveSpec(board);
    if (!isValidBoardShape(board, spec.id)) return false;
    for (let i = 0; i < spec.totalCells; i++) {
        if (board[i] < 1 || board[i] > spec.maxDigit) return false;
    }
    return buildMasks(board, spec.id) !== null;
}

/**
 * Checks whether a Sudoku board has at least one valid solution (or optionally a unique solution).
 */
export function isSolvable(board, { requireUnique = false, variant = null } = {}) {
    const resolvedVariant = variant || inferVariantFromBoardLength(board?.length);
    if (!buildMasks(board, resolvedVariant)) return false;
    if (requireUnique) {
        return countSolutions(board, 2, resolvedVariant) === 1;
    }
    return solveBoard(board, resolvedVariant) !== null;
}

function findLeastCandidates(board, { rows, cols, boxes, spec }) {
    let index = -1;
    let mask = 0;
    let count = spec.maxDigit + 1;
    for (let i = 0; i < spec.totalCells; i++) {
        if (board[i] !== 0) continue;
        const { row, col, box } = getCellCoords(i, spec.id);
        const candidates = spec.allDigitsMask & ~(rows[row] | cols[col] | boxes[box]);
        const size = countBits(candidates);
        if (size === 0) return { index: i, mask: 0 };
        if (size >= count) continue;
        index = i;
        mask = candidates;
        count = size;
        if (size === 1) break;
    }
    return { index, mask };
}

/**
 * Counts valid solutions up to `limit` using bitmask MRV backtracking.
 */
export function countSolutions(board, limit = 2, variant = null) {
    const masks = buildMasks(board, variant);
    if (!masks) return 0;

    const work = [...board];
    const { rows, cols, boxes, spec } = masks;
    let solutions = 0;

    function search() {
        if (solutions >= limit) return;

        const { index: bestIdx, mask: bestMask } = findLeastCandidates(work, masks);
        if (bestIdx !== -1 && bestMask === 0) return;

        if (bestIdx === -1) {
            solutions++;
            return;
        }

        const { row, col, box } = getCellCoords(bestIdx, spec.id);
        for (let d = 1; d <= spec.maxDigit; d++) {
            const bit = 1 << d;
            if (!(bestMask & bit)) continue;

            work[bestIdx] = d;
            rows[row] |= bit;
            cols[col] |= bit;
            boxes[box] |= bit;

            search();

            work[bestIdx] = 0;
            rows[row] &= ~bit;
            cols[col] &= ~bit;
            boxes[box] &= ~bit;

            if (solutions >= limit) return;
        }
    }

    search();
    return solutions;
}

/**
 * Solves a Sudoku board and returns the solved cell array, or null if unsolvable.
 */
export function solveBoard(board, variant = null) {
    const masks = buildMasks(board, variant);
    if (!masks) return null;

    const work = [...board];
    const { rows, cols, boxes, spec } = masks;

    function search() {
        const { index: bestIdx, mask: bestMask } = findLeastCandidates(work, masks);
        if (bestIdx !== -1 && bestMask === 0) return false;

        if (bestIdx === -1) return true;

        const { row, col, box } = getCellCoords(bestIdx, spec.id);
        for (let d = 1; d <= spec.maxDigit; d++) {
            const bit = 1 << d;
            if (!(bestMask & bit)) continue;

            work[bestIdx] = d;
            rows[row] |= bit;
            cols[col] |= bit;
            boxes[box] |= bit;

            if (search()) return true;

            work[bestIdx] = 0;
            rows[row] &= ~bit;
            cols[col] &= ~bit;
            boxes[box] &= ~bit;
        }

        return false;
    }

    return search() ? work : null;
}

/**
 * Generates a complete, valid, randomized Sudoku solution for the chosen variant.
 */
export function generateSolvedBoard(rng = Math.random, variant = '3x3') {
    const spec = getVariantSpec(variant);
    const seedDigits = Array.from({ length: spec.maxDigit }, (_, i) => i + 1);

    for (let attempt = 0; attempt < 10; attempt++) {
        const board = Array(spec.totalCells).fill(0);

        // Seed mutually disjoint boxes (zero shared rows/cols) for instant randomness
        const seedBoxes = spec.id === '2x3' ? [0, 3] : [0, 4, 8];
        for (const boxIdx of seedBoxes) {
            const br = Math.floor(boxIdx / spec.boxesPerRow) * spec.boxRows;
            const bc = (boxIdx % spec.boxesPerRow) * spec.boxCols;
            const digits = shuffleArray(seedDigits, rng);
            let k = 0;
            for (let r = 0; r < spec.boxRows; r++) {
                for (let c = 0; c < spec.boxCols; c++) {
                    board[(br + r) * spec.gridSize + (bc + c)] = digits[k++];
                }
            }
        }

        const masks = buildMasks(board, spec.id);
        const { rows, cols, boxes } = masks;

        function fill() {
            const { index: bestIdx, mask: bestMask } = findLeastCandidates(board, masks);
            if (bestIdx !== -1 && bestMask === 0) return false;

            if (bestIdx === -1) return true;

            const { row, col, box } = getCellCoords(bestIdx, spec.id);
            const candidates = shuffleArray(maskToDigits(bestMask, spec.maxDigit), rng);

            for (const d of candidates) {
                const bit = 1 << d;
                board[bestIdx] = d;
                rows[row] |= bit;
                cols[col] |= bit;
                boxes[box] |= bit;

                if (fill()) return true;

                board[bestIdx] = 0;
                rows[row] &= ~bit;
                cols[col] &= ~bit;
                boxes[box] &= ~bit;
            }

            return false;
        }

        if (fill() && isValidSolvedBoard(board, spec.id)) {
            return board;
        }
    }

    throw new Error(`Failed to generate a valid solved ${spec.label} Sudoku board.`);
}

/**
 * Evaluates whether a puzzle can be solved purely by Naked Singles (+ optionally Hidden Singles).
 */
export function analyzeLogicDifficulty(board, { allowHiddenSingles = false, variant = null } = {}) {
    try {
        const result = rateSudokuDifficulty(board, variant || inferVariantFromBoardLength(board?.length), {
            maxTechnique: allowHiddenSingles ? 'hiddenSingles' : 'nakedSingles',
        });
        return { solved: result.solved, hiddenSinglesUsed: result.techniques.hiddenSingles };
    } catch {
        return { solved: false, hiddenSinglesUsed: 0 };
    }
}

/**
 * Verifies that a generated puzzle is valid, matches its solution clues,
 * has a unique solution, and solves identically to `solution`.
 */
export function verifyGeneratedPuzzle(puzzle, solution, variant = null) {
    const spec = variant ? getVariantSpec(variant) : resolveSpec(solution);
    if (!isValidSolvedBoard(solution, spec.id) || !isValidBoardShape(puzzle, spec.id)) {
        return false;
    }

    for (let i = 0; i < spec.totalCells; i++) {
        if (puzzle[i] !== 0 && puzzle[i] !== solution[i]) {
            return false;
        }
    }

    if (countSolutions(puzzle, 2, spec.id) !== 1) {
        return false;
    }

    const solved = solveBoard(puzzle, spec.id);
    if (!solved || solved.length !== spec.totalCells) {
        return false;
    }

    for (let i = 0; i < spec.totalCells; i++) {
        if (solved[i] !== solution[i]) {
            return false;
        }
    }

    return true;
}

function removeUniqueClues(puzzle, indices, variant) {
    const saved = indices.map(index => puzzle[index]);
    for (const index of indices) puzzle[index] = 0;
    if (countSolutions(puzzle, 2, variant) === 1) return true;
    indices.forEach((index, offset) => { puzzle[index] = saved[offset]; });
    return false;
}

function digPuzzleFromSolution(solution, targetClues, rng, variant = '3x3') {
    const spec = getVariantSpec(variant);
    if (!isValidSolvedBoard(solution, spec.id)) {
        throw new Error('Cannot dig puzzle from an invalid Sudoku solution.');
    }

    const puzzle = [...solution];
    let clues = spec.totalCells;

    // First pass: symmetric pairs for clean visual balance
    const halfLen = Math.ceil(spec.totalCells / 2);
    const halfIndices = shuffleArray(Array.from({ length: halfLen }, (_, i) => i), rng);
    for (const i of halfIndices) {
        if (clues <= targetClues) break;
        const mirror = spec.totalCells - 1 - i;
        const stepCost = i === mirror ? 1 : 2;
        if (clues - stepCost < targetClues) continue;

        if (removeUniqueClues(puzzle, [...new Set([i, mirror])], spec.id)) clues -= stepCost;
    }

    // Second pass: single-cell removal if symmetric pairs couldn't reach low clue counts
    if (clues <= targetClues) return { puzzle, clues };
    const allIndices = shuffleArray(Array.from({ length: spec.totalCells }, (_, i) => i), rng);
    for (const i of allIndices) {
        if (clues <= targetClues) break;
        if (puzzle[i] === 0) continue;

        if (removeUniqueClues(puzzle, [i], spec.id)) clues--;
    }

    return { puzzle, clues };
}

/**
 * Generates a unique-solution Sudoku puzzle calibrated to the requested difficulty and variant.
 * Every returned puzzle is verified to be uniquely solvable and consistent with its solution.
 *
 * @param {'easy'|'medium'|'hard'|'expert'} difficulty
 * @param {() => number} rng
 * @param {'3x3'|'2x3'} variant
 * Bounded retries prefer the requested logic tier; fallback reports its actual tier, never a clue-count label.
 * @returns {{ puzzle: number[], solution: number[], difficulty: string, requestedDifficulty: string, variant: '3x3'|'2x3', clues: number }}
 */
export function generateSudoku(difficulty = 'medium', rng = Math.random, variant = '3x3') {
    const spec = getVariantSpec(variant);
    const normalizedDifficulty = spec.presets[difficulty] ? difficulty : 'medium';
    const preset = spec.presets[normalizedDifficulty];
    const targetClues = preset.minClues + Math.floor(rng() * (preset.maxClues - preset.minClues + 1));

    let bestCandidate = null;
    let bestDistance = Infinity;
    const tiers = ['easy', 'medium', 'hard', 'expert'];
    const maxAttempts = normalizedDifficulty === 'expert' ? 10 : 6;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const solution = generateSolvedBoard(rng, spec.id);
        const { puzzle, clues } = digPuzzleFromSolution(solution, targetClues, rng, spec.id);

        if (!verifyGeneratedPuzzle(puzzle, solution, spec.id)) {
            continue;
        }

        const candidate = {
            puzzle,
            solution,
            difficulty: rateSudokuDifficulty(puzzle, spec.id).difficulty,
            requestedDifficulty: normalizedDifficulty,
            variant: spec.id,
            clues,
        };

        if (candidate.difficulty === normalizedDifficulty && clues <= preset.maxClues) {
            return candidate;
        }

        const distance = Math.abs(tiers.indexOf(candidate.difficulty) - tiers.indexOf(normalizedDifficulty));
        if (distance < bestDistance || (distance === bestDistance && (!bestCandidate || Math.abs(clues - targetClues) < Math.abs(bestCandidate.clues - targetClues)))) {
            bestCandidate = candidate;
            bestDistance = distance;
        }

    }

    if (!bestCandidate || !verifyGeneratedPuzzle(bestCandidate.puzzle, bestCandidate.solution, spec.id)) {
        throw new Error('Failed to generate a guaranteed solvable Sudoku puzzle.');
    }

    return bestCandidate;
}
