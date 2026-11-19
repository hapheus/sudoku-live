import { hydrateGameState, applyRemoteCellPatch, serializeGameState } from '../domain/sudoku-engine.js';
import { HINT_USED_EVENT, mergePlayerContributions, recordPlayerContribution } from '../domain/game-contributions.js';
import { mergeRecoverySnapshot, newerRevision } from './merge-recovery-snapshot.js';
const CELL_EVENT = 'cell-update';
const actorOf = (data) => data.stateActor || data.senderId;

export const REMATCH_EVENT = 'new-puzzle-accept';
const REPLACEMENTS = new Set(['init', 'sync', REMATCH_EVENT]);
const isStateFrame = (type, data) => Boolean(data.gameState && (REPLACEMENTS.has(type) || type === 'ping'));
const stampOf = (data) => Number.isSafeInteger(data.stateClock) && actorOf(data)
    ? [data.stateClock, actorOf(data)] : null;
const newer = newerRevision;

const MUTATIONS = new Set(['init', 'sync', CELL_EVENT, REMATCH_EVENT, 'new-puzzle-request', 'new-puzzle-cancel']);

function generationMatches(type, data, generation, advances) {
    if (!MUTATIONS.has(type) && type !== HINT_USED_EVENT && !data.gameState) return true;
    if (type === REMATCH_EVENT) return (generation === null && data.puzzleGeneration == null)
        || data.puzzleGeneration === data.eventId;
    return generation === null || data.puzzleGeneration === generation || advances;
}

/** Causal knowledge of applied Sudoku changes, independent of clocks and presence. */
export function createStateRecovery() {
    const seen = new Map();
    let legacyChanges = false;
    let generation = null;
    let generationRevision = null;
    let clock = 0;
    let replacement = null;
    let latestMutation = null;
    let localState = null;
    let control = null;
    const cells = new Map();
    const updateLocalState = (type, data, stamp) => {
        if (isStateFrame(type, data)) localState = hydrateGameState(data.gameState);
        else if (type === HINT_USED_EVENT && localState) localState = recordPlayerContribution(localState, data);
        else if (type === CELL_EVENT && localState) {
            const before = localState.notes;
            localState = applyRemoteCellPatch(localState, data);
            localState.notes.forEach((notes, index) => {
                if (notes.join(',') !== before[index].join(',') && newer(stamp, cells.get(index)?.notes)) {
                    cells.set(index, { ...cells.get(index), notes: stamp });
                }
            });
        }
    };
    const adoptGeneration = (type, data, stamp) => {
        const advancesGeneration = isStateFrame(type, data) && typeof data.puzzleGeneration === 'string'
            && data.puzzleGeneration !== generation;
        if (advancesGeneration) {
            generation = data.puzzleGeneration;
            generationRevision = data.puzzleRevision || stamp;
            seen.clear();
            cells.clear();
            replacement = generationRevision;
            latestMutation = generationRevision;
            legacyChanges = false;
            control = null;
        }
        return advancesGeneration;
    };
    const revisions = () => ({ replacement, latest: latestMutation, cells: [...cells], control });
    const canMerge = (data) => Boolean(localState && data.puzzleGeneration === generation
        && data.stateRevisions?.replacement && replacement && data.gameState?.board?.length === localState.board.length);
    const restoreRevisions = (metadata) => {
        replacement = metadata.replacement;
        latestMutation = metadata.latest;
        control = metadata.control || null;
        cells.clear();
        for (const [index, revision] of metadata.cells) cells.set(index, revision);
    };
    const mergeVector = (vector) => {
        for (const [sender, seq] of Object.entries(vector)) seen.set(sender, Math.max(seen.get(sender) || 0, seq));
    };
    const rememberCell = (data, stamp) => {
        const revision = { ...cells.get(data.index) };
        if (typeof data.value === 'number') revision.value = stamp;
        if (Array.isArray(data.notes)) revision.notes = stamp;
        cells.set(data.index, revision);
    };
    const writable = (data, field) => {
        const present = field === 'value' ? typeof data.value === 'number' : Array.isArray(data.notes);
        return present && newer(stampOf(data), cells.get(data.index)?.[field] || replacement);
    };
    return {
        project(type, data, authoritative = true) {
            if (type === 'ping' && canMerge(data)) {
                const merged = mergeRecoverySnapshot(localState, data, revisions(), authoritative);
                if (merged) return { ...merged, stateVector: { ...data.stateVector, ...Object.fromEntries(
                    [...seen].map(([id, seq]) => [id, Math.max(seq, data.stateVector?.[id] || 0)])),
                } };
            }
            if (isStateFrame(type, data) && type !== REMATCH_EVENT && localState && data.puzzleGeneration === generation) {
                return { ...data, gameState: {
                    ...data.gameState,
                    playerContributions: mergePlayerContributions(localState.playerContributions, data.gameState.playerContributions),
                    wasMultiplayer: Boolean(localState.wasMultiplayer || data.gameState.wasMultiplayer),
                } };
            }
            if (type !== CELL_EVENT || !stampOf(data)) return data;
            const projected = { ...data };
            if (!writable(data, 'value')) { projected.value = null; delete projected.owner; delete projected.authorId; }
            if (!writable(data, 'notes')) delete projected.notes;
            return projected;
        },
        generation: () => generation,
        revision: () => generationRevision,
        revisions,
        snapshot(fallback) {
            if (!localState) return fallback;
            return {
                ...serializeGameState(localState),
                elapsedSeconds: Math.max(localState.elapsedSeconds || 0, fallback?.elapsedSeconds || 0),
                playerContributions: mergePlayerContributions(localState.playerContributions, fallback?.playerContributions),
                wasMultiplayer: Boolean(localState.wasMultiplayer || fallback?.wasMultiplayer),
            };
        },
        nextClock: () => ++clock,
        supersede(type, data) {
            if (MUTATIONS.has(type) || isStateFrame(type, data)) clock = Math.max(clock, data.stateClock || 0);
            const losesCell = type === CELL_EVENT && data.puzzleGeneration === generation
                && !writable(data, 'value') && !writable(data, 'notes');
            if (generation !== null && data.puzzleGeneration !== generation) return;
            if (stampOf(data) && (losesCell || (REPLACEMENTS.has(type) && !newer(stampOf(data), replacement)))) {
                if (data.senderId && data.seq) seen.set(actorOf(data), Math.max(seen.get(actorOf(data)) || 0, data.seq));
            }
        },
        vector: () => Object.fromEntries(seen),
        accepts(type, data, authoritative = true) {
            const advancesGeneration = Boolean(data.gameState && data.puzzleGeneration
                && data.puzzleGeneration !== generation && newer(data.puzzleRevision, generationRevision));
            if (!generationMatches(type, data, generation, advancesGeneration)) return false;
            const stamp = stampOf(data);
            if (type === CELL_EVENT && stamp && !writable(data, 'value') && !writable(data, 'notes')) return false;
            if (!advancesGeneration && REPLACEMENTS.has(type) && stamp && !newer(stamp, type === REMATCH_EVENT ? replacement : latestMutation)) return false;
            if (!data.gameState) return !MUTATIONS.has(type) || !data.senderId || !data.seq
                || data.seq > (seen.get(actorOf(data)) || 0);
            // Legacy snapshots can initialize a room, but cannot prove they include known changes.
            if (!data.stateVector) return !seen.size && !legacyChanges;
            if (legacyChanges && !advancesGeneration) return false;
            const includesKnownChanges = [...seen].every(([sender, seq]) => (data.stateVector[sender] || 0) >= seq);
            const advances = Object.entries(data.stateVector).some(([sender, seq]) => seq > (seen.get(sender) || 0));
            return (advancesGeneration || (type === 'ping' && canMerge(data) && advances) || includesKnownChanges || Boolean(REPLACEMENTS.has(type) && stamp
                && newer(stamp, type === REMATCH_EVENT ? replacement : latestMutation)))
                && (type !== 'ping' || authoritative || advances || (canMerge(data)
                    && newer(data.stateRevisions.latest, latestMutation)));
        },
        observe(type, data) {
            const stamp = stampOf(data);
            updateLocalState(type, data, stamp);
            if (type === 'new-puzzle-request' && stamp) control = { revision: stamp, pending: data.role };
            if (type === 'new-puzzle-cancel' && stamp) control = { revision: stamp, pending: null };
            if (MUTATIONS.has(type) || isStateFrame(type, data)) clock = Math.max(clock, data.stateClock || 0);
            if (type === CELL_EVENT && stamp) rememberCell(data, stamp);
            if (REPLACEMENTS.has(type) && stamp) {
                replacement = stamp;
                cells.clear();
            }
            if (MUTATIONS.has(type) && newer(stamp, latestMutation)) latestMutation = stamp;
            const advancesGeneration = adoptGeneration(type, data, stamp);
            if (isStateFrame(type, data) && data.stateVector && !(advancesGeneration && type === REMATCH_EVENT)) {
                mergeVector(data.stateVector);
            }
            if (type === 'ping' && data.stateRevisions) {
                restoreRevisions(data.stateRevisions);
            }
            if (!MUTATIONS.has(type)) return;
            if (!data.senderId || !Number.isSafeInteger(data.seq)) {
                legacyChanges = true;
                return;
            }
            seen.set(actorOf(data), Math.max(seen.get(actorOf(data)) || 0, data.seq));
        },
    };
}
