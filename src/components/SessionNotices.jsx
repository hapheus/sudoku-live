import React from 'react';
import { AlertBannerDialog } from './AlertBannerDialog.jsx';

export function SessionNotices({ pendingConfirm, incomingJoinRequest, myRole, isSpectating,
    confirmCancelRef, onClearConfirmation, onRespondJoinRequest, messages }) {
    return (
        <>
            {pendingConfirm && (
                <AlertBannerDialog
                    id="confirm-dialog"
                    titleId="confirm-title"
                    title={pendingConfirm.title}
                    message={pendingConfirm.message}
                    cancelLabel={pendingConfirm.cancelLabel}
                    confirmLabel={pendingConfirm.confirmLabel}
                    confirmVariant="confirm"
                    cancelRef={confirmCancelRef}
                    onCancel={onClearConfirmation}
                    onConfirm={() => {
                        const action = pendingConfirm.onConfirm;
                        onClearConfirmation();
                        action?.();
                    }}
                />
            )}

            {incomingJoinRequest && myRole === 'host' && !isSpectating && (
                <AlertBannerDialog
                    id="join-request-banner"
                    titleId="join-request-title"
                    title={messages.joinRequestTitle || 'Player wants to join'}
                    message={incomingJoinRequest.requesterName
                        ? (messages.joinRequestMessageNamed || '{name} would like to join this puzzle in Co-op mode.')
                            .replace('{name}', incomingJoinRequest.requesterName)
                        : (messages.joinRequestMessage || 'Another player would like to join this puzzle in Co-op mode.')}
                    cancelId="decline-join-btn"
                    confirmId="accept-join-btn"
                    cancelLabel={messages.joinRequestDecline || 'Decline'}
                    confirmLabel={messages.joinRequestAccept || 'Allow'}
                    confirmVariant="accept"
                    onCancel={() => onRespondJoinRequest(false)}
                    onConfirm={() => onRespondJoinRequest(true)}
                />
            )}
        </>
    );
}
