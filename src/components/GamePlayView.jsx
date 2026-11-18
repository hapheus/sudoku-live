import React from 'react';
import { SolveSummary } from './SolveSummary.jsx';
import { SpectatorHintsFeed } from './SpectatorHintsFeed.jsx';
import { StatusBanner } from './StatusBanner.jsx';
import { SudokuBoard } from './SudokuBoard.jsx';
import { TicTacToeView } from './TicTacToeView.jsx';

export function GamePlayView({
    mainClassName,
    mainAriaLabel,
    topBar,
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
    const notifications = <>{notices}{actionFeedback && (
        <div id="action-feedback" className="action-feedback" role="status">{actionFeedback}</div>
    )}</>;
    return (
        <main
            className={mainClassName}
            aria-label={mainAriaLabel}
            onPointerDownCapture={nightGhost ? dismissNightGhost : undefined}
            onKeyDownCapture={nightGhost ? dismissNightGhost : undefined}
        >
            {topBar}

            <div className="gameplay-stage">
                {!guide && <div className="gameplay-stage__status">
                    {notifications}
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
                </div>}

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

                {guide ? <div className="gameplay-stage__guide">{notifications}{guide}</div> : <div className="gameplay-stage__side">

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
        </main>
    );
}
