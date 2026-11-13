export const ALLOWED_REACTIONS = new Set(['👏', '🔥', '💡', '😮', '😂', '🎉']);

export const REACTION_LIST = ['👏', '🔥', '💡', '😮', '😂', '🎉'];

/**
 * Aggregates active spectator hints by cell index.
 * Each hint entry in hintsBySender: { senderId, index, value } where value is 1..9 or null (nudge).
 *
 * @returns {Map<number, { index: number, topValue: number|null, count: number }>}
 */
export function aggregateHintsByCell(hintsBySender) {
    const byCell = new Map();

    for (const hint of hintsBySender.values()) {
        if (!hint || !Number.isInteger(hint.index) || hint.index < 0 || hint.index >= 81) {
            continue;
        }

        let entry = byCell.get(hint.index);
        if (!entry) {
            entry = { index: hint.index, count: 0, valueCounts: new Map() };
            byCell.set(hint.index, entry);
        }

        entry.count++;
        if (Number.isInteger(hint.value) && hint.value >= 1 && hint.value <= 9) {
            entry.valueCounts.set(hint.value, (entry.valueCounts.get(hint.value) || 0) + 1);
        }
    }

    const result = new Map();
    for (const [index, entry] of byCell.entries()) {
        let topValue = null;
        let topCount = 0;
        for (const [val, count] of entry.valueCounts.entries()) {
            if (count > topCount) {
                topCount = count;
                topValue = val;
            }
        }
        result.set(index, {
            index,
            topValue,
            count: entry.count,
        });
    }

    return result;
}
