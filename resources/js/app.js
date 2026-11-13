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

    // Online state
    let onlineGameId = root.dataset.gameId || null;
    let participantToken = null;
    let participantRole = null;
    let participantSymbol = null;

    // Check URL parameters for watch mode or stored tokens
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('watch') === '1' && onlineGameId) {
        mode = 'watch';
        isSpectating = true;
    } else if (onlineGameId) {
        mode = 'online';
        participantToken = sessionStorage.getItem(`ttt_token_${onlineGameId}`);
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
        onStateUpdated: (serverState) => {
            handleServerState(serverState);
        },
        onConnectionChange: (status) => {
            updateConnectionBadge(status);
        },
        onPresenceChange: (members) => {
            currentMembers = members || [];
            updatePresenceUI();
        },
        onMemberJoin: (member) => {
            if (!currentMembers.some((m) => m.id === member.id)) {
                currentMembers.push(member);
            }
            updatePresenceUI();
        },
        onMemberLeave: (member) => {
            currentMembers = currentMembers.filter((m) => m.id !== member.id);
            updatePresenceUI();
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

        if (mode === 'online') {
            // Opponent presence badge
            if (participantRole) {
                const opponentRole = participantRole === 'host' ? 'guest' : 'host';
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

            // Spectators badge
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
            // Player statuses for spectators
            const hostOnline = currentMembers.some((m) => m.role === 'host');
            const guestOnline = currentMembers.some((m) => m.role === 'guest');

            opponentStatus.style.display = 'inline-flex';
            opponentStatus.className = 'presence-badge';
            opponentStatus.textContent = `X: ${hostOnline ? '🟢' : '🔴'} | O: ${guestOnline ? '🟢' : '🔴'}`;

            // Spectator count badge
            const spectatorCount = currentMembers.filter((m) => m.role === 'spectator').length;
            spectatorStatus.style.display = 'inline-flex';
            spectatorStatus.textContent = `👁️ ${spectatorCount} Watching`;
            return;
        }

        // Other modes or directory view
        opponentStatus.style.display = 'none';
        spectatorStatus.style.display = 'none';
    }

    function renderCurrentState() {
        boardView.render(gameState, {
            locked: isLocked || isSpectating,
            yourSymbol: mode === 'online' ? participantSymbol : null,
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
                if (gameState.rematch_requested_by && gameState.rematch_requested_by === participantRole) {
                    restartBtn.textContent = 'Rematch requested...';
                    restartBtn.disabled = true;
                } else if (gameState.rematch_requested_by) {
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

                    // Natural short delay for computer move
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
            if (!participantSymbol || gameState.currentTurn !== participantSymbol) return;

            isLocked = true;
            renderCurrentState();

            try {
                const nextState = await onlineClient.sendMove(
                    onlineGameId,
                    participantToken,
                    index,
                    gameState.version
                );
                handleServerState(nextState);
            } catch (err) {
                boardView.announce(err.message || 'Move failed.');
                try {
                    const fresh = await onlineClient.fetchGameState(onlineGameId, participantToken);
                    handleServerState(fresh);
                } catch {
                    // Ignore
                }
            } finally {
                isLocked = false;
                renderCurrentState();
            }
        }
    }

    function handleServerState(serverState) {
        gameState = {
            board: serverState.board,
            currentTurn: serverState.current_turn,
            status: serverState.status,
            winner: serverState.winner,
            winningIndices: serverState.winning_indices,
            version: serverState.version,
            rematch_requested_by: serverState.rematch_requested_by,
        };

        if (serverState.your_role) {
            participantRole = serverState.your_role;
            participantSymbol = serverState.your_symbol;
        }

        renderCurrentState();
        updatePresenceUI();
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

    function formatTimeAgo(isoString) {
        if (!isoString) return '';
        const diffMs = Date.now() - new Date(isoString).getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'just now';
        if (mins === 1) return '1 min ago';
        return `${mins} mins ago`;
    }

    async function loadLiveGames() {
        if (!liveGamesList) return;
        liveGamesList.innerHTML = '<p class="live-game-card__meta">Loading live games...</p>';

        try {
            const data = await onlineClient.fetchLiveGames();
            const games = Array.isArray(data) ? data : (data.games || []);
            if (!Array.isArray(games) || games.length === 0) {
                liveGamesList.innerHTML = `
                    <div style="text-align: center; padding: 1.5rem 0;">
                        <p class="live-game-card__meta">No live matches right now.</p>
                        <p style="margin-top: 0.5rem; font-size: 0.8125rem; color: var(--color-text-muted);">
                            Start an Online game or click Refresh to check again.
                        </p>
                    </div>
                `;
                return;
            }

            liveGamesList.innerHTML = games.map((game) => {
                const shortId = game.id.slice(0, 8);
                const statusLabel = game.status === 'waiting' ? '⏳ Waiting for Player 2' : '⚔️ In Progress';
                const timeAgo = formatTimeAgo(game.created_at);
                const movesCount = game.move_count ?? game.moves_count ?? 0;

                return `
                    <div class="live-game-card">
                        <div class="live-game-card__info">
                            <span class="live-game-card__title">Game #${shortId}</span>
                            <span class="live-game-card__meta">${statusLabel} &bull; ${movesCount} move${movesCount === 1 ? '' : 's'} &bull; ${timeAgo}</span>
                        </div>
                        <button type="button" class="live-game-card__action-btn" data-watch-id="${game.id}">
                            Watch Live 👁️
                        </button>
                    </div>
                `;
            }).join('');

            liveGamesList.querySelectorAll('[data-watch-id]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const targetId = btn.dataset.watchId;
                    spectateGame(targetId);
                });
            });
        } catch (err) {
            liveGamesList.innerHTML = `<p class="live-game-card__meta" style="color: #f87171;">Failed to load live games: ${err.message}</p>`;
        }
    }

    async function spectateGame(gameId) {
        mode = 'watch';
        isSpectating = true;
        isLocked = true;
        onlineGameId = gameId;
        participantToken = null;
        participantRole = null;
        participantSymbol = null;
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

        try {
            const freshState = await onlineClient.fetchGameState(gameId);
            handleServerState(freshState);
            onlineClient.subscribe(gameId, null);
        } catch (err) {
            boardView.announce(err.message || 'Failed to watch game.');
        } finally {
            renderCurrentState();
            updatePresenceUI();
        }
    }

    function exitSpectating() {
        onlineClient.disconnect();
        onlineGameId = null;
        isSpectating = false;
        currentMembers = [];
        updatePresenceUI();

        if (spectatorBar) spectatorBar.style.display = 'none';
        if (gamePanel) gamePanel.style.display = 'none';
        if (watchDirectory) watchDirectory.style.display = 'block';

        window.history.pushState({}, '', '/');
        loadLiveGames();
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

            if (gamePanel) gamePanel.style.display = 'none';
            if (watchDirectory) watchDirectory.style.display = 'block';
            if (spectatorBar) spectatorBar.style.display = 'none';
            if (restartBtn) restartBtn.style.display = 'none';

            if (window.location.pathname.startsWith('/games/')) {
                window.history.pushState({}, '', '/');
            }

            await loadLiveGames();
            return;
        }

        // Return to standard game panel
        if (gamePanel) gamePanel.style.display = 'flex';
        if (watchDirectory) watchDirectory.style.display = 'none';
        if (spectatorBar) spectatorBar.style.display = 'none';
        isSpectating = false;

        if (mode === 'online') {
            if (!onlineGameId) {
                await startNewOnlineGame();
            } else {
                await resumeOnlineGame();
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

    async function startNewOnlineGame() {
        isLocked = true;
        boardView.announce('Creating online game...');

        try {
            const data = await onlineClient.createGame();
            onlineGameId = data.game_id;
            participantToken = data.participant_token;
            participantRole = data.role;
            participantSymbol = data.symbol;

            sessionStorage.setItem(`ttt_token_${onlineGameId}`, participantToken);
            window.history.pushState({}, '', `/games/${onlineGameId}`);

            if (inviteUrlInput) {
                inviteUrlInput.value = data.invite_url;
            }

            handleServerState(data.state);
            onlineClient.subscribe(onlineGameId, participantToken);
        } catch (err) {
            boardView.announce(err.message || 'Error creating game.');
        } finally {
            isLocked = false;
            renderCurrentState();
        }
    }

    async function resumeOnlineGame() {
        isLocked = true;
        boardView.announce('Joining online game...');

        try {
            const data = await onlineClient.joinGame(onlineGameId, participantToken);
            participantToken = data.participant_token;
            participantRole = data.role;
            participantSymbol = data.symbol;

            sessionStorage.setItem(`ttt_token_${onlineGameId}`, participantToken);

            if (inviteUrlInput) {
                inviteUrlInput.value = window.location.href;
            }

            handleServerState(data.state);
            onlineClient.subscribe(onlineGameId, participantToken);
        } catch (err) {
            boardView.announce(err.message || 'Failed to connect to game.');
        } finally {
            isLocked = false;
            renderCurrentState();
        }
    }

    function restartGame() {
        if (mode === 'online') {
            if (participantToken && onlineGameId) {
                isLocked = true;
                onlineClient.requestRematch(onlineGameId, participantToken)
                    .then((state) => handleServerState(state))
                    .catch((err) => boardView.announce(err.message))
                    .finally(() => {
                        isLocked = false;
                        renderCurrentState();
                    });
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
        refreshLiveGamesBtn.addEventListener('click', () => loadLiveGames());
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
        switchMode('watch');
    } else {
        renderCurrentState();
    }
});
