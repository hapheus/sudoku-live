import React, { useEffect, useRef, useState } from 'react';

export function OnlineInviteBox({ inviteUrl, partnerOnline = false }) {
    const [feedback, setFeedback] = useState('');
    const [expanded, setExpanded] = useState(!partnerOnline);
    const inputRef = useRef(null);

    useEffect(() => {
        setExpanded(!partnerOnline);
    }, [partnerOnline]);

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
            setFeedback('Invite link copied.');
        } catch {
            inputRef.current?.select();
            document.execCommand?.('copy');
            setFeedback('Invite link copied.');
        }

        setTimeout(() => setFeedback(''), 3000);
    }

    if (partnerOnline && !expanded) {
        return (
            <section id="online-controls" className="online-box online-box--compact" aria-label="Multiplayer Invitation">
                <div className="online-box__compact-row">
                    <span className="online-box__compact-status">
                        <span className="online-box__dot" aria-hidden="true" />
                        Partner connected
                    </span>
                    <div className="online-box__compact-actions">
                        <button
                            type="button"
                            id="copy-link-btn"
                            className="online-box__btn online-box__btn--sm"
                            onClick={handleCopyOrShare}
                        >
                            Share Link
                        </button>
                        <button
                            type="button"
                            className="online-box__btn online-box__btn--ghost"
                            aria-expanded="false"
                            onClick={() => setExpanded(true)}
                        >
                            Show URL
                        </button>
                    </div>
                </div>
                {feedback && (
                    <div id="copy-feedback" className="online-box__feedback" role="status" aria-live="polite">
                        {feedback}
                    </div>
                )}
            </section>
        );
    }

    return (
        <section id="online-controls" className="online-box" aria-label="Multiplayer Invitation">
            <div className="online-box__header">
                <span className="online-box__label">Invite a co-op partner or spectators:</span>
                {partnerOnline && (
                    <button
                        type="button"
                        className="online-box__collapse-btn"
                        aria-expanded="true"
                        onClick={() => setExpanded(false)}
                    >
                        Hide
                    </button>
                )}
            </div>
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
            {feedback && (
                <div id="copy-feedback" className="online-box__feedback" role="status" aria-live="polite">
                    {feedback}
                </div>
            )}
        </section>
    );
}
