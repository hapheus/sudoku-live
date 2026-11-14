export const DEFAULT_MAX_SEEN_EVENT_IDS = 200;

/**
 * Bounded insertion-ordered set for deduplicating incoming realtime events.
 */
export function createEventDeduper(maxSize = DEFAULT_MAX_SEEN_EVENT_IDS) {
    const seen = new Set();

    return {
        remember(eventId) {
            if (!eventId || typeof eventId !== 'string') {
                return false;
            }
            if (seen.has(eventId)) {
                return true;
            }
            seen.add(eventId);
            if (seen.size > maxSize) {
                const oldest = seen.values().next().value;
                seen.delete(oldest);
            }
            return false;
        },
        clear() {
            seen.clear();
        },
    };
}
