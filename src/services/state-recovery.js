const actorOf = (data) => data.stateActor || data.senderId;

const MUTATIONS = new Set(['init', 'sync', 'cell-update', 'new-puzzle-accept', 'new-puzzle-request', 'new-puzzle-cancel']);

/** Causal knowledge of applied Sudoku changes, independent of clocks and presence. */
export function createStateRecovery() {
    const seen = new Map();
    let legacyChanges = false;
    let generation = null;
    return {
        generation: () => generation,
        vector: () => Object.fromEntries(seen),
        accepts(type, data, authoritative = true) {
            if (MUTATIONS.has(type) || data.gameState) {
                if (type === 'new-puzzle-accept') {
                    if ((generation !== null || data.puzzleGeneration != null)
                        && data.puzzleGeneration !== data.eventId) return false;
                } else if (generation !== null && data.puzzleGeneration !== generation) return false;
            }
            if (!data.gameState) return !MUTATIONS.has(type) || !data.senderId || !data.seq
                || data.seq > (seen.get(actorOf(data)) || 0);
            // Legacy snapshots can initialize a room, but cannot prove they include known changes.
            if (!data.stateVector) return !seen.size && !legacyChanges;
            if (legacyChanges) return false;
            const includesKnownChanges = [...seen].every(([sender, seq]) => (data.stateVector[sender] || 0) >= seq);
            const advances = Object.entries(data.stateVector).some(([sender, seq]) => seq > (seen.get(sender) || 0));
            return includesKnownChanges && (type !== 'ping' || authoritative || advances);
        },
        observe(type, data) {
            if (data.gameState && typeof data.puzzleGeneration === 'string') generation = data.puzzleGeneration;
            if (data.gameState && data.stateVector) {
                for (const [sender, seq] of Object.entries(data.stateVector)) {
                    seen.set(sender, Math.max(seen.get(sender) || 0, seq));
                }
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
