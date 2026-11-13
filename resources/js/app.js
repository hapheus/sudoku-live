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

    // State
    let mode = root.dataset.initialMode || 'local'; // 'local' | 'computer' | 'online'
    let difficulty = localStorage.getItem('ttt_difficulty') || 'hard';
    let gameState = createInitialGameState();
    let isLocked = false;

    // Online state
    let onlineGameId = root.dataset.gameId || null;
    let participantToken = null;
    let participantRole = null;
    let participantSymbol = null;

    // Load stored token for existing game
    if (onlineGameId) {
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
    });

    // Board View
    const boardView = new BoardView({
        boardElement,
        announcementElement,
        statusElement,
        onCellClick: (index) => handleCellClick(index),
    });

    function renderCurrentState() {
        boardView.render(gameState, {
            locked: isLocked,
            yourSymbol: mode === 'online' ? participantSymbol : null,
            mode,
            opponentName: mode === 'online' ? 'Opponent' : 'Computer',
        });

        // Restart / Rematch button text
        if (restartBtn) {
            if (mode === 'online') {
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
        if (isLocked) return;

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
                // Refresh authoritative state on conflict
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
    }

    function updateConnectionBadge(status) {
        if (!connectionBadge) return;

        if (mode !== 'online') {
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

    async function switchMode(newMode) {
        if (mode === newMode && !onlineGameId) return;

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

        if (mode === 'online') {
            if (!onlineGameId) {
                await startNewOnlineGame();
            } else {
                await resumeOnlineGame();
            }
        } else {
            onlineClient.disconnect();
            onlineGameId = null;
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

    if (mode === 'online' && onlineGameId) {
        resumeOnlineGame();
    } else {
        renderCurrentState();
    }
});
