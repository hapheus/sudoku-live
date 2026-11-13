import React from 'react';
import { getCellCoords, getVariantSpec, inferVariantFromBoardLength } from '../domain/sudoku-generator.js';
import { REACTION_LIST } from '../utils/watcher-helpers.js';

const EMOJI_LABELS = {
    '👏': 'Send applause reaction',
    '🔥': 'Send fire reaction',
    '💡': 'Send lightbulb reaction',
    '😮': 'Send surprised reaction',
    '😂': 'Send laugh reaction',
    '🎉': 'Send celebration reaction',
};

export function WatcherInteractions({
    selectedIndex,
    board,
    variant = null,
    onSendHint,
    onSendReaction,
}) {
    const resolvedVariant = variant || inferVariantFromBoardLength(board?.length);
    const { maxDigit } = getVariantSpec(resolvedVariant);
    const digits = Array.from({ length: maxDigit }, (_, i) => i + 1);

    const canHintSelected = selectedIndex !== null && board[selectedIndex] === 0;
    let hintStatus = `Tap an empty cell on the board, then suggest 1–${maxDigit} or nudge players to inspect it:`;
    if (selectedIndex !== null) {
        const { row, col } = getCellCoords(selectedIndex, resolvedVariant);
        hintStatus = board[selectedIndex] !== 0
            ? `R${row + 1} C${col + 1} already has a digit. Select an empty cell to suggest a hint.`
            : `Selected R${row + 1} C${col + 1} — suggest a digit or nudge players to look here:`;
    }

    return (
        <section id="watcher-interactions" className="watcher-interactions" aria-label="Spectator Interactions">
            <p id="watcher-hint-status" className="watcher-interactions__hint">
                {hintStatus}
            </p>

            <div className="spectator-pad" role="group" aria-label="Suggest a digit hint">
                <div className={`spectator-pad__digits ${maxDigit === 6 ? 'spectator-pad__digits--6x6' : ''}`}>
                    {digits.map((d) => (
                        <button
                            key={d}
                            type="button"
                            className="spectator-pad__btn"
                            data-hint-digit={d}
                            aria-label={`Suggest digit ${d}`}
                            disabled={selectedIndex !== null && !canHintSelected}
                            onClick={() => onSendHint(d)}
                        >
                            {d}
                        </button>
                    ))}
                </div>
                <div className="spectator-pad__actions">
                    <button
                        type="button"
                        id="spectator-nudge-btn"
                        className="spectator-pad__action"
                        title="Draw attention to the selected cell without naming a digit"
                        onClick={() => onSendHint(null)}
                    >
                        Nudge cell
                    </button>
                    <button
                        type="button"
                        id="spectator-clear-hint-btn"
                        className="spectator-pad__action spectator-pad__action--muted"
                        onClick={() => onSendHint(undefined)}
                    >
                        Clear hint
                    </button>
                </div>
            </div>

            <div className="emoji-bar" role="group" aria-label="Send emoji reaction">
                {REACTION_LIST.map((emoji) => (
                    <button
                        key={emoji}
                        type="button"
                        className="emoji-btn"
                        data-emoji={emoji}
                        aria-label={EMOJI_LABELS[emoji] || `Send ${emoji} reaction`}
                        onClick={() => onSendReaction(emoji)}
                    >
                        {emoji}
                    </button>
                ))}
            </div>
        </section>
    );
}
