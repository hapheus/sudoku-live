<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tic Tac Toe — Fast, Accessible, Real-Time</title>
    <meta name="description" content="A fast, lightweight, and accessible Tic Tac Toe game supporting local 2-player, AI computer opponent, real-time online multiplayer, and live spectator watch mode.">
    <meta name="theme-color" content="#0b1120">

    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body>
    <div id="tic-tac-toe-app"
         class="app-container"
         data-initial-mode="{{ $mode ?? 'local' }}"
         data-game-id="{{ $gameId ?? '' }}"
         data-reverb-key="{{ config('reverb.apps.apps.0.key', env('REVERB_APP_KEY')) }}"
         data-reverb-host="{{ env('REVERB_HOST', 'localhost') }}"
         data-reverb-port="{{ env('REVERB_PORT', 8080) }}"
         data-reverb-scheme="{{ env('REVERB_SCHEME', 'http') }}">

        <!-- Live Region for Screen Readers (WCAG 2.2 AA) -->
        <div id="game-announcements" class="sr-only" aria-live="polite" aria-atomic="true"></div>

        <header class="app-header">
            <h1 class="app-title">
                <span class="accent-x">Tic</span>
                <span class="accent-o">Tac</span>
                <span class="accent-x">Toe</span>
            </h1>
            <p class="app-subtitle">Mobile-first &amp; accessible gameplay</p>
        </header>

        <!-- Mode Selection Tabs -->
        <nav aria-label="Game Modes">
            <div class="mode-tabs" role="tablist">
                <button type="button"
                        role="tab"
                        id="tab-local"
                        aria-selected="{{ ($mode ?? 'local') === 'local' ? 'true' : 'false' }}"
                        aria-controls="game-panel"
                        class="mode-tab {{ ($mode ?? 'local') === 'local' ? 'mode-tab--active' : '' }}"
                        data-mode-btn="local">
                    👥 Local 2P
                </button>
                <button type="button"
                        role="tab"
                        id="tab-computer"
                        aria-selected="{{ ($mode ?? '') === 'computer' ? 'true' : 'false' }}"
                        aria-controls="game-panel"
                        class="mode-tab {{ ($mode ?? '') === 'computer' ? 'mode-tab--active' : '' }}"
                        data-mode-btn="computer">
                    🤖 vs AI
                </button>
                <button type="button"
                        role="tab"
                        id="tab-online"
                        aria-selected="{{ ($mode ?? '') === 'online' ? 'true' : 'false' }}"
                        aria-controls="game-panel"
                        class="mode-tab {{ ($mode ?? '') === 'online' ? 'mode-tab--active' : '' }}"
                        data-mode-btn="online">
                    🌐 Online
                </button>
                <button type="button"
                        role="tab"
                        id="tab-watch"
                        aria-selected="{{ ($mode ?? '') === 'watch' ? 'true' : 'false' }}"
                        aria-controls="watch-directory"
                        class="mode-tab {{ ($mode ?? '') === 'watch' ? 'mode-tab--active' : '' }}"
                        data-mode-btn="watch">
                    👀 Watch
                </button>
            </div>
        </nav>

        <!-- AI Difficulty Selector -->
        <fieldset id="difficulty-group" class="difficulty-group" style="display: none;">
            <legend>AI Level:</legend>
            <div class="difficulty-options">
                <label class="difficulty-label">
                    <input type="radio" name="ai-difficulty" value="easy">
                    Easy
                </label>
                <label class="difficulty-label">
                    <input type="radio" name="ai-difficulty" value="medium">
                    Medium
                </label>
                <label class="difficulty-label">
                    <input type="radio" name="ai-difficulty" value="hard" checked>
                    Hard (Unbeatable)
                </label>
            </div>
        </fieldset>

        <!-- Online Invite Box (shown in Online mode) -->
        <section id="online-controls" class="online-box" style="display: none;" aria-label="Multiplayer Invitation">
            <span class="online-box__label">Share this invitation link with your opponent:</span>
            <div class="online-box__input-row">
                <input type="text"
                       id="invite-url-input"
                       class="online-box__input"
                       readonly
                       aria-label="Invitation link">
                <button type="button"
                        id="copy-link-btn"
                        class="online-box__btn">
                    Copy Link 📋
                </button>
            </div>
            <div id="copy-feedback" class="online-box__feedback" role="status" aria-live="polite"></div>
        </section>

        <!-- Watch Directory (shown in Watch Mode) -->
        <section id="watch-directory" class="watch-box" style="display: none;" aria-label="Live Games Directory">
            <div class="watch-box__header">
                <h2 class="watch-box__title">Live Online Matches</h2>
                <button type="button" id="refresh-live-games-btn" class="watch-box__refresh-btn">
                    🔄 Refresh
                </button>
            </div>
            <div id="live-games-list" class="live-games-list" role="feed">
                <p class="live-game-card__meta">Loading live games...</p>
            </div>
        </section>

        <!-- Spectator Top Bar (when spectating a game) -->
        <div id="spectator-bar" class="spectator-bar" style="display: none;">
            <span>👁️ <strong>Spectating Live Match</strong></span>
            <button type="button" id="exit-watch-btn" class="spectator-bar__back-btn">
                ← Back to Live Games
            </button>
        </div>

        <!-- Status Banner -->
        <section class="status-banner" aria-label="Game Status">
            <span id="connection-status" class="connection-badge" style="display: none;" aria-live="polite"></span>

            <!-- Real-time Presence Indicators (Opponent Online & Live Spectator Counter) -->
            <div class="presence-indicators" id="presence-indicators">
                <span id="opponent-status" class="presence-badge" style="display: none;" aria-live="polite"></span>
                <span id="spectator-status" class="presence-badge presence-badge--spectators" style="display: none;" aria-live="polite"></span>
            </div>

            <div id="game-status-text" class="status-badge status-badge--active-turn" role="status">
                Loading game...
            </div>
        </section>

        <!-- Main Game Board -->
        <main id="game-panel" class="board-wrapper" role="tabpanel">
            <div id="board" class="board" role="grid" aria-label="Tic Tac Toe board">
                <!-- Row 1 -->
                <div class="board-row" role="row">
                    <button type="button" role="gridcell" class="cell" data-index="0" aria-label="Row 1, Column 1, empty"></button>
                    <button type="button" role="gridcell" class="cell" data-index="1" aria-label="Row 1, Column 2, empty"></button>
                    <button type="button" role="gridcell" class="cell" data-index="2" aria-label="Row 1, Column 3, empty"></button>
                </div>
                <!-- Row 2 -->
                <div class="board-row" role="row">
                    <button type="button" role="gridcell" class="cell" data-index="3" aria-label="Row 2, Column 1, empty"></button>
                    <button type="button" role="gridcell" class="cell" data-index="4" aria-label="Row 2, Column 2, empty"></button>
                    <button type="button" role="gridcell" class="cell" data-index="5" aria-label="Row 2, Column 3, empty"></button>
                </div>
                <!-- Row 3 -->
                <div class="board-row" role="row">
                    <button type="button" role="gridcell" class="cell" data-index="6" aria-label="Row 3, Column 1, empty"></button>
                    <button type="button" role="gridcell" class="cell" data-index="7" aria-label="Row 3, Column 2, empty"></button>
                    <button type="button" role="gridcell" class="cell" data-index="8" aria-label="Row 3, Column 3, empty"></button>
                </div>
            </div>
        </main>

        <!-- Action Controls -->
        <div class="action-controls">
            <button type="button" id="restart-btn" class="btn-primary">
                New Game 🔄
            </button>
        </div>

        <footer class="app-footer">
            <p>Open Source &bull; Self-hosted &bull; Privacy-friendly</p>
        </footer>
    </div>
</body>
</html>
