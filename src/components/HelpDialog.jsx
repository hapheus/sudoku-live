import React from 'react';
import enMessages from '../locales/en.json';
import { DialogCard } from './DialogCard.jsx';

export function HelpDialog({ isOpen, onClose, panel = false, returnFocusRef = null, messages = enMessages }) {
    if (!isOpen) return null;

    return (
        <DialogCard
            id="help-dialog"
            title={messages.helpTitle}
            closeLabel={messages.closeLabel}
            onClose={onClose}
            panel={panel}
            returnFocusRef={returnFocusRef}
        >
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
                    <p className="help-section__text">
                        <strong>{messages.helpToolsShiftLabel}</strong> {messages.helpToolsShiftText}
                    </p>
                </div>

                <div className="help-section">
                    <h3 className="help-section__heading">{messages.helpLiveHeading}</h3>
                    <p className="help-section__text">{messages.helpLiveWatchText}</p>
                    <p className="help-section__text">{messages.helpLiveCoopText}</p>
                </div>
            </div>
        </DialogCard>
    );
}
