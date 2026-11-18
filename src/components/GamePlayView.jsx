import React, { useLayoutEffect, useRef } from 'react';
import { SolveSummary } from './SolveSummary.jsx';
import { SpectatorHintsFeed } from './SpectatorHintsFeed.jsx';
import { StatusBanner } from './StatusBanner.jsx';
import { SudokuBoard } from './SudokuBoard.jsx';
import { TicTacToeView } from './TicTacToeView.jsx';

function useControlPaneFit(stackedLayout) {
    const paneRef = useRef(null);

    useLayoutEffect(() => {
        if (!stackedLayout) return undefined;

        const pane = paneRef.current;
        const content = pane.firstElementChild;
        let previousSize = '';
        const fit = () => {
            const size = () => [pane.clientWidth, pane.clientHeight, content.offsetWidth, content.offsetHeight].join(':');
            if (size() === previousSize) return;

            const available = pane.clientHeight;
            const fitsAt = (scale) => {
                content.style.setProperty('--controls-scale', scale);
                return content.getBoundingClientRect().height <= available;
            };

            if (!fitsAt(1)) {
                // Give content more room to wrap as the scale decreases.
                // Keep the largest size that fits the whole pane.
                let low = 0;
                let high = 1;
                for (let attempt = 0; attempt < 7; attempt += 1) {
                    const scale = (low + high) / 2;
                    if (fitsAt(scale)) low = scale;
                    else high = scale;
                }
                fitsAt(low);
            }
            previousSize = size();
        };
        const observer = new window.ResizeObserver(fit);
        observer.observe(pane);
        observer.observe(content);
        fit();
        return () => {
            observer.disconnect();
            content.style.removeProperty('--controls-scale');
        };
    }, [stackedLayout]);

    return paneRef;
}

export function GamePlayView({
    mainClassName,
    mainAriaLabel,
    topBar,
    stackedLayout = false,
    guide = null,
    notices = null,
    connectionStatus,
    mode,
    isSpectating,
    myRole,
    myClientId,
    currentMembers,
    spectatedGameMode,
    gameState,
    ticTacToeGame = null,
    onTicTacToeMove = () => {},
    onReconnect,
    onContinueSolo = null,
    selectedIndex,
    activeDigit,
    hintsByCell,
    floatingReactions,
    cellRefs,
    onCellSelect,
    playerCursorIndex,
    partnerCursorIndices,
    unitCelebration,
    hintHighlight,
    fistBump = null,
    nightGhost = null,
    dismissNightGhost,
    boardBackground,
    actionFeedback,
    isCoopSession,
    restartLabel,
    restartDisabled,
    onPlayAgain,
    onBackToSetup = null,
    activeBoardVariant,
    onSelectHint,
    onApplyHint,
    bottomControls,
    messages,
}) {
    const lowerPaneRef = useControlPaneFit(stackedLayout);
    const notifications = <>{notices}{actionFeedback && (
        <div id="action-feedback" className="action-feedback" role="status">{actionFeedback}</div>
    )}</>;
    const status = (
        <div className="gameplay-stage__status">
            {!stackedLayout && notifications}
            <StatusBanner
                connectionStatus={connectionStatus}
                mode={mode}
                isSpectating={isSpectating}
                myRole={myRole}
                myClientId={myClientId}
                currentMembers={currentMembers}
                spectatedGameMode={spectatedGameMode}
                gameState={gameState}
                onReconnect={onReconnect}
                onContinueSolo={onContinueSolo}
                messages={messages}
            />
        </div>
    );
    return (
        <main
            className={mainClassName}
            aria-label={mainAriaLabel}
            onPointerDownCapture={nightGhost ? dismissNightGhost : undefined}
            onKeyDownCapture={nightGhost ? dismissNightGhost : undefined}
        >
            {!stackedLayout && topBar}

            <div className="gameplay-stage">
                {!stackedLayout && !guide && status}
                <div className="gameplay-stage__board">
                    {ticTacToeGame && ticTacToeGame.phase !== 'transition' ? (
                        <TicTacToeView
                            game={ticTacToeGame}
                            playerId={myClientId}
                            isSpectating={isSpectating}
                            onMove={onTicTacToeMove}
                            messages={messages}
                        />
                    ) : (
                        <div className={ticTacToeGame?.phase === 'transition' ? 'tic-tac-toe-transition-stage tic-tac-toe-transition-stage--active' : 'tic-tac-toe-transition-stage'}>
                            <SudokuBoard
                                gameState={gameState}
                                selectedIndex={selectedIndex}
                                activeDigit={activeDigit}
                                hintsByCell={hintsByCell}
                                floatingReactions={floatingReactions}
                                cellRefs={cellRefs}
                                onCellSelect={onCellSelect}
                                myRole={myRole}
                                playerCursorIndex={playerCursorIndex}
                                partnerCursorIndices={partnerCursorIndices}
                                unitCelebration={unitCelebration}
                                hintHighlight={hintHighlight}
                                fistBump={fistBump}
                                nightGhost={nightGhost}
                                boardBackground={boardBackground}
                                messages={messages}
                            />
                            {ticTacToeGame?.phase === 'transition' && (
                                <div className="tic-tac-toe-transition" role="status" aria-live="polite">
                                    <p className="tic-tac-toe-transition__text">
                                        {messages?.ticTacToeTransition || "You undo me. I undo you. Let's settle this."}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="gameplay-stage__lower" ref={lowerPaneRef}>
                    <div className="gameplay-stage__lower-content">
                        {stackedLayout && topBar}
                        {stackedLayout && status}
                        {stackedLayout && notifications}
                        {guide ? <div className="gameplay-stage__guide">{!stackedLayout && notifications}{guide}</div> : <div className="gameplay-stage__side">

                            {gameState.status === 'solved' ? (
                                <SolveSummary
                                    difficulty={gameState.difficulty}
                                    elapsedSeconds={gameState.elapsedSeconds}
                                    mode={isCoopSession ? 'online' : 'solo'}
                                    isSpectating={isSpectating}
                                    restartLabel={restartLabel}
                                    restartDisabled={restartDisabled}
                                    onPlayAgain={onPlayAgain}
                                    onBackToSetup={onBackToSetup}
                                    messages={messages}
                                />
                            ) : (
                                <>
                                    <SpectatorHintsFeed
                                        hintsByCell={hintsByCell}
                                        variant={activeBoardVariant}
                                        canApply={!isSpectating}
                                        onSelectHint={onSelectHint}
                                        onApplyHint={onApplyHint}
                                        messages={messages}
                                    />

                                    {bottomControls}
                                </>
                            )}
                        </div>}
                    </div>
                </div>
            </div>
        </main>
    );
}
