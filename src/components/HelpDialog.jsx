import React, { useEffect, useRef } from 'react';
import enMessages from '../locales/en.json';

export function HelpDialog({ isOpen, onClose, messages = enMessages }) {
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
                    <h2 id="help-dialog-title" className="dialog-card__title">{messages.helpTitle}</h2>
                    <button
                        ref={closeBtnRef}
                        type="button"
                        className="dialog-card__close"
                        aria-label={messages.closeLabel}
                        onClick={onClose}
                    >
                        {messages.closeLabel}
                    </button>
                </div>

                <div className="help-sections">
                    <div className="help-section">
                        <h3 className="help-section__heading">{messages.helpGoalHeading}</h3>
                        <p className="help-section__text">{messages.helpGoalBody}</p>
                    </div>

                    <div className="help-section">
                        <h3 className="help-section__heading">{messages.helpInputHeading}</h3>
                        <p className="help-section__text">
                            <strong>{messages.helpInputCellLabel}</strong> {messages.helpInputCellText}
                        </p>
                        <p className="help-section__text">
                            <strong>{messages.helpInputLockLabel}</strong> {messages.helpInputLockText}
                        </p>
                    </div>

                    <div className="help-section">
                        <h3 className="help-section__heading">{messages.helpToolsHeading}</h3>
                        <p className="help-section__text">
                            <strong>{messages.helpToolsNotesLabel}</strong> {messages.helpToolsNotesText}
                        </p>
                        <p className="help-section__text">
                            <strong>{messages.helpToolsActionsLabel}</strong> {messages.helpToolsActionsText}
                        </p>
                    </div>

                    <div className="help-section">
                        <h3 className="help-section__heading">{messages.helpLiveHeading}</h3>
                        <p className="help-section__text">{messages.helpLiveWatchText}</p>
                        <p className="help-section__text">{messages.helpLiveCoopText}</p>
                    </div>
                </div>
            </section>
        </div>
    );
}
