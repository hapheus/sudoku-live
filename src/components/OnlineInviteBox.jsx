import React, { useRef, useState } from 'react';

export function OnlineInviteBox({ inviteUrl }) {
    const [feedback, setFeedback] = useState('');
    const inputRef = useRef(null);

    async function handleCopyOrShare() {
        if (!inviteUrl) return;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'Sudoku Live Co-op',
                    text: 'Solve this Sudoku puzzle with me!',
                    url: inviteUrl,
                });
                return;
            }
            await navigator.clipboard.writeText(inviteUrl);
            setFeedback('Link copied to clipboard.');
        } catch {
            inputRef.current?.select();
            document.execCommand?.('copy');
            setFeedback('Link copied.');
        }

        setTimeout(() => setFeedback(''), 3000);
    }

    return (
        <section id="online-controls" className="online-box" aria-label="Multiplayer Invitation">
            <span className="online-box__label">Invite a co-op partner or spectators with this link:</span>
            <div className="online-box__input-row">
                <input
                    ref={inputRef}
                    type="text"
                    id="invite-url-input"
                    className="online-box__input"
                    value={inviteUrl}
                    readOnly
                    aria-label="Invitation link"
                />
                <button
                    type="button"
                    id="copy-link-btn"
                    className="online-box__btn"
                    onClick={handleCopyOrShare}
                >
                    Copy Link
                </button>
            </div>
            <div id="copy-feedback" className="online-box__feedback" role="status" aria-live="polite">
                {feedback}
            </div>
        </section>
    );
}
