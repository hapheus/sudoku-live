import React from 'react';
import { getCellCoords } from '../domain/sudoku-generator.js';
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
    onSendHint,
    onSendReaction,
}) {
    let hintStatus = 'Select an empty cell on the board, then suggest a digit or nudge the players:';
    if (selectedIndex !== null) {
        const { row, col } = getCellCoords(selectedIndex);
        hintStatus = board[selectedIndex] !== 0
            ? `Row ${row + 1}, Column ${col + 1} is already filled. Select an empty cell to suggest a hint.`
            : `Selected Row ${row + 1}, Column ${col + 1} — choose 1-9 or Nudge to send a hint:`;
    }

    return (
        <section id="watcher-interactions" className="watcher-interactions" aria-label="Spectator Interactions">
            <p id="watcher-hint-status" className="watcher-interactions__hint">
                {hintStatus}
            </p>

            <div className="spectator-pad" role="group" aria-label="Suggest a digit hint">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                    <button
                        key={d}
                        type="button"
                        className="spectator-pad__btn"
                        data-hint-digit={d}
                        aria-label={`Suggest digit ${d}`}
                        onClick={() => onSendHint(d)}
                    >
                        {d}
                    </button>
                ))}
                <button
                    type="button"
                    id="spectator-nudge-btn"
                    className="spectator-pad__action"
                    onClick={() => onSendHint(null)}
                >
                    Nudge
                </button>
                <button
                    type="button"
                    id="spectator-clear-hint-btn"
                    className="spectator-pad__action spectator-pad__action--muted"
                    onClick={() => onSendHint(undefined)}
                >
                    Clear
                </button>
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
