import React from 'react';
import { SolveSummary } from './SolveSummary.jsx';
import { SpectatorHintsFeed } from './SpectatorHintsFeed.jsx';
import { StatusBanner } from './StatusBanner.jsx';
import { SudokuBoard } from './SudokuBoard.jsx';

export function GamePlayView({
    mainClassName,
    mainAriaLabel,
    topBar,
    connectionStatus,
    mode,
    isSpectating,
    myRole,
    myClientId,
    currentMembers,
    spectatedGameMode,
    gameState,
    onReconnect,
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
    boardBackground,
    actionFeedback,
    isCoopSession,
    restartLabel,
    restartDisabled,
    onPlayAgain,
    activeBoardVariant,
    onSelectHint,
    onApplyHint,
    bottomControls,
    messages,
}) {
    return (
        <main className={mainClassName} aria-label={mainAriaLabel}>
            {topBar}

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
                messages={messages}
            />

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
                boardBackground={boardBackground}
            />

            {actionFeedback && (
                <div id="action-feedback" className="action-feedback" role="status">
                    {actionFeedback}
                </div>
            )}

            {gameState.status === 'solved' && (
                <SolveSummary
                    difficulty={gameState.difficulty}
                    elapsedSeconds={gameState.elapsedSeconds}
                    mode={isCoopSession ? 'online' : 'solo'}
                    isSpectating={isSpectating}
                    restartLabel={restartLabel}
                    restartDisabled={restartDisabled}
                    onPlayAgain={onPlayAgain}
                    messages={messages}
                />
            )}

            <SpectatorHintsFeed
                hintsByCell={hintsByCell}
                variant={activeBoardVariant}
                canApply={!isSpectating && gameState.status !== 'solved'}
                onSelectHint={onSelectHint}
                onApplyHint={onApplyHint}
                messages={messages}
            />

            {bottomControls}
        </main>
    );
}
