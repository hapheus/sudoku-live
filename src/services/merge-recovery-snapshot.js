import { hydrateGameState, serializeGameState } from '../domain/sudoku-engine.js';

export const newerRevision = (a, b) => Boolean(a && (!b || a[0] > b[0] || (a[0] === b[0] && a[1] > b[1])));

function mergeCell(index, result, left, right, replacement, authoritative) {
    const cell = {};
    for (const field of ['value', 'notes']) {
        const leftRevision = left.cells.get(index)?.[field] || left.base;
        const rightRevision = right.cells.get(index)?.[field] || right.base;
        const remoteWins = newerRevision(rightRevision, leftRevision) || (!newerRevision(leftRevision, rightRevision) && authoritative);
        const source = remoteWins ? right.state : left.state;
        const revision = remoteWins ? rightRevision : leftRevision;
        if (!newerRevision(revision, replacement)) continue;
        cell[field] = revision;
        if (field === 'value' && !result.givens[index]) {
            result.board[index] = source.board[index];
            result.cellOwners[index] = source.cellOwners[index];
        }
        if (field === 'notes') result.notes[index] = [...source.notes[index]];
    }
    if (result.board[index] !== 0 || result.givens[index]) result.notes[index] = [];
    return Object.keys(cell).length ? [index, cell] : null;
}

/** Merge bounded cell registers over the winning shift/undo checkpoint. No clocks from wall time. */
export function mergeRecoverySnapshot(local, remote, localRevisions, authoritative) {
    const incoming = hydrateGameState(remote.gameState);
    if (!local || !incoming || local.variant !== incoming.variant || !remote.stateRevisions?.replacement
        || !localRevisions.replacement) return null;
    const revisions = remote.stateRevisions;
    const remoteBaseWins = newerRevision(revisions.replacement, localRevisions.replacement);
    const base = remoteBaseWins ? incoming : local;
    const result = serializeGameState(base);
    result.board = [...base.board]; result.notes = base.notes.map(notes => [...notes]);
    result.cellOwners = [...base.cellOwners];
    const localCells = new Map(localRevisions.cells);
    const remoteCells = new Map(revisions.cells);
    const replacement = remoteBaseWins ? revisions.replacement : localRevisions.replacement;
    const cells = [];
    for (let index = 0; index < result.board.length; index++) {
        const cell = mergeCell(index, result,
            { state: local, cells: localCells, base: localRevisions.replacement },
            { state: incoming, cells: remoteCells, base: revisions.replacement }, replacement, authoritative);
        if (cell) cells.push(cell);
    }
    // The puzzle clock never becomes a revision or runs backwards within this generation.
    result.elapsedSeconds = Math.max(local.elapsedSeconds || 0, incoming.elapsedSeconds || 0);
    const control = newerRevision(revisions.control?.revision, localRevisions.control?.revision)
        ? revisions.control : localRevisions.control;
    return {
        ...remote, gameState: result,
        ...(control ? { rematchRequestedBy: control.pending } : {}),
        stateRevisions: { replacement, cells, control,
            latest: newerRevision(revisions.latest, localRevisions.latest) ? revisions.latest : localRevisions.latest },
    };
}
