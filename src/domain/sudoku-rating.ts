import { getVariantSpec } from './sudoku-variants.js';

type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';
type Technique = 'nakedSingles' | 'hiddenSingles' | 'lockedCandidates' | 'nakedPairs';
type Candidates = Array<Set<number>>;

function buildUnits(variant: string): number[][] {
    const spec = getVariantSpec(variant);
    const units: number[][] = [];
    for (let unit = 0; unit < spec.gridSize; unit++) {
        units.push(Array.from({ length: spec.gridSize }, (_, col) => unit * spec.gridSize + col));
        units.push(Array.from({ length: spec.gridSize }, (_, row) => row * spec.gridSize + unit));
        const row = Math.floor(unit / spec.boxesPerRow) * spec.boxRows;
        const col = (unit % spec.boxesPerRow) * spec.boxCols;
        units.push(Array.from({ length: spec.gridSize }, (_, offset) =>
            (row + Math.floor(offset / spec.boxCols)) * spec.gridSize + col + offset % spec.boxCols));
    }
    return units;
}

function place(work: number[], candidates: Candidates, peers: Array<Set<number>>, index: number, digit: number) {
    work[index] = digit;
    candidates[index].clear();
    for (const peer of peers[index]) candidates[peer].delete(digit);
}

function findSingle(work: number[], candidates: Candidates, units: number[][], maxDigit: number) {
    const naked = candidates.findIndex(values => values.size === 1);
    if (naked !== -1) return { index: naked, digit: [...candidates[naked]][0], technique: 'nakedSingles' as Technique };
    for (const unit of units) {
        for (let digit = 1; digit <= maxDigit; digit++) {
            if (unit.some(index => work[index] === digit)) continue;
            const cells = unit.filter(index => candidates[index].has(digit));
            if (cells.length === 1) return { index: cells[0], digit, technique: 'hiddenSingles' as Technique };
        }
    }
    return null;
}

function eliminate(candidates: Candidates, indices: number[], digits: number[]) {
    let changed = false;
    for (const index of indices) {
        for (const digit of digits) {
            if (candidates[index].delete(digit)) changed = true;
        }
    }
    return changed;
}

function applyLocked(candidates: Candidates, units: number[][], maxDigit: number) {
    // Unit intersections cover both box pointing and row/column claiming.
    for (const source of units) {
        for (let digit = 1; digit <= maxDigit; digit++) {
            const cells = source.filter(index => candidates[index].has(digit));
            if (cells.length < 2) continue;
            for (const target of units) {
                if (target === source || !cells.every(index => target.includes(index))) continue;
                if (eliminate(candidates, target.filter(index => !source.includes(index)), [digit])) return true;
            }
        }
    }
    return false;
}

function applyPairs(candidates: Candidates, units: number[][]) {
    for (const unit of units) {
        for (const index of unit) {
            const values = candidates[index];
            if (values.size !== 2) continue;
            const digits = [...values];
            const pair = unit.filter(other => candidates[other].size === 2 && digits.every(digit => candidates[other].has(digit)));
            if (pair.length !== 2) continue;
            if (eliminate(candidates, unit.filter(other => !pair.includes(other)), digits)) return true;
        }
    }
    return false;
}

/**
 * Deterministic project rating, independent of clue-count targets.
 * Easy: naked singles; Medium: hidden singles; Hard: locked candidates/pairs.
 * Expert: needs techniques beyond this non-guessing solver (not a claim of a specific advanced technique).
 * The caller must separately verify uniqueness before treating a stalled board as Expert.
 */
export function rateSudokuDifficulty(board: number[], variant = '3x3') {
    const spec = getVariantSpec(variant);
    if (board.length !== spec.totalCells || board.some(value => !Number.isInteger(value) || value < 0 || value > spec.maxDigit)) {
        throw new Error('Invalid board for difficulty rating.');
    }
    const units = buildUnits(spec.id);
    for (const unit of units) {
        const placed = unit.map(index => board[index]).filter(Boolean);
        if (new Set(placed).size !== placed.length) throw new Error('Conflicting board for difficulty rating.');
    }
    const peers = board.map((_, index) => new Set(units.filter(unit => unit.includes(index)).flat().filter(other => other !== index)));
    const work = [...board];
    const candidates = work.map((value, index) => new Set(value ? [] :
        Array.from({ length: spec.maxDigit }, (_, digit) => digit + 1).filter(digit =>
            ![...peers[index]].some(peer => work[peer] === digit))));
    const techniques = { nakedSingles: 0, hiddenSingles: 0, lockedCandidates: 0, nakedPairs: 0 };
    while (work.includes(0)) {
        const single = findSingle(work, candidates, units, spec.maxDigit);
        if (single) {
            place(work, candidates, peers, single.index, single.digit);
            techniques[single.technique]++;
        } else if (applyLocked(candidates, units, spec.maxDigit)) {
            techniques.lockedCandidates++;
        } else if (applyPairs(candidates, units)) {
            techniques.nakedPairs++;
        } else {
            break;
        }
    }
    const solved = !work.includes(0);
    let difficulty: Difficulty = 'easy';
    if (techniques.hiddenSingles) difficulty = 'medium';
    if (techniques.lockedCandidates || techniques.nakedPairs) difficulty = 'hard';
    if (!solved) difficulty = 'expert';
    return { difficulty, solved, techniques, remainingCells: work.filter(value => value === 0).length };
}
