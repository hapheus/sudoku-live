import { getCellCoords } from '../domain/sudoku-generator.js';

export const ALLOWED_REACTIONS = new Set(['👏', '🔥', '💡', '😮', '😂', '🎉']);

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

export function renderSpectatorHintsList(container, hintsByCell, { canApply = false, onSelectHint, onApplyHint } = {}) {
    if (!container) return;
    container.replaceChildren();

    if (!hintsByCell || hintsByCell.size === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';

    const label = document.createElement('span');
    label.className = 'hints-feed__label';
    label.textContent = 'Spectator hints:';
    container.appendChild(label);

    for (const hint of hintsByCell.values()) {
        const { row, col } = getCellCoords(hint.index);
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'hint-chip';

        const digitPart = hint.topValue ? ` → ${hint.topValue}` : ' (check cell)';
        const countPart = hint.count > 1 ? ` ×${hint.count}` : '';
        chip.textContent = `R${row + 1}C${col + 1}${digitPart}${countPart}`;
        chip.title = canApply && hint.topValue
            ? `Apply hint ${hint.topValue} to Row ${row + 1}, Column ${col + 1}`
            : `Highlight Row ${row + 1}, Column ${col + 1}`;

        chip.addEventListener('click', () => {
            if (canApply && hint.topValue && onApplyHint) {
                onApplyHint(hint.index, hint.topValue);
            } else if (onSelectHint) {
                onSelectHint(hint.index);
            }
        });

        container.appendChild(chip);
    }
}

export function spawnFloatingEmoji(reactionStage, emoji) {
    if (!reactionStage || !ALLOWED_REACTIONS.has(emoji)) {
        return null;
    }

    const el = document.createElement('span');
    el.className = 'floating-emoji';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = emoji;
    el.style.left = `${15 + Math.floor(Math.random() * 68)}%`;

    reactionStage.appendChild(el);
    setTimeout(() => {
        el.remove();
    }, 1850);

    return el;
}
