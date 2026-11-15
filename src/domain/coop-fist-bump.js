/**
 * Tracks recent local and remote cell solves to detect simultaneous Co-op solves
 * within a configurable time window (default 500ms) and trigger a fist-bump easter egg.
 */

export function createCoopFistBumpTracker({ windowMs = 500, dedupeMs = 1000 } = {}) {
    const localSolves = new Map();
    const remoteSolves = new Map();
    const recentEffects = new Map();

    const pruneOldEntries = (map, maxAge, now) => {
        for (const [key, entry] of map.entries()) {
            const ts = typeof entry === 'number' ? entry : entry.timestamp;
            if (now - ts > maxAge) {
                map.delete(key);
            }
        }
    };

    const claimEffect = (index, value, now = Date.now()) => {
        pruneOldEntries(recentEffects, dedupeMs, now);
        const key = `${index}:${value}`;
        const prevTs = recentEffects.get(key);
        if (typeof prevTs === 'number' && now - prevTs <= dedupeMs) {
            return false;
        }
        recentEffects.set(key, now);
        return true;
    };

    const recordSolve = (ownMap, otherMap, index, value, now = Date.now()) => {
        if (!Number.isInteger(index) || !Number.isInteger(value) || value <= 0) {
            return { matched: false };
        }
        pruneOldEntries(ownMap, windowMs, now);
        pruneOldEntries(otherMap, windowMs, now);
        ownMap.set(index, { value, timestamp: now });

        const peer = otherMap.get(index);
        if (peer && peer.value === value && now - peer.timestamp <= windowMs) {
            return { matched: true, index, value };
        }
        return { matched: false };
    };

    return {
        recordLocalSolve: (index, value, now = Date.now()) => recordSolve(localSolves, remoteSolves, index, value, now),
        recordRemoteSolve: (index, value, now = Date.now()) => recordSolve(remoteSolves, localSolves, index, value, now),
        claimEffect,
        reset: () => {
            localSolves.clear();
            remoteSolves.clear();
            recentEffects.clear();
        },
    };
}
