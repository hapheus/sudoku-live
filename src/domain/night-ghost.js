import { shiftBand, shiftStack } from './sudoku-shifts.js';
import { resolveSpec } from './sudoku-variants.js';
import { getDefaultStorage } from '../utils/storage.js';

const SLOT_FORMAT = /^\d{4}-\d{2}-\d{2}\/0[0-3]$/;
const pad = (value) => String(value).padStart(2, '0');

export function ghostSlotAt(date) {
    const hour = date.getHours();
    if (hour > 3 || date.getMinutes() !== 0) return null;
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}/${pad(hour)}`;
}

export function claimGhostSlot(slot, storage = getDefaultStorage()) {
    if (!storage || !SLOT_FORMAT.test(slot)) return false;
    const key = `sudoku_night_ghost_v1/${slot.slice(0, 10)}`;
    const bit = 1 << Number(slot.slice(-1));
    try {
        const played = Number(storage.getItem(key)) || 0;
        if (played & bit) return false;
        storage.setItem(key, String(played | bit));
        return true;
    } catch {
        return false;
    }
}

function groupSize(axis, spec) {
    return axis === 'band' ? spec.boxRows : spec.boxCols;
}

export function chooseGhostSwap(game, slot, random = Math.random) {
    const spec = resolveSpec(game.board);
    const axis = random() < 0.5 ? 'band' : 'stack';
    const count = spec.gridSize / groupSize(axis, spec);
    return { slot, axis, from: Math.floor(random() * count), direction: random() < 0.5 ? -1 : 1 };
}

export function validateGhostSwap(swap, board) {
    if (!swap || typeof swap.slot !== 'string' || !SLOT_FORMAT.test(swap.slot)) return false;
    if (swap.axis !== 'band' && swap.axis !== 'stack') return false;
    if (!Array.isArray(board)) return false;
    const spec = resolveSpec(board);
    return Number.isInteger(swap.from) && swap.from >= 0 && swap.from < spec.gridSize / groupSize(swap.axis, spec)
        && (swap.direction === -1 || swap.direction === 1);
}

export function applyGhostSwap(game, swap) {
    const shift = swap.axis === 'band' ? shiftBand : shiftStack;
    return shift(game, swap.from, swap.direction);
}

export function ghostSwapGroups(swap, spec) {
    const size = groupSize(swap.axis, spec);
    const count = spec.gridSize / size;
    const to = (swap.from + swap.direction + count) % count;
    return { size, from: swap.from, to };
}
