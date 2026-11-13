/**
 * Sudoku Generator & Uniqueness-Guaranteed Solver
 *
 * Board representation: flat array of 81 integers (0 = empty, 1..9 = digit).
 */

export const DIFFICULTY_PRESETS = {
    easy: { label: 'Easy', minClues: 38, maxClues: 42 },
    medium: { label: 'Medium', minClues: 30, maxClues: 34 },
    hard: { label: 'Hard', minClues: 25, maxClues: 28 },
    expert: { label: 'Expert', minClues: 22, maxClues: 25 },
};

const ALL_DIGITS_MASK = 0x3fe; // bits 1..9 set

export function getBoxIndex(row, col) {
    return Math.floor(row / 3) * 3 + Math.floor(col / 3);
}

export function getCellCoords(index) {
    const row = Math.floor(index / 9);
    const col = index % 9;
    return { row, col, box: getBoxIndex(row, col) };
}

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

function maskToDigits(mask) {
    const digits = [];
    for (let d = 1; d <= 9; d++) {
        if (mask & (1 << d)) digits.push(d);
    }
    return digits;
}

function buildMasks(board) {
    const rows = new Int32Array(9);
    const cols = new Int32Array(9);
    const boxes = new Int32Array(9);

    for (let i = 0; i < 81; i++) {
        const val = board[i];
        if (val >= 1 && val <= 9) {
            const { row, col, box } = getCellCoords(i);
            const bit = 1 << val;
            if ((rows[row] & bit) || (cols[col] & bit) || (boxes[box] & bit)) {
                return null; // Invalid initial board
            }
            rows[row] |= bit;
            cols[col] |= bit;
            boxes[box] |= bit;
        }
    }

    return { rows, cols, boxes };
}

/**
 * Counts valid solutions up to `limit` using bitmask MRV backtracking.
 */
export function countSolutions(board, limit = 2) {
    const work = [...board];
    const masks = buildMasks(work);
    if (!masks) return 0;

    const { rows, cols, boxes } = masks;
    let solutions = 0;

    function search() {
        if (solutions >= limit) return;

        let bestIdx = -1;
        let bestMask = 0;
        let bestCount = 10;

        for (let i = 0; i < 81; i++) {
            if (work[i] !== 0) continue;
            const { row, col, box } = getCellCoords(i);
            const used = rows[row] | cols[col] | boxes[box];
            const candidates = ALL_DIGITS_MASK & ~used;
            const cCount = countBits(candidates);
            if (cCount === 0) return; // Dead end
            if (cCount < bestCount) {
                bestCount = cCount;
                bestMask = candidates;
                bestIdx = i;
                if (cCount === 1) break;
            }
        }

        if (bestIdx === -1) {
            solutions++;
            return;
        }

        const { row, col, box } = getCellCoords(bestIdx);
        for (let d = 1; d <= 9; d++) {
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
 * Solves a Sudoku board and returns the solved 81-cell array, or null if unsolvable.
 */
export function solveBoard(board) {
    const work = [...board];
    const masks = buildMasks(work);
    if (!masks) return null;

    const { rows, cols, boxes } = masks;

    function search() {
        let bestIdx = -1;
        let bestMask = 0;
        let bestCount = 10;

        for (let i = 0; i < 81; i++) {
            if (work[i] !== 0) continue;
            const { row, col, box } = getCellCoords(i);
            const candidates = ALL_DIGITS_MASK & ~(rows[row] | cols[col] | boxes[box]);
            const cCount = countBits(candidates);
            if (cCount === 0) return false;
            if (cCount < bestCount) {
                bestCount = cCount;
                bestMask = candidates;
                bestIdx = i;
                if (cCount === 1) break;
            }
        }

        if (bestIdx === -1) return true;

        const { row, col, box } = getCellCoords(bestIdx);
        for (let d = 1; d <= 9; d++) {
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
 * Generates a complete, valid, randomized 9x9 Sudoku solution.
 */
export function generateSolvedBoard(rng = Math.random) {
    const board = Array(81).fill(0);

    // Seed the 3 independent diagonal 3x3 boxes with shuffled digits for instant variety
    for (let boxStart = 0; boxStart < 9; boxStart += 3) {
        const digits = shuffleArray([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
        let k = 0;
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                board[(boxStart + r) * 9 + (boxStart + c)] = digits[k++];
            }
        }
    }

    const masks = buildMasks(board);
    const { rows, cols, boxes } = masks;

    function fill() {
        let bestIdx = -1;
        let bestMask = 0;
        let bestCount = 10;

        for (let i = 0; i < 81; i++) {
            if (board[i] !== 0) continue;
            const { row, col, box } = getCellCoords(i);
            const candidates = ALL_DIGITS_MASK & ~(rows[row] | cols[col] | boxes[box]);
            const cCount = countBits(candidates);
            if (cCount === 0) return false;
            if (cCount < bestCount) {
                bestCount = cCount;
                bestMask = candidates;
                bestIdx = i;
                if (cCount === 1) break;
            }
        }

        if (bestIdx === -1) return true;

        const { row, col, box } = getCellCoords(bestIdx);
        const candidates = shuffleArray(maskToDigits(bestMask), rng);

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

    fill();
    return board;
}

/**
 * Evaluates whether a puzzle can be solved purely by Naked Singles (+ optionally Hidden Singles).
 */
export function analyzeLogicDifficulty(board, { allowHiddenSingles = false } = {}) {
    const work = [...board];
    const masks = buildMasks(work);
    if (!masks) return { solved: false, hiddenSinglesUsed: 0 };

    const { rows, cols, boxes } = masks;
    let hiddenSinglesUsed = 0;

    while (true) {
        let progressed = false;

        // Pass 1: Naked Singles
        for (let i = 0; i < 81; i++) {
            if (work[i] !== 0) continue;
            const { row, col, box } = getCellCoords(i);
            const candidates = ALL_DIGITS_MASK & ~(rows[row] | cols[col] | boxes[box]);
            if (countBits(candidates) === 1) {
                const digit = maskToDigits(candidates)[0];
                const bit = 1 << digit;
                work[i] = digit;
                rows[row] |= bit;
                cols[col] |= bit;
                boxes[box] |= bit;
                progressed = true;
            }
        }

        if (progressed) continue;
        if (!allowHiddenSingles) break;

        // Pass 2: Hidden Singles across rows, columns, and boxes
        const findHiddenInUnit = (indices) => {
            for (let d = 1; d <= 9; d++) {
                const bit = 1 << d;
                let candidateIdx = -1;
                let count = 0;
                let alreadyPlaced = false;

                for (const idx of indices) {
                    if (work[idx] === d) {
                        alreadyPlaced = true;
                        break;
                    }
                    if (work[idx] !== 0) continue;
                    const { row, col, box } = getCellCoords(idx);
                    if (!((rows[row] | cols[col] | boxes[box]) & bit)) {
                        candidateIdx = idx;
                        count++;
                        if (count > 1) break;
                    }
                }

                if (!alreadyPlaced && count === 1 && candidateIdx !== -1) {
                    const { row, col, box } = getCellCoords(candidateIdx);
                    work[candidateIdx] = d;
                    rows[row] |= bit;
                    cols[col] |= bit;
                    boxes[box] |= bit;
                    hiddenSinglesUsed++;
                    return true;
                }
            }
            return false;
        };

        for (let r = 0; r < 9 && !progressed; r++) {
            const rowIndices = Array.from({ length: 9 }, (_, c) => r * 9 + c);
            progressed = findHiddenInUnit(rowIndices);
        }
        for (let c = 0; c < 9 && !progressed; c++) {
            const colIndices = Array.from({ length: 9 }, (_, r) => r * 9 + c);
            progressed = findHiddenInUnit(colIndices);
        }
        for (let b = 0; b < 9 && !progressed; b++) {
            const br = Math.floor(b / 3) * 3;
            const bc = (b % 3) * 3;
            const boxIndices = [];
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    boxIndices.push((br + r) * 9 + (bc + c));
                }
            }
            progressed = findHiddenInUnit(boxIndices);
        }

        if (!progressed) break;
    }

    return {
        solved: work.every((v) => v !== 0),
        hiddenSinglesUsed,
    };
}

function digPuzzleFromSolution(solution, targetClues, rng) {
    const puzzle = [...solution];
    let clues = 81;

    // First pass: symmetric pairs for clean visual balance
    const halfIndices = shuffleArray(Array.from({ length: 41 }, (_, i) => i), rng);
    for (const i of halfIndices) {
        if (clues <= targetClues) break;
        const mirror = 80 - i;
        const stepCost = i === mirror ? 1 : 2;
        if (clues - stepCost < targetClues) continue;

        const savedA = puzzle[i];
        const savedB = puzzle[mirror];
        puzzle[i] = 0;
        puzzle[mirror] = 0;

        if (countSolutions(puzzle, 2) === 1) {
            clues -= stepCost;
        } else {
            puzzle[i] = savedA;
            puzzle[mirror] = savedB;
        }
    }

    // Second pass: single-cell removal if symmetric pairs couldn't reach low clue counts
    if (clues > targetClues) {
        const allIndices = shuffleArray(Array.from({ length: 81 }, (_, i) => i), rng);
        for (const i of allIndices) {
            if (clues <= targetClues) break;
            if (puzzle[i] === 0) continue;

            const saved = puzzle[i];
            puzzle[i] = 0;

            if (countSolutions(puzzle, 2) === 1) {
                clues--;
            } else {
                puzzle[i] = saved;
            }
        }
    }

    return { puzzle, clues };
}

/**
 * Generates a unique-solution Sudoku puzzle calibrated to the requested difficulty.
 *
 * @param {'easy'|'medium'|'hard'|'expert'} difficulty
 * @param {() => number} rng
 * @returns {{ puzzle: number[], solution: number[], difficulty: string, clues: number }}
 */
export function generateSudoku(difficulty = 'medium', rng = Math.random) {
    const normalizedDifficulty = DIFFICULTY_PRESETS[difficulty] ? difficulty : 'medium';
    const preset = DIFFICULTY_PRESETS[normalizedDifficulty];
    const targetClues = preset.minClues + Math.floor(rng() * (preset.maxClues - preset.minClues + 1));

    let bestCandidate = null;
    const maxAttempts = normalizedDifficulty === 'expert' ? 10 : 6;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const solution = generateSolvedBoard(rng);
        const { puzzle, clues } = digPuzzleFromSolution(solution, targetClues, rng);
        const nakedOnly = analyzeLogicDifficulty(puzzle, { allowHiddenSingles: false });
        const withHidden = analyzeLogicDifficulty(puzzle, { allowHiddenSingles: true });

        const candidate = {
            puzzle,
            solution,
            difficulty: normalizedDifficulty,
            clues,
        };

        if (normalizedDifficulty === 'easy' && nakedOnly.solved) {
            return candidate;
        }

        if (normalizedDifficulty === 'medium' && clues <= preset.maxClues && withHidden.solved && !nakedOnly.solved) {
            return candidate;
        }

        if (normalizedDifficulty === 'hard' && clues <= preset.maxClues && !nakedOnly.solved) {
            return candidate;
        }

        if (normalizedDifficulty === 'expert' && clues <= preset.maxClues && !withHidden.solved) {
            return candidate;
        }

        if (!bestCandidate || Math.abs(clues - targetClues) < Math.abs(bestCandidate.clues - targetClues)) {
            bestCandidate = candidate;
        }
    }

    return bestCandidate;
}
