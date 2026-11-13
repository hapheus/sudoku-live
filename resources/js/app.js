import { createInitialGameState, makeMove } from './domain/game-engine.js';
import { selectAiMove } from './domain/ai.js';
import { BoardView } from './ui/board-view.js';
import { OnlineGameClient } from './services/online-game-client.js';

document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('tic-tac-toe-app');
    if (!root) return;

    // Elements
    const boardElement = document.getElementById('board');
    const announcementElement = document.getElementById('game-announcements');
    const statusElement = document.getElementById('game-status-text');
    const restartBtn = document.getElementById('restart-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const copyFeedback = document.getElementById('copy-feedback');
    const connectionBadge = document.getElementById('connection-status');
    const onlineControls = document.getElementById('online-controls');
    const inviteUrlInput = document.getElementById('invite-url-input');
    const difficultyGroup = document.getElementById('difficulty-group');
    const modeButtons = document.querySelectorAll('[data-mode-btn]');
    const difficultyRadios = document.querySelectorAll('input[name="ai-difficulty"]');

    // Watch Mode & Presence Elements
    const watchDirectory = document.getElementById('watch-directory');
    const liveGamesList = document.getElementById('live-games-list');
    const refreshLiveGamesBtn = document.getElementById('refresh-live-games-btn');
    const spectatorBar = document.getElementById('spectator-bar');
    const exitWatchBtn = document.getElementById('exit-watch-btn');
    const gamePanel = document.getElementById('game-panel');
    const opponentStatus = document.getElementById('opponent-status');
    const spectatorStatus = document.getElementById('spectator-status');

    // State
    let mode = root.dataset.initialMode || 'local'; // 'local' | 'computer' | 'online' | 'watch'
    let difficulty = localStorage.getItem('ttt_difficulty') || 'hard';
    let gameState = createInitialGameState();
    let isLocked = false;
    let isSpectating = false;
    let currentMembers = [];
    let activeLobbyMembers = [];
    let rematchRequestedBy = null;

    // Online state (pure in-browser)
    let onlineGameId = root.dataset.gameId || null;
    let myRole = null; // 'host' | 'guest' | 'spectator'
    let mySymbol = null; // 'X' | 'O' | null

    // Check URL parameters for watch mode
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('watch') === '1' && onlineGameId) {
        mode = 'watch';
        isSpectating = true;
    } else if (onlineGameId) {
        mode = 'online';
    }

    // Initialize radio difficulty
    difficultyRadios.forEach((radio) => {
        if (radio.value === difficulty) {
            radio.checked = true;
        }
        radio.addEventListener('change', (e) => {
            difficulty = e.target.value;
            localStorage.setItem('ttt_difficulty', difficulty);
            if (mode === 'computer') {
                restartGame();
            }
        });
    });

    // Reverb Config from meta or window
    const reverbConfig = window.REVERB_CONFIG || {
        key: root.dataset.reverbKey,
        host: root.dataset.reverbHost,
        port: root.dataset.reverbPort,
        scheme: root.dataset.reverbScheme,
    };

    const onlineClient = new OnlineGameClient({
        reverbConfig,
        onConnectionChange: (status) => {
            updateConnectionBadge(status);
        },
    });

    // Board View
    const boardView = new BoardView({
        boardElement,
        announcementElement,
        statusElement,
        onCellClick: (index) => handleCellClick(index),
    });

    function updatePresenceUI() {
        if (!opponentStatus || !spectatorStatus) return;

        if (mode === 'online' && !isSpectating) {
            if (myRole) {
                const opponentRole = myRole === 'host' ? 'guest' : 'host';
                const opponentOnline = currentMembers.some((m) => m.role === opponentRole);

                opponentStatus.style.display = 'inline-flex';
                if (opponentOnline) {
                    opponentStatus.className = 'presence-badge presence-badge--online';
                    opponentStatus.textContent = '🟢 Opponent online';
                } else {
                    opponentStatus.className = 'presence-badge presence-badge--offline';
                    opponentStatus.textContent = '🔴 Opponent offline';
                }
            } else {
                opponentStatus.style.display = 'none';
            }

            const spectatorCount = currentMembers.filter((m) => m.role === 'spectator').length;
            if (spectatorCount > 0) {
                spectatorStatus.style.display = 'inline-flex';
                spectatorStatus.textContent = `👁️ ${spectatorCount} Spectator${spectatorCount === 1 ? '' : 's'}`;
            } else {
                spectatorStatus.style.display = 'none';
            }
            return;
        }

        if (isSpectating) {
            const hostOnline = currentMembers.some((m) => m.role === 'host');
            const guestOnline = currentMembers.some((m) => m.role === 'guest');

            opponentStatus.style.display = 'inline-flex';
            opponentStatus.className = 'presence-badge';
            opponentStatus.textContent = `X: ${hostOnline ? '🟢' : '🔴'} | O: ${guestOnline ? '🟢' : '🔴'}`;

            const spectatorCount = currentMembers.filter((m) => m.role === 'spectator').length;
            spectatorStatus.style.display = 'inline-flex';
            spectatorStatus.textContent = `👁️ ${spectatorCount} Watching`;
            return;
        }

        opponentStatus.style.display = 'none';
        spectatorStatus.style.display = 'none';
    }

    function renderCurrentState() {
        boardView.render(gameState, {
            locked: isLocked || isSpectating,
            yourSymbol: mode === 'online' ? mySymbol : null,
            mode: isSpectating ? 'watch' : mode,
            opponentName: mode === 'online' ? 'Opponent' : 'Computer',
        });

        // Restart / Rematch button
        if (restartBtn) {
            if (isSpectating || mode === 'watch') {
                restartBtn.style.display = 'none';
            } else if (mode === 'online') {
                const isFinished = gameState.status === 'won' || gameState.status === 'draw';
                restartBtn.style.display = isFinished ? 'inline-flex' : 'none';
                if (rematchRequestedBy && rematchRequestedBy === mySymbol) {
                    restartBtn.textContent = 'Rematch requested...';
                    restartBtn.disabled = true;
                } else if (rematchRequestedBy) {
                    restartBtn.textContent = 'Accept Rematch 🤝';
                    restartBtn.disabled = false;
                } else {
                    restartBtn.textContent = 'Request Rematch 🔄';
                    restartBtn.disabled = false;
                }
            } else {
                restartBtn.style.display = 'inline-flex';
                restartBtn.textContent = 'New Game 🔄';
                restartBtn.disabled = false;
            }
        }
    }

    function handleRemoteGameEvent(type, data) {
        if (type === 'init' || type === 'sync') {
            if (data && data.gameState) {
                gameState = data.gameState;
                if (data.guestId && data.guestId === onlineClient.clientId && myRole !== 'host') {
                    myRole = 'guest';
                    mySymbol = 'O';
                }
                renderCurrentState();
                updatePresenceUI();
            }
            return;
        }

        if (type === 'move') {
            const { index, symbol } = data;
            try {
                gameState = makeMove(gameState, index, symbol);
            } catch {
                // Ignore illegal move attempts
            }
            renderCurrentState();
            return;
        }

        if (type === 'rematch-request') {
            rematchRequestedBy = data.symbol;
            renderCurrentState();
            return;
        }

        if (type === 'rematch-accept') {
            gameState = createInitialGameState();
            rematchRequestedBy = null;
            renderCurrentState();
            boardView.announce('Rematch started. Player X plays first.');
        }
    }

    function handleGamePresenceChange(members) {
        currentMembers = members || [];
        updatePresenceUI();

        // If Host: sync state to any newcomers
        if (myRole === 'host' && currentMembers.length > 1) {
            onlineClient.broadcastGameEvent(onlineGameId, 'sync', { gameState });
        }
    }

    function handleGameMemberJoin(member) {
        if (!currentMembers.some((m) => m.id === member.id)) {
            currentMembers.push(member);
        }
        updatePresenceUI();

        // If Host: send current state to newly joined member
        if (myRole === 'host') {
            onlineClient.broadcastGameEvent(onlineGameId, 'sync', {
                gameState,
                guestId: member.role === 'guest' ? member.id : null,
            });

            // Update lobby status
            const movesCount = gameState.board.filter((c) => c !== null).length;
            onlineClient.broadcastLobbyUpdate(onlineGameId, 'in_progress', movesCount);
        }
    }

    function handleGameMemberLeave(member) {
        currentMembers = currentMembers.filter((m) => m.id !== member.id);
        updatePresenceUI();
    }

    async function handleCellClick(index) {
        if (isLocked || isSpectating) return;

        if (mode === 'local') {
            try {
                gameState = makeMove(gameState, index);
                renderCurrentState();
            } catch (err) {
                boardView.announce(err.message);
            }
            return;
        }

        if (mode === 'computer') {
            if (gameState.currentTurn !== 'X') return;

            try {
                gameState = makeMove(gameState, index, 'X');
                renderCurrentState();

                if (gameState.status === 'in_progress') {
                    isLocked = true;
                    renderCurrentState();

                    setTimeout(() => {
                        try {
                            const aiMove = selectAiMove(gameState.board, 'O', difficulty);
                            gameState = makeMove(gameState, aiMove, 'O');
                        } catch (e) {
                            boardView.announce(e.message);
                        } finally {
                            isLocked = false;
                            renderCurrentState();
                        }
                    }, 350);
                }
            } catch (err) {
                boardView.announce(err.message);
            }
            return;
        }

        if (mode === 'online') {
            if (!mySymbol || gameState.currentTurn !== mySymbol) return;

            try {
                gameState = makeMove(gameState, index, mySymbol);
                renderCurrentState();

                // Broadcast move peer-to-peer over WebSocket
                onlineClient.broadcastGameEvent(onlineGameId, 'move', {
                    index,
                    symbol: mySymbol,
                });

                // Update lobby moves count
                if (myRole === 'host') {
                    const movesCount = gameState.board.filter((c) => c !== null).length;
                    const status = gameState.status === 'in_progress' ? 'in_progress' : 'finished';
                    onlineClient.broadcastLobbyUpdate(onlineGameId, status, movesCount);
                }
            } catch (err) {
                boardView.announce(err.message || 'Invalid move.');
            }
        }
    }

    function updateConnectionBadge(status) {
        if (!connectionBadge) return;

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

    function renderLobbyList(members) {
        if (!liveGamesList) return;

        const liveGames = (members || []).filter((m) => m.game_id && m.status !== 'finished');

        if (liveGames.length === 0) {
            liveGamesList.innerHTML = `
                <div style="text-align: center; padding: 1.5rem 0;">
                    <p class="live-game-card__meta">No live matches right now.</p>
                    <p style="margin-top: 0.5rem; font-size: 0.8125rem; color: var(--color-text-muted);">
                        When players open an Online game, it will appear here in real time.
                    </p>
                </div>
            `;
            return;
        }

        liveGamesList.innerHTML = liveGames.map((game) => {
            const shortId = game.game_id.slice(0, 8);
            const statusLabel = game.status === 'waiting' ? '⏳ Waiting for Player 2' : '⚔️ In Progress';
            const movesCount = parseInt(game.moves_count || 0, 10);

            return `
                <div class="live-game-card">
                    <div class="live-game-card__info">
                        <span class="live-game-card__title">Game #${shortId}</span>
                        <span class="live-game-card__meta">${statusLabel} &bull; ${movesCount} move${movesCount === 1 ? '' : 's'}</span>
                    </div>
                    <button type="button" class="live-game-card__action-btn" data-watch-id="${game.game_id}">
                        Watch Live 👁️
                    </button>
                </div>
            `;
        }).join('');

        liveGamesList.querySelectorAll('[data-watch-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                spectateGame(btn.dataset.watchId);
            });
        });
    }

    function spectateGame(gameId) {
        mode = 'watch';
        isSpectating = true;
        isLocked = true;
        onlineGameId = gameId;
        myRole = 'spectator';
        mySymbol = null;
        currentMembers = [];

        modeButtons.forEach((btn) => {
            const isActive = btn.dataset.modeBtn === 'watch';
            btn.classList.toggle('mode-tab--active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        if (watchDirectory) watchDirectory.style.display = 'none';
        if (gamePanel) gamePanel.style.display = 'flex';
        if (spectatorBar) spectatorBar.style.display = 'flex';
        if (onlineControls) onlineControls.style.display = 'none';
        if (difficultyGroup) difficultyGroup.style.display = 'none';
        if (restartBtn) restartBtn.style.display = 'none';

        window.history.pushState({}, '', `/games/${gameId}?watch=1`);
        boardView.announce('Connecting to live game...');

        onlineClient.joinGameChannel(gameId, {
            role: 'spectator',
            symbol: null,
            onEvent: handleRemoteGameEvent,
            onPresenceChange: handleGamePresenceChange,
            onMemberJoin: handleGameMemberJoin,
            onMemberLeave: handleGameMemberLeave,
        });

        renderCurrentState();
        updatePresenceUI();
    }

    function exitSpectating() {
        onlineClient.leaveGameChannel();
        onlineGameId = null;
        isSpectating = false;
        currentMembers = [];
        updatePresenceUI();

        if (spectatorBar) spectatorBar.style.display = 'none';
        if (gamePanel) gamePanel.style.display = 'none';
        if (watchDirectory) watchDirectory.style.display = 'block';

        window.history.pushState({}, '', '/');
        openWatchDirectory();
    }

    function openWatchDirectory() {
        if (gamePanel) gamePanel.style.display = 'none';
        if (watchDirectory) watchDirectory.style.display = 'block';
        if (spectatorBar) spectatorBar.style.display = 'none';
        if (restartBtn) restartBtn.style.display = 'none';

        onlineClient.joinLobby({
            onLobbyPresenceChange: (members) => {
                activeLobbyMembers = members || [];
                renderLobbyList(activeLobbyMembers);
            },
            onLobbyMemberJoin: (member) => {
                if (!activeLobbyMembers.some((m) => m.id === member.id)) {
                    activeLobbyMembers.push(member);
                }
                renderLobbyList(activeLobbyMembers);
            },
            onLobbyMemberLeave: (member) => {
                activeLobbyMembers = activeLobbyMembers.filter((m) => m.id !== member.id);
                renderLobbyList(activeLobbyMembers);
            },
            onLobbyUpdate: (update) => {
                const member = activeLobbyMembers.find((m) => m.game_id === update.game_id);
                if (member) {
                    member.status = update.status;
                    member.moves_count = update.moves_count;
                    renderLobbyList(activeLobbyMembers);
                }
            },
        });
    }

    async function switchMode(newMode) {
        if (mode === newMode && !onlineGameId && !isSpectating) return;

        mode = newMode;
        modeButtons.forEach((btn) => {
            const isActive = btn.dataset.modeBtn === mode;
            btn.classList.toggle('mode-tab--active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        if (difficultyGroup) {
            difficultyGroup.style.display = mode === 'computer' ? 'flex' : 'none';
        }

        if (onlineControls) {
            onlineControls.style.display = mode === 'online' ? 'block' : 'none';
        }

        if (mode === 'watch') {
            onlineClient.disconnect();
            onlineGameId = null;
            isSpectating = false;
            currentMembers = [];
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
        isSpectating = false;

        if (mode === 'online') {
            if (!onlineGameId) {
                startNewOnlineGame();
            } else {
                resumeOnlineGame();
            }
        } else {
            onlineClient.disconnect();
            onlineGameId = null;
            currentMembers = [];
            updatePresenceUI();
            if (window.location.pathname.startsWith('/games/')) {
                window.history.pushState({}, '', '/');
            }
            restartGame();
        }
    }

    function startNewOnlineGame() {
        isLocked = false;
        onlineGameId = Math.random().toString(36).substring(2, 10);
        myRole = 'host';
        mySymbol = 'X';
        gameState = createInitialGameState();
        rematchRequestedBy = null;

        sessionStorage.setItem(`ttt_role_${onlineGameId}`, 'host');
        sessionStorage.setItem(`ttt_symbol_${onlineGameId}`, 'X');

        const inviteUrl = `${window.location.origin}/games/${onlineGameId}`;
        window.history.pushState({}, '', `/games/${onlineGameId}`);

        if (inviteUrlInput) {
            inviteUrlInput.value = inviteUrl;
        }

        boardView.announce('Online game created. Share the invite link with your opponent.');

        onlineClient.joinGameChannel(onlineGameId, {
            role: 'host',
            symbol: 'X',
            onEvent: handleRemoteGameEvent,
            onPresenceChange: handleGamePresenceChange,
            onMemberJoin: handleGameMemberJoin,
            onMemberLeave: handleGameMemberLeave,
        });

        // Also announce in lobby so spectators can watch
        onlineClient.joinLobby({
            gameId: onlineGameId,
            status: 'waiting',
            movesCount: 0,
        });

        renderCurrentState();
        updatePresenceUI();
    }

    function resumeOnlineGame() {
        const storedRole = sessionStorage.getItem(`ttt_role_${onlineGameId}`);
        const storedSymbol = sessionStorage.getItem(`ttt_symbol_${onlineGameId}`);

        if (storedRole) {
            myRole = storedRole;
            mySymbol = storedSymbol;
        } else {
            // Join as Guest (Player O)
            myRole = 'guest';
            mySymbol = 'O';
            sessionStorage.setItem(`ttt_role_${onlineGameId}`, 'guest');
            sessionStorage.setItem(`ttt_symbol_${onlineGameId}`, 'O');
        }

        if (inviteUrlInput) {
            inviteUrlInput.value = `${window.location.origin}/games/${onlineGameId}`;
        }

        onlineClient.joinGameChannel(onlineGameId, {
            role: myRole,
            symbol: mySymbol,
            onEvent: handleRemoteGameEvent,
            onPresenceChange: handleGamePresenceChange,
            onMemberJoin: handleGameMemberJoin,
            onMemberLeave: handleGameMemberLeave,
        });

        renderCurrentState();
        updatePresenceUI();
    }

    function restartGame() {
        if (mode === 'online') {
            if (rematchRequestedBy && rematchRequestedBy !== mySymbol) {
                // Accept rematch
                gameState = createInitialGameState();
                rematchRequestedBy = null;
                onlineClient.broadcastGameEvent(onlineGameId, 'rematch-accept', {});
                renderCurrentState();
                boardView.announce('Rematch accepted. Player X plays first.');
            } else {
                // Request rematch
                rematchRequestedBy = mySymbol;
                onlineClient.broadcastGameEvent(onlineGameId, 'rematch-request', { symbol: mySymbol });
                renderCurrentState();
                boardView.announce('Rematch requested. Waiting for opponent...');
            }
            return;
        }

        gameState = createInitialGameState();
        isLocked = false;
        renderCurrentState();
        boardView.announce('New game started. Player X plays first.');
    }

    // Event listeners
    if (restartBtn) {
        restartBtn.addEventListener('click', () => restartGame());
    }

    if (refreshLiveGamesBtn) {
        refreshLiveGamesBtn.addEventListener('click', () => openWatchDirectory());
    }

    if (exitWatchBtn) {
        exitWatchBtn.addEventListener('click', () => exitSpectating());
    }

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
                        title: 'Play Tic Tac Toe',
                        text: 'Join my Tic Tac Toe game!',
                        url,
                    });
                    return;
                }
                await navigator.clipboard.writeText(url);
                if (copyFeedback) {
                    copyFeedback.textContent = 'Copied to clipboard! 📋';
                    setTimeout(() => {
                        copyFeedback.textContent = '';
                    }, 3000);
                }
            } catch {
                inviteUrlInput.select();
                document.execCommand('copy');
                if (copyFeedback) {
                    copyFeedback.textContent = 'Copied!';
                    setTimeout(() => {
                        copyFeedback.textContent = '';
                    }, 3000);
                }
            }
        });
    }

    // Initial setup
    if (difficultyGroup) {
        difficultyGroup.style.display = mode === 'computer' ? 'flex' : 'none';
    }
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
        renderCurrentState();
    }
});
