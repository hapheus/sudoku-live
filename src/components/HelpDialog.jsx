import React, { useEffect, useRef } from 'react';

export function HelpDialog({ isOpen, onClose }) {
    const closeBtnRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        closeBtnRef.current?.focus();

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="dialog-backdrop"
            role="presentation"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <section
                id="help-dialog"
                className="dialog-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="help-dialog-title"
            >
                <div className="dialog-card__header">
                    <h2 id="help-dialog-title" className="dialog-card__title">How to Play &amp; Shortcuts</h2>
                    <button
                        ref={closeBtnRef}
                        type="button"
                        className="dialog-card__close"
                        aria-label="Close help"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>

                <div className="help-sections">
                    <div className="help-section">
                        <h3 className="help-section__heading">Two Ways to Enter Digits</h3>
                        <p className="help-section__text">
                            <strong>Cell first:</strong> Select any empty cell, then tap a number 1–9.
                        </p>
                        <p className="help-section__text">
                            <strong>Digit first:</strong> With no cell selected, tap 1–9 on the number pad to lock that digit, then tap empty cells to place it.
                        </p>
                    </div>

                    <div className="help-section">
                        <h3 className="help-section__heading">Keyboard Shortcuts</h3>
                        <ul className="shortcut-list">
                            <li><span>Move across grid</span><kbd>Arrow keys</kbd></li>
                            <li><span>Enter digit</span><kbd>1 – 9</kbd></li>
                            <li><span>Clear cell</span><kbd>Backspace / Del / 0</kbd></li>
                            <li><span>Toggle pencil notes</span><kbd>N</kbd></li>
                            <li><span>Undo last move</span><kbd>Ctrl / ⌘ + Z</kbd></li>
                            <li><span>Jump between grid &amp; pad</span><kbd>Tab</kbd></li>
                        </ul>
                    </div>

                    <div className="help-section">
                        <h3 className="help-section__heading">Online Co-op &amp; Spectators</h3>
                        <p className="help-section__text">
                            In <strong>Co-op</strong>, your digits appear in blue and your partner&rsquo;s digits and live cursor appear in violet.
                        </p>
                        <p className="help-section__text">
                            In <strong>Watch Live</strong>, spectators can suggest a digit (e.g. <code>R3C7 → 5</code>) or <strong>Nudge cell</strong> to highlight a square without giving away the answer.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
