import { getCellCoords } from './domain/sudoku-generator.js';
import {
    applyRemoteCellPatch,
    createSudokuGame,
    hydrateGameState,
    serializeGameState,
    setCellValue,
    toggleCellNote,
    undoLastMove,
} from './domain/sudoku-engine.js';
import { SudokuBoardView } from './ui/sudoku-board-view.js';
import { LobbyView } from './ui/lobby-view.js';
import {
    aggregateHintsByCell,
    renderSpectatorHintsList,
    spawnFloatingEmoji,
} from './ui/watcher-interactions.js';
import { generateGameId, isValidGameId, OnlineGameClient } from './services/online-game-client.js';
import {
    loadOnlineGameSnapshot,
    loadParticipantSession,
    saveOnlineGameSnapshot,
    saveParticipantSession,
} from './services/online-state-storage.js';

document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('sudoku-app');
    if (!root) return;

    // Elements
    const boardElement = document.getElementById('sudoku-board');
    const announcementElement = document.getElementById('game-announcements');
    const statusElement = document.getElementById('game-status-text');
    const progressElement = document.getElementById('sudoku-progress');
    const timerElement = document.getElementById('sudoku-timer');
    const restartBtn = document.getElementById('restart-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const copyFeedback = document.getElementById('copy-feedback');
    const connectionBadge = document.getElementById('connection-status');
    const onlineControls = document.getElementById('online-controls');
    const inviteUrlInput = document.getElementById('invite-url-input');
    const difficultyGroup = document.getElementById('difficulty-group');
    const modeButtons = document.querySelectorAll('[data-mode-btn]');
    const difficultyRadios = document.querySelectorAll('input[name="sudoku-difficulty"]');

    // Player tool elements
    const playerControls = document.getElementById('player-controls');
    const undoBtn = document.getElementById('undo-btn');
    const eraseBtn = document.getElementById('erase-btn');
    const notesBtn = document.getElementById('notes-btn');
    const hintBtn = document.getElementById('hint-btn');
    const padButtons = document.querySelectorAll('.numpad-btn');

    // Watch & Spectator Elements
    const watchDirectory = document.getElementById('watch-directory');
    const liveGamesList = document.getElementById('live-games-list');
    const refreshLiveGamesBtn = document.getElementById('refresh-live-games-btn');
    const spectatorBar = document.getElementById('spectator-bar');
    const exitWatchBtn = document.getElementById('exit-watch-btn');
    const gamePanel = document.getElementById('game-panel');
    const opponentStatus = document.getElementById('opponent-status');
    const spectatorStatus = document.getElementById('spectator-status');
    const hintsFeed = document.getElementById('spectator-hints-feed');
    const watcherInteractions = document.getElementById('watcher-interactions');
    const watcherHintStatus = document.getElementById('watcher-hint-status');
    const spectatorPadButtons = document.querySelectorAll('.spectator-pad__btn');
    const spectatorNudgeBtn = document.getElementById('spectator-nudge-btn');
    const spectatorClearHintBtn = document.getElementById('spectator-clear-hint-btn');
    const reactionStage = document.getElementById('reaction-stage');
    const emojiButtons = document.querySelectorAll('.emoji-btn');

    // State
    let mode = root.dataset.initialMode || 'solo'; // 'solo' | 'online' | 'watch'
    let difficulty = localStorage.getItem('sudoku_difficulty') || 'medium';
    let gameState = createSudokuGame({ difficulty });
    let selectedIndex = null;
    let notesMode = false;
    let isSpectating = false;
    let spectatedGameMode = null;
    let currentMembers = [];
    let activeLobbyMembers = [];
    let rematchRequestedBy = null;
    const hintsBySender = new Map();

    // Online & Timer state
    const GAME_PING_INTERVAL_MS = 5000;
    let gamePingTimer = null;
    let clockTimer = null;
    let onlineGameId = isValidGameId(root.dataset.gameId) ? root.dataset.gameId : null;
    let myRole = null; // 'host' | 'guest' | 'spectator'

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('watch') === '1' && onlineGameId) {
        mode = 'watch';
        isSpectating = true;
    } else if (onlineGameId) {
        mode = 'online';
    }

    // Difficulty radio init
    difficultyRadios.forEach((radio) => {
        if (radio.value === difficulty) {
            radio.checked = true;
        }
        radio.addEventListener('change', (e) => {
            difficulty = e.target.value;
            localStorage.setItem('sudoku_difficulty', difficulty);
            if (mode === 'solo') {
                startNewSoloGame();
            }
        });
    });

    const wsConfig = window.CENTRIFUGO_CONFIG || {
        host: root.dataset.wsHost,
        port: root.dataset.wsPort,
        scheme: root.dataset.wsScheme,
        wsUrl: root.dataset.wsUrl,
    };

    const onlineClient = new OnlineGameClient({
        wsConfig,
        onConnectionChange: (status) => {
            updateConnectionBadge(status);
        },
    });

    const boardView = new SudokuBoardView({
        boardElement,
        announcementElement,
        statusElement,
        progressElement,
        padButtons,
        onCellSelect: (index) => handleCellSelect(index),
    });

    const lobbyView = new LobbyView({
        containerElement: liveGamesList,
        onWatchGame: (gameId) => spectateGame(gameId),
    });

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function updateTimerUI() {
        if (timerElement) {
            timerElement.textContent = formatTime(gameState.elapsedSeconds || 0);
        }
    }

    function stopClock() {
        if (clockTimer !== null) {
            clearInterval(clockTimer);
            clockTimer = null;
        }
    }

    function startClock() {
        stopClock();
        updateTimerUI();
        clockTimer = setInterval(() => {
            if (isSpectating || mode === 'watch' || gameState.status === 'solved') {
                return;
            }
            gameState.elapsedSeconds = (gameState.elapsedSeconds || 0) + 1;
            updateTimerUI();
        }, 1000);
    }

    function persistOnlineSnapshot() {
        if (onlineGameId && (mode === 'online' || isSpectating)) {
            saveOnlineGameSnapshot(onlineGameId, gameState, rematchRequestedBy);
        }
    }

    function setActiveModeTab(activeMode) {
        modeButtons.forEach((btn) => {
            const isActive = btn.dataset.modeBtn === activeMode;
            btn.classList.toggle('mode-tab--active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    function clearHintsForCell(index) {
        for (const [senderId, hint] of hintsBySender.entries()) {
            if (hint.index === index) {
                hintsBySender.delete(senderId);
            }
        }
    }

    function isBroadcastHostOrPlayer() {
        return (mode === 'solo' || mode === 'online') && Boolean(onlineGameId) && !isSpectating;
    }

    function updatePresenceUI() {
        if (!opponentStatus || !spectatorStatus) return;

        if ((mode === 'online' || mode === 'solo') && !isSpectating) {
            if (mode === 'online' && (myRole === 'host' || myRole === 'guest')) {
                const partnerRole = myRole === 'host' ? 'guest' : 'host';
                const partnerOnline = currentMembers.some((m) => m.role === partnerRole);

                opponentStatus.style.display = 'inline-flex';
                opponentStatus.className = `presence-badge ${partnerOnline ? 'presence-badge--online' : 'presence-badge--offline'}`;
                opponentStatus.textContent = partnerOnline ? 'Partner online' : 'Waiting for partner';
            } else {
                opponentStatus.style.display = 'none';
            }

            const spectatorCount = currentMembers.filter((m) => m.role === 'spectator').length;
            if (spectatorCount > 0) {
                spectatorStatus.style.display = 'inline-flex';
                spectatorStatus.textContent = `${spectatorCount} Spectator${spectatorCount === 1 ? '' : 's'}`;
            } else {
                spectatorStatus.style.display = 'none';
            }
            return;
        }

        if (isSpectating) {
            const hostMember = currentMembers.find((m) => m.role === 'host');
            const hostOnline = Boolean(hostMember);
            const guestOnline = currentMembers.some((m) => m.role === 'guest');
            if (hostMember?.game_mode) {
                spectatedGameMode = hostMember.game_mode;
            }

            opponentStatus.style.display = 'inline-flex';
            opponentStatus.className = 'presence-badge';
            if ((hostMember?.game_mode || spectatedGameMode) === 'solo') {
                opponentStatus.textContent = `Solo Player: ${hostOnline ? 'Online' : 'Offline'}`;
            } else {
                opponentStatus.textContent = `Host: ${hostOnline ? 'Online' : 'Offline'} | Partner: ${guestOnline ? 'Online' : 'Offline'}`;
            }

            const spectatorCount = currentMembers.filter((m) => m.role === 'spectator').length;
            spectatorStatus.style.display = 'inline-flex';
            spectatorStatus.textContent = `${spectatorCount} Watching`;
            return;
        }

        opponentStatus.style.display = 'none';
        spectatorStatus.style.display = 'none';
    }

    function updateWatcherHintStatus() {
        if (!watcherHintStatus) return;
        if (selectedIndex === null) {
            watcherHintStatus.textContent = 'Select an empty cell on the board, then suggest a digit or nudge the players:';
            return;
        }
        const { row, col } = getCellCoords(selectedIndex);
        if (gameState.board[selectedIndex] !== 0) {
            watcherHintStatus.textContent = `Row ${row + 1}, Column ${col + 1} is already filled. Select an empty cell to suggest a hint.`;
        } else {
            watcherHintStatus.textContent = `Selected Row ${row + 1}, Column ${col + 1} — choose 1-9 or Nudge to send a hint:`;
        }
    }

    function renderCurrentState() {
        const showHints = mode === 'solo' || mode === 'online' || isSpectating;
        const hintsByCell = showHints ? aggregateHintsByCell(hintsBySender) : new Map();

        boardView.render(gameState, {
            selectedIndex,
            isSpectating,
            mode: isSpectating ? 'watch' : mode,
            hintsByCell,
        });

        updateTimerUI();

        if (showHints) {
            renderSpectatorHintsList(hintsFeed, hintsByCell, {
                canApply: (mode === 'solo' || mode === 'online') && !isSpectating && gameState.status !== 'solved',
                onSelectHint: (idx) => {
                    selectedIndex = idx;
                    renderCurrentState();
                    boardView.focusCell(idx);
                },
                onApplyHint: (idx, digit) => {
                    selectedIndex = idx;
                    applyPlayerDigit(digit);
                },
            });
        } else if (hintsFeed) {
            hintsFeed.style.display = 'none';
        }

        if (notesBtn) {
            notesBtn.classList.toggle('tool-btn--active', notesMode);
            notesBtn.setAttribute('aria-pressed', notesMode ? 'true' : 'false');
            const labelSpan = notesBtn.querySelector('span');
            if (labelSpan) {
                labelSpan.textContent = notesMode ? 'Notes: On' : 'Notes: Off';
            }
        }

        if (undoBtn) {
            undoBtn.disabled = isSpectating || !gameState.history || gameState.history.length === 0 || gameState.status === 'solved';
        }

        if (restartBtn) {
            if (isSpectating || mode === 'watch') {
                restartBtn.style.display = 'none';
            } else if (mode === 'online') {
                restartBtn.style.display = 'inline-flex';
                const partnerOnline = currentMembers.some((m) => m.role !== myRole && (m.role === 'host' || m.role === 'guest'));
                if (!partnerOnline && gameState.status !== 'solved') {
                    restartBtn.textContent = 'New Puzzle';
                    restartBtn.disabled = false;
                } else if (rematchRequestedBy && rematchRequestedBy === myRole) {
                    restartBtn.textContent = 'Waiting for partner...';
                    restartBtn.disabled = true;
                } else if (rematchRequestedBy) {
                    restartBtn.textContent = 'Accept New Puzzle';
                    restartBtn.disabled = false;
                } else {
                    restartBtn.textContent = 'New Puzzle';
                    restartBtn.disabled = false;
                }
            } else {
                restartBtn.style.display = 'inline-flex';
                restartBtn.textContent = 'New Puzzle';
                restartBtn.disabled = false;
            }
        }

        if (isSpectating) {
            updateWatcherHintStatus();
        }
    }

    function handleCellSelect(index) {
        selectedIndex = index;
        renderCurrentState();
    }

    function syncLobbyProgress() {
        if (myRole !== 'host' || !onlineGameId || (mode !== 'solo' && mode !== 'online')) return;
        const guestOnline = currentMembers.some((m) => m.role === 'guest');
        let status = mode === 'solo' ? 'in_progress' : 'waiting';
        if (gameState.status === 'solved') {
            status = 'solved';
        } else if (mode === 'solo' || guestOnline || gameState.filledCount > 0) {
            status = 'in_progress';
        }
        onlineClient.broadcastLobbyUpdate(onlineGameId, status, gameState.filledCount, gameState.difficulty, mode);
    }

    function applyPlayerDigit(digit) {
        if (isSpectating || mode === 'watch' || selectedIndex === null || gameState.status === 'solved') {
            return;
        }
        if (gameState.givens[selectedIndex]) {
            boardView.announce('Given clue cells cannot be changed.');
            return;
        }

        try {
            if (notesMode && digit !== 0) {
                gameState = toggleCellNote(gameState, selectedIndex, digit);
                if (isBroadcastHostOrPlayer()) {
                    onlineClient.broadcastGameEvent(onlineGameId, 'cell-update', {
                        index: selectedIndex,
                        value: null,
                        notes: gameState.notes[selectedIndex],
                    });
                }
            } else {
                gameState = setCellValue(gameState, selectedIndex, digit);
                if (digit !== 0) {
                    clearHintsForCell(selectedIndex);
                }
                if (isBroadcastHostOrPlayer()) {
                    onlineClient.broadcastGameEvent(onlineGameId, 'cell-update', {
                        index: selectedIndex,
                        value: digit,
                        notes: gameState.notes[selectedIndex],
                    });
                    syncLobbyProgress();
                }
            }
            persistOnlineSnapshot();
            renderCurrentState();
        } catch (err) {
            boardView.announce(err.message);
        }
    }

    function handleUndo() {
        if (isSpectating || mode === 'watch' || !gameState.history || gameState.history.length === 0) return;

        const prevBoard = [...gameState.board];
        const prevNotes = gameState.notes.map((n) => [...n]);
        gameState = undoLastMove(gameState);

        if (isBroadcastHostOrPlayer()) {
            for (let i = 0; i < 81; i++) {
                const boardChanged = prevBoard[i] !== gameState.board[i];
                const notesChanged = prevNotes[i].join(',') !== gameState.notes[i].join(',');
                if (boardChanged || notesChanged) {
                    onlineClient.broadcastGameEvent(onlineGameId, 'cell-update', {
                        index: i,
                        value: gameState.board[i],
                        notes: gameState.notes[i],
                    });
                }
            }
            syncLobbyProgress();
        }

        persistOnlineSnapshot();
        renderCurrentState();
    }

    function handleLocalHint() {
        if (isSpectating || mode === 'watch' || gameState.status === 'solved') return;

        let targetIdx = selectedIndex;
        if (
            targetIdx === null
            || gameState.givens[targetIdx]
            || (gameState.board[targetIdx] !== 0 && gameState.board[targetIdx] === gameState.solution[targetIdx])
        ) {
            const candidateIndices = [];
            for (let i = 0; i < 81; i++) {
                if (!gameState.givens[i] && gameState.board[i] !== gameState.solution[i]) {
                    candidateIndices.push(i);
                }
            }
            if (candidateIndices.length === 0) return;
            targetIdx = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
        }

        const correctDigit = gameState.solution[targetIdx];
        if (!correctDigit) return;

        selectedIndex = targetIdx;
        gameState = setCellValue(gameState, targetIdx, correctDigit);
        clearHintsForCell(targetIdx);

        if (isBroadcastHostOrPlayer()) {
            onlineClient.broadcastGameEvent(onlineGameId, 'cell-update', {
                index: targetIdx,
                value: correctDigit,
                notes: [],
            });
            syncLobbyProgress();
        }

        const { row, col } = getCellCoords(targetIdx);
        boardView.announce(`Hint applied: Row ${row + 1}, Column ${col + 1} is ${correctDigit}.`);
        persistOnlineSnapshot();
        renderCurrentState();
    }

    function sendSpectatorHint(value) {
        if (!isSpectating || !onlineGameId || selectedIndex === null) return;
        if (gameState.board[selectedIndex] !== 0) {
            boardView.announce('Select an empty cell to suggest a hint.');
            return;
        }

        const senderId = onlineClient.clientId;
        const existing = hintsBySender.get(senderId);

        if (value === undefined) {
            hintsBySender.delete(senderId);
            onlineClient.sendWhisperEvent('hint', { senderId, index: null, value: null });
            boardView.announce('Hint cleared.');
        } else if (existing && existing.index === selectedIndex && existing.value === value) {
            hintsBySender.delete(senderId);
            onlineClient.sendWhisperEvent('hint', { senderId, index: null, value: null });
            boardView.announce('Hint removed.');
        } else {
            hintsBySender.set(senderId, { senderId, index: selectedIndex, value });
            onlineClient.sendWhisperEvent('hint', { senderId, index: selectedIndex, value });
            const { row, col } = getCellCoords(selectedIndex);
            boardView.announce(value
                ? `Suggested ${value} at Row ${row + 1}, Column ${col + 1}.`
                : `Nudged players to check Row ${row + 1}, Column ${col + 1}.`);
        }

        renderCurrentState();
    }

    function applyRemoteSyncPayload(data) {
        if (!data || !data.gameState) return;
        const hydrated = hydrateGameState(data.gameState);
        if (!hydrated) return;

        gameState = hydrated;
        if (data.rematchRequestedBy !== undefined) {
            rematchRequestedBy = data.rematchRequestedBy;
        }
        if (Array.isArray(data.hints)) {
            hintsBySender.clear();
            data.hints.forEach(([senderId, hint]) => {
                if (senderId && hint) hintsBySender.set(senderId, hint);
            });
        }
        persistOnlineSnapshot();
        renderCurrentState();
        updatePresenceUI();
    }

    function handleRemoteGameEvent(type, data) {
        if (type === 'init' || type === 'sync') {
            applyRemoteSyncPayload(data);
            return;
        }

        if (type === 'cell-update') {
            gameState = applyRemoteCellPatch(gameState, data);
            if (typeof data.value === 'number' && data.value > 0) {
                clearHintsForCell(data.index);
            }
            persistOnlineSnapshot();
            renderCurrentState();
            return;
        }

        if (type === 'hint') {
            if (data && data.senderId) {
                if (data.index === null || data.index === undefined) {
                    hintsBySender.delete(data.senderId);
                } else if (gameState.board[data.index] === 0) {
                    hintsBySender.set(data.senderId, {
                        senderId: data.senderId,
                        index: data.index,
                        value: data.value ?? null,
                    });
                }
                renderCurrentState();
            }
            return;
        }

        if (type === 'reaction') {
            if (data && data.emoji) {
                spawnFloatingEmoji(reactionStage, data.emoji);
            }
            return;
        }

        if (type === 'new-puzzle-request') {
            if (data && (data.role === 'host' || data.role === 'guest')) {
                rematchRequestedBy = data.role;
                persistOnlineSnapshot();
                renderCurrentState();
            }
            return;
        }

        if (type === 'new-puzzle-accept') {
            if (data && data.gameState) {
                const hydrated = hydrateGameState(data.gameState);
                if (hydrated) {
                    gameState = hydrated;
                }
            }
            selectedIndex = null;
            rematchRequestedBy = null;
            hintsBySender.clear();
            persistOnlineSnapshot();
            syncLobbyProgress();
            renderCurrentState();
            boardView.announce('New puzzle started.');
            return;
        }

        if (type === 'ping') {
            if (data && data.gameState) {
                const remoteFilled = data.gameState.board?.filter((c) => c > 0).length || 0;
                const localFilled = gameState.filledCount || 0;
                const remoteInitial = data.gameState.givens?.filter(Boolean).length || 0;
                const localInitial = gameState.givens?.filter(Boolean).length || 0;

                const shouldRecoverHost = myRole === 'host' && localFilled <= localInitial && remoteFilled > localFilled;
                const shouldAdoptRemote = myRole !== 'host' && (
                    remoteFilled !== localFilled
                    || remoteInitial !== localInitial
                    || data.gameState.status !== gameState.status
                    || data.rematchRequestedBy !== rematchRequestedBy
                );

                if (shouldRecoverHost || shouldAdoptRemote) {
                    const hydrated = hydrateGameState(data.gameState);
                    if (hydrated) {
                        gameState = hydrated;
                    }
                    if (data.rematchRequestedBy !== undefined) {
                        rematchRequestedBy = data.rematchRequestedBy;
                    }
                    persistOnlineSnapshot();
                    renderCurrentState();
                }
            }
            updatePresenceUI();
        }
    }

    function stopGamePing() {
        if (gamePingTimer !== null) {
            clearInterval(gamePingTimer);
            gamePingTimer = null;
        }
    }

    function startGamePing() {
        stopGamePing();
        gamePingTimer = setInterval(() => {
            if (!isBroadcastHostOrPlayer()) {
                return;
            }

            onlineClient.sendGamePing({
                role: myRole,
                gameState: serializeGameState(gameState),
                rematchRequestedBy,
                timestamp: Date.now(),
            });

            syncLobbyProgress();
        }, GAME_PING_INTERVAL_MS);
    }

    function enterSpectatorView(gameId, announcementText = null) {
        stopGamePing();
        mode = 'watch';
        isSpectating = true;
        spectatedGameMode = null;
        onlineGameId = gameId;
        myRole = 'spectator';
        selectedIndex = null;

        setActiveModeTab('watch');
        if (watchDirectory) watchDirectory.style.display = 'none';
        if (gamePanel) gamePanel.style.display = 'flex';
        if (spectatorBar) spectatorBar.style.display = 'flex';
        if (watcherInteractions) watcherInteractions.style.display = 'flex';
        if (playerControls) playerControls.style.display = 'none';
        if (onlineControls) onlineControls.style.display = 'none';
        if (difficultyGroup) difficultyGroup.style.display = 'none';
        if (restartBtn) restartBtn.style.display = 'none';

        if (announcementText) {
            boardView.announce(announcementText);
        }
        renderCurrentState();
        updatePresenceUI();
    }

    function handleGamePresenceChange(members) {
        currentMembers = onlineClient.getGameMembers() || members || [];
        updatePresenceUI();

        if (myRole === 'host' && currentMembers.length > 1) {
            onlineClient.broadcastGameEvent(onlineGameId, 'sync', {
                gameState: serializeGameState(gameState),
                rematchRequestedBy,
                hints: Array.from(hintsBySender.entries()),
            });
        }
    }

    function handleGameMemberJoin(member) {
        const authoritativeMembers = onlineClient.getGameMembers();
        if (authoritativeMembers) {
            currentMembers = authoritativeMembers;
        } else if (!currentMembers.some((m) => m.id === member.id)) {
            currentMembers.push(member);
        }
        updatePresenceUI();

        if (myRole === 'host') {
            onlineClient.broadcastGameEvent(onlineGameId, 'sync', {
                gameState: serializeGameState(gameState),
                rematchRequestedBy,
                hints: Array.from(hintsBySender.entries()),
            });
            syncLobbyProgress();
        }
    }

    function handleGameMemberLeave(member) {
        const authoritativeMembers = onlineClient.getGameMembers();
        if (authoritativeMembers) {
            currentMembers = authoritativeMembers;
        } else {
            currentMembers = currentMembers.filter((m) => m.id !== member.id);
        }
        if (member && member.id && hintsBySender.has(member.id)) {
            hintsBySender.delete(member.id);
            renderCurrentState();
        }
        updatePresenceUI();
    }

    function updateConnectionBadge(status) {
        if (!connectionBadge) return;

        if (mode === 'solo' && !isSpectating) {
            if (status === 'connected') {
                connectionBadge.style.display = 'inline-flex';
                connectionBadge.textContent = 'Live Watch Ready';
                connectionBadge.className = 'connection-badge connection-badge--connected';
            } else {
                connectionBadge.style.display = 'none';
            }
            return;
        }

        if (mode !== 'online' && !isSpectating) {
            connectionBadge.style.display = 'none';
            return;
        }

        connectionBadge.style.display = 'inline-flex';
        const labels = {
            connected: 'Connected',
            connecting: 'Connecting...',
            unavailable: 'Offline',
            failed: 'Connection error',
            disconnected: 'Disconnected',
        };

        connectionBadge.textContent = labels[status] || status;
        connectionBadge.className = `connection-badge connection-badge--${status}`;
    }

    function spectateGame(gameId) {
        if (!isValidGameId(gameId)) return;

        currentMembers = [];
        hintsBySender.clear();
        rematchRequestedBy = null;

        enterSpectatorView(gameId, 'Connecting to live Sudoku match...');
        window.history.pushState({}, '', `/games/${gameId}?watch=1`);

        onlineClient.joinGameChannel(gameId, {
            role: 'spectator',
            onEvent: handleRemoteGameEvent,
            onPresenceChange: handleGamePresenceChange,
            onMemberJoin: handleGameMemberJoin,
            onMemberLeave: handleGameMemberLeave,
        });
    }

    function exitSpectating() {
        onlineClient.leaveGameChannel();
        onlineGameId = null;
        isSpectating = false;
        currentMembers = [];
        hintsBySender.clear();
        updatePresenceUI();

        if (spectatorBar) spectatorBar.style.display = 'none';
        if (watcherInteractions) watcherInteractions.style.display = 'none';
        if (hintsFeed) hintsFeed.style.display = 'none';
        if (gamePanel) gamePanel.style.display = 'none';
        if (watchDirectory) watchDirectory.style.display = 'block';

        window.history.pushState({}, '', '/');
        openWatchDirectory();
    }

    function openWatchDirectory() {
        if (gamePanel) gamePanel.style.display = 'none';
        if (watchDirectory) watchDirectory.style.display = 'block';
        if (spectatorBar) spectatorBar.style.display = 'none';
        if (watcherInteractions) watcherInteractions.style.display = 'none';
        if (playerControls) playerControls.style.display = 'none';
        if (hintsFeed) hintsFeed.style.display = 'none';
        if (restartBtn) restartBtn.style.display = 'none';

        onlineClient.joinLobby({
            onLobbyPresenceChange: (members) => {
                activeLobbyMembers = members || [];
                lobbyView.render(activeLobbyMembers);
            },
            onLobbyMemberJoin: (member) => {
                if (!activeLobbyMembers.some((m) => m.id === member.id)) {
                    activeLobbyMembers.push(member);
                }
                lobbyView.render(activeLobbyMembers);
            },
            onLobbyMemberLeave: (member) => {
                activeLobbyMembers = activeLobbyMembers.filter((m) => m.id !== member.id);
                lobbyView.render(activeLobbyMembers);
            },
            onLobbyUpdate: (update) => {
                const member = activeLobbyMembers.find((m) => m.game_id === update.game_id);
                if (member) {
                    member.status = update.status;
                    member.game_mode = update.game_mode || member.game_mode;
                    member.difficulty = update.difficulty;
                    member.filled_count = update.filled_count;
                    lobbyView.render(activeLobbyMembers);
                }
            },
        });
    }

    function startNewSoloGame() {
        const hadExistingSoloRoom = Boolean(onlineGameId) && myRole === 'host';
        if (!hadExistingSoloRoom) {
            onlineGameId = generateGameId();
            currentMembers = [];
        }

        myRole = 'host';
        selectedIndex = null;
        notesMode = false;
        hintsBySender.clear();
        rematchRequestedBy = null;
        gameState = createSudokuGame({ difficulty });

        if (!hadExistingSoloRoom) {
            onlineClient.joinGameChannel(onlineGameId, {
                role: 'host',
                gameMode: 'solo',
                onEvent: handleRemoteGameEvent,
                onPresenceChange: handleGamePresenceChange,
                onMemberJoin: handleGameMemberJoin,
                onMemberLeave: handleGameMemberLeave,
            });

            onlineClient.joinLobby({
                gameId: onlineGameId,
                status: 'in_progress',
                gameMode: 'solo',
                difficulty: gameState.difficulty,
                filledCount: gameState.filledCount,
            });
        } else {
            onlineClient.broadcastGameEvent(onlineGameId, 'new-puzzle-accept', {
                gameState: serializeGameState(gameState),
            });
            syncLobbyProgress();
        }

        startClock();
        startGamePing();
        renderCurrentState();
        updatePresenceUI();
        boardView.announce(`New ${difficulty} Sudoku puzzle ready.`);
    }

    function startNewOnlineGame() {
        onlineGameId = generateGameId();
        myRole = 'host';
        selectedIndex = null;
        notesMode = false;
        hintsBySender.clear();
        rematchRequestedBy = null;
        gameState = createSudokuGame({ difficulty });

        saveParticipantSession(onlineGameId, 'host');
        persistOnlineSnapshot();

        const inviteUrl = `${window.location.origin}/games/${onlineGameId}`;
        window.history.pushState({}, '', `/games/${onlineGameId}`);

        if (inviteUrlInput) {
            inviteUrlInput.value = inviteUrl;
        }

        boardView.announce('Online Sudoku room created. Share the invite link with your partner or spectators.');

        onlineClient.joinGameChannel(onlineGameId, {
            role: 'host',
            gameMode: 'online',
            onEvent: handleRemoteGameEvent,
            onPresenceChange: handleGamePresenceChange,
            onMemberJoin: handleGameMemberJoin,
            onMemberLeave: handleGameMemberLeave,
        });

        onlineClient.joinLobby({
            gameId: onlineGameId,
            status: 'waiting',
            gameMode: 'online',
            difficulty: gameState.difficulty,
            filledCount: gameState.filledCount,
        });

        startClock();
        renderCurrentState();
        updatePresenceUI();
        startGamePing();
    }

    function joinAsOnlinePlayer(role) {
        myRole = role;
        isSpectating = false;

        if (playerControls) playerControls.style.display = 'flex';
        if (difficultyGroup) difficultyGroup.style.display = role === 'host' ? 'flex' : 'none';

        onlineClient.joinGameChannel(onlineGameId, {
            role,
            gameMode: 'online',
            onEvent: handleRemoteGameEvent,
            onPresenceChange: (members) => {
                const resolvedMembers = onlineClient.getGameMembers() || members || [];
                const otherGuestPresent = role === 'guest' && resolvedMembers.some(
                    (m) => m.role === 'guest' && m.id !== onlineClient.clientId,
                );
                if (otherGuestPresent) {
                    enterSpectatorView(onlineGameId, 'Room already has two co-op players. Joined as spectator.');
                    return;
                }
                handleGamePresenceChange(members);
            },
            onMemberJoin: handleGameMemberJoin,
            onMemberLeave: handleGameMemberLeave,
        });

        if (role === 'host') {
            onlineClient.joinLobby({
                gameId: onlineGameId,
                status: gameState.status === 'solved' ? 'solved' : 'in_progress',
                gameMode: 'online',
                difficulty: gameState.difficulty,
                filledCount: gameState.filledCount,
            });
        }

        startClock();
        renderCurrentState();
        updatePresenceUI();
        startGamePing();
    }

    function resumeOnlineGame() {
        const snapshot = loadOnlineGameSnapshot(onlineGameId);
        if (snapshot) {
            gameState = snapshot.gameState;
            rematchRequestedBy = snapshot.rematchRequestedBy;
        }

        if (inviteUrlInput) {
            inviteUrlInput.value = `${window.location.origin}/games/${onlineGameId}`;
        }

        const stored = loadParticipantSession(onlineGameId);
        if (stored) {
            joinAsOnlinePlayer(stored.role);
            return;
        }

        myRole = 'spectator';

        onlineClient.joinGameChannel(onlineGameId, {
            role: 'spectator',
            onEvent: handleRemoteGameEvent,
            onPresenceChange: (members) => {
                currentMembers = onlineClient.getGameMembers() || members || [];
                const hostMember = currentMembers.find((m) => m.role === 'host');
                const hasGuest = currentMembers.some((m) => m.role === 'guest');

                if (hostMember?.game_mode === 'solo') {
                    enterSpectatorView(onlineGameId, 'This is a live Solo match. Joined as spectator.');
                    window.history.replaceState({}, '', `/games/${onlineGameId}?watch=1`);
                    return;
                }

                if (!hasGuest) {
                    saveParticipantSession(onlineGameId, 'guest');
                    joinAsOnlinePlayer('guest');
                } else {
                    enterSpectatorView(onlineGameId, 'Room already has two co-op players. Joined as spectator.');
                    window.history.replaceState({}, '', `/games/${onlineGameId}?watch=1`);
                }
            },
            onMemberJoin: handleGameMemberJoin,
            onMemberLeave: handleGameMemberLeave,
        });

        renderCurrentState();
        updatePresenceUI();
    }

    function switchMode(newMode) {
        if (mode === newMode && !isSpectating) return;

        mode = newMode;
        setActiveModeTab(mode);

        if (onlineControls) {
            onlineControls.style.display = mode === 'online' ? 'block' : 'none';
        }

        if (mode === 'watch') {
            stopGamePing();
            stopClock();
            onlineClient.disconnect();
            onlineGameId = null;
            isSpectating = false;
            currentMembers = [];
            hintsBySender.clear();
            updatePresenceUI();

            if (window.location.pathname.startsWith('/games/')) {
                window.history.pushState({}, '', '/');
            }

            openWatchDirectory();
            return;
        }

        if (gamePanel) gamePanel.style.display = 'flex';
        if (watchDirectory) watchDirectory.style.display = 'none';
        if (spectatorBar) spectatorBar.style.display = 'none';
        if (watcherInteractions) watcherInteractions.style.display = 'none';
        if (playerControls) playerControls.style.display = 'flex';
        if (difficultyGroup) difficultyGroup.style.display = 'flex';
        isSpectating = false;
        hintsBySender.clear();

        if (mode === 'online') {
            stopGamePing();
            onlineClient.disconnect();
            if (!onlineGameId || myRole === 'host') {
                onlineGameId = null;
                startNewOnlineGame();
            } else {
                resumeOnlineGame();
            }
        } else {
            stopGamePing();
            onlineClient.disconnect();
            onlineGameId = null;
            myRole = null;
            currentMembers = [];
            updatePresenceUI();
            if (window.location.pathname.startsWith('/games/')) {
                window.history.pushState({}, '', '/');
            }
            startNewSoloGame();
        }
    }

    function handleNewPuzzleAction() {
        if (mode !== 'online') {
            startNewSoloGame();
            return;
        }

        const partnerOnline = currentMembers.some((m) => m.role !== myRole && (m.role === 'host' || m.role === 'guest'));
        if (!partnerOnline || (rematchRequestedBy && rematchRequestedBy !== myRole)) {
            gameState = createSudokuGame({ difficulty });
            selectedIndex = null;
            notesMode = false;
            rematchRequestedBy = null;
            hintsBySender.clear();
            persistOnlineSnapshot();
            onlineClient.broadcastGameEvent(onlineGameId, 'new-puzzle-accept', {
                gameState: serializeGameState(gameState),
            });
            syncLobbyProgress();
            startClock();
            renderCurrentState();
            boardView.announce('New co-op puzzle started.');
        } else {
            rematchRequestedBy = myRole;
            persistOnlineSnapshot();
            onlineClient.broadcastGameEvent(onlineGameId, 'new-puzzle-request', { role: myRole });
            renderCurrentState();
            boardView.announce('New puzzle requested. Waiting for partner...');
        }
    }

    // Event Listeners
    if (restartBtn) {
        restartBtn.addEventListener('click', () => handleNewPuzzleAction());
    }

    if (undoBtn) {
        undoBtn.addEventListener('click', () => handleUndo());
    }

    if (eraseBtn) {
        eraseBtn.addEventListener('click', () => applyPlayerDigit(0));
    }

    if (notesBtn) {
        notesBtn.addEventListener('click', () => {
            notesMode = !notesMode;
            renderCurrentState();
        });
    }

    if (hintBtn) {
        hintBtn.addEventListener('click', () => handleLocalHint());
    }

    padButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const digit = parseInt(btn.dataset.digit, 10);
            if (!Number.isNaN(digit)) {
                applyPlayerDigit(digit);
            }
        });
    });

    spectatorPadButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const digit = parseInt(btn.dataset.hintDigit, 10);
            if (!Number.isNaN(digit)) {
                sendSpectatorHint(digit);
            }
        });
    });

    if (spectatorNudgeBtn) {
        spectatorNudgeBtn.addEventListener('click', () => sendSpectatorHint(null));
    }

    if (spectatorClearHintBtn) {
        spectatorClearHintBtn.addEventListener('click', () => sendSpectatorHint(undefined));
    }

    if (refreshLiveGamesBtn) {
        refreshLiveGamesBtn.addEventListener('click', () => openWatchDirectory());
    }

    if (exitWatchBtn) {
        exitWatchBtn.addEventListener('click', () => exitSpectating());
    }

    emojiButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.emoji;
            if (!emoji || !onlineGameId) return;

            spawnFloatingEmoji(reactionStage, emoji);
            onlineClient.sendWhisperEvent('reaction', {
                emoji,
                senderId: onlineClient.clientId,
            });
            boardView.announce(`Sent ${emoji} reaction.`);
        });
    });

    modeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            switchMode(btn.dataset.modeBtn);
        });
    });

    if (copyLinkBtn && inviteUrlInput) {
        copyLinkBtn.addEventListener('click', async () => {
            const url = inviteUrlInput.value || window.location.href;
            try {
                if (navigator.share) {
                    await navigator.share({
                        title: 'Sudoku Live Co-op',
                        text: 'Solve this Sudoku puzzle with me!',
                        url,
                    });
                    return;
                }
                await navigator.clipboard.writeText(url);
                if (copyFeedback) {
                    copyFeedback.textContent = 'Link copied to clipboard.';
                    setTimeout(() => {
                        copyFeedback.textContent = '';
                    }, 3000);
                }
            } catch {
                inviteUrlInput.select();
                document.execCommand('copy');
                if (copyFeedback) {
                    copyFeedback.textContent = 'Link copied.';
                    setTimeout(() => {
                        copyFeedback.textContent = '';
                    }, 3000);
                }
            }
        });
    }

    // Keyboard shortcuts & 9x9 arrow navigation
    document.addEventListener('keydown', (e) => {
        if (mode === 'watch' && !isSpectating) return;
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

        if (e.key >= '1' && e.key <= '9') {
            const digit = parseInt(e.key, 10);
            if (isSpectating) {
                sendSpectatorHint(digit);
            } else {
                applyPlayerDigit(digit);
            }
            return;
        }

        if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
            if (isSpectating) {
                sendSpectatorHint(undefined);
            } else {
                applyPlayerDigit(0);
            }
            return;
        }

        if ((e.key === 'n' || e.key === 'N') && !isSpectating) {
            notesMode = !notesMode;
            renderCurrentState();
            return;
        }

        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !isSpectating) {
            e.preventDefault();
            handleUndo();
            return;
        }

        if (selectedIndex === null) return;
        const { row, col } = getCellCoords(selectedIndex);
        let nextIndex = null;

        if (e.key === 'ArrowUp' && row > 0) nextIndex = (row - 1) * 9 + col;
        if (e.key === 'ArrowDown' && row < 8) nextIndex = (row + 1) * 9 + col;
        if (e.key === 'ArrowLeft' && col > 0) nextIndex = row * 9 + (col - 1);
        if (e.key === 'ArrowRight' && col < 8) nextIndex = row * 9 + (col + 1);

        if (nextIndex !== null) {
            e.preventDefault();
            selectedIndex = nextIndex;
            renderCurrentState();
            boardView.focusCell(nextIndex);
        }
    });

    // Initial Boot
    if (onlineControls) {
        onlineControls.style.display = mode === 'online' ? 'block' : 'none';
    }

    if (isSpectating && onlineGameId) {
        spectateGame(onlineGameId);
    } else if (mode === 'online' && onlineGameId) {
        resumeOnlineGame();
    } else if (mode === 'watch') {
        openWatchDirectory();
    } else {
        startNewSoloGame();
    }

    function cleanupConnection() {
        stopGamePing();
        stopClock();
        onlineClient.disconnect();
    }

    window.addEventListener('beforeunload', cleanupConnection);
    window.addEventListener('pagehide', cleanupConnection);
});
