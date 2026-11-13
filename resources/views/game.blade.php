<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sudoku Live — Real-Time Co-op &amp; Spectator Puzzle</title>
    <meta name="description" content="A fast, accessible Sudoku game with calibrated puzzle generation, real-time Centrifugo co-op solving, spectator hints, and live emoji reactions.">
    <meta name="theme-color" content="#0f172a">

    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body>
    <div id="sudoku-app"
         class="app-container"
         data-initial-mode="{{ $mode ?? 'solo' }}"
         data-game-id="{{ $gameId ?? '' }}"
         data-ws-host="{{ config('centrifugo.public_host') ?: 'localhost' }}"
         data-ws-port="{{ config('centrifugo.public_port') ?: 8081 }}"
         data-ws-scheme="{{ config('centrifugo.public_scheme') ?: 'http' }}"
         data-ws-url="{{ config('centrifugo.public_ws_url') ?: '' }}">

        <!-- Live Region for Screen Readers (WCAG 2.2 AA) -->
        <div id="game-announcements" class="sr-only" aria-live="polite" aria-atomic="true"></div>

        <header class="app-header">
            <h1 class="app-title">Sudoku <span class="app-title__accent">Live</span></h1>
            <p class="app-subtitle">Unique-solution puzzles with real-time co-op &amp; spectator hints</p>
        </header>

        <!-- Mode Selection Tabs -->
        <nav aria-label="Game Modes">
            <div class="mode-tabs" role="tablist">
                <button type="button"
                        role="tab"
                        id="tab-solo"
                        aria-selected="{{ ($mode ?? 'solo') === 'solo' ? 'true' : 'false' }}"
                        aria-controls="game-panel"
                        class="mode-tab {{ ($mode ?? 'solo') === 'solo' ? 'mode-tab--active' : '' }}"
                        data-mode-btn="solo">
                    Solo
                </button>
                <button type="button"
                        role="tab"
                        id="tab-online"
                        aria-selected="{{ ($mode ?? '') === 'online' ? 'true' : 'false' }}"
                        aria-controls="game-panel"
                        class="mode-tab {{ ($mode ?? '') === 'online' ? 'mode-tab--active' : '' }}"
                        data-mode-btn="online">
                    Online Co-op
                </button>
                <button type="button"
                        role="tab"
                        id="tab-watch"
                        aria-selected="{{ ($mode ?? '') === 'watch' ? 'true' : 'false' }}"
                        aria-controls="watch-directory"
                        class="mode-tab {{ ($mode ?? '') === 'watch' ? 'mode-tab--active' : '' }}"
                        data-mode-btn="watch">
                    Watch Live
                </button>
            </div>
        </nav>

        <!-- Difficulty Selector -->
        <fieldset id="difficulty-group" class="difficulty-group">
            <legend>Difficulty</legend>
            <div class="difficulty-options">
                <label class="difficulty-label">
                    <input type="radio" name="sudoku-difficulty" value="easy">
                    <span>Easy</span>
                </label>
                <label class="difficulty-label">
                    <input type="radio" name="sudoku-difficulty" value="medium" checked>
                    <span>Medium</span>
                </label>
                <label class="difficulty-label">
                    <input type="radio" name="sudoku-difficulty" value="hard">
                    <span>Hard</span>
                </label>
                <label class="difficulty-label">
                    <input type="radio" name="sudoku-difficulty" value="expert">
                    <span>Expert</span>
                </label>
            </div>
        </fieldset>

        <!-- Online Invite Box (shown in Online Co-op mode) -->
        <section id="online-controls" class="online-box" style="display: none;" aria-label="Multiplayer Invitation">
            <span class="online-box__label">Invite a co-op partner or spectators with this link:</span>
            <div class="online-box__input-row">
                <input type="text"
                       id="invite-url-input"
                       class="online-box__input"
                       readonly
                       aria-label="Invitation link">
                <button type="button"
                        id="copy-link-btn"
                        class="online-box__btn">
                    Copy Link
                </button>
            </div>
            <div id="copy-feedback" class="online-box__feedback" role="status" aria-live="polite"></div>
        </section>

        <!-- Watch Directory (shown in Watch Mode) -->
        <section id="watch-directory" class="watch-box" style="display: none;" aria-label="Live Games Directory">
            <div class="watch-box__header">
                <h2 class="watch-box__title">Live Sudoku Matches</h2>
                <button type="button" id="refresh-live-games-btn" class="watch-box__refresh-btn">
                    Refresh
                </button>
            </div>
            <div id="live-games-list" class="live-games-list" role="feed">
                <p class="live-game-card__meta">Loading live matches...</p>
            </div>
        </section>

        <!-- Spectator Top Bar (when spectating a game) -->
        <div id="spectator-bar" class="spectator-bar" style="display: none;">
            <span><strong>Spectating Live Match</strong> — Read-only board</span>
            <button type="button" id="exit-watch-btn" class="spectator-bar__back-btn">
                Back to Lobby
            </button>
        </div>

        <!-- Status & Telemetry Bar -->
        <section class="status-banner" aria-label="Game Status">
            <div class="status-meta-row">
                <span id="connection-status" class="connection-badge" style="display: none;" aria-live="polite"></span>
                <span id="opponent-status" class="presence-badge" style="display: none;" aria-live="polite"></span>
                <span id="spectator-status" class="presence-badge presence-badge--spectators" style="display: none;" aria-live="polite"></span>
            </div>

            <div class="status-primary-row">
                <div id="game-status-text" class="status-badge status-badge--active-turn" role="status">
                    Generating puzzle...
                </div>
                <div class="telemetry-pills">
                    <span id="sudoku-progress" class="telemetry-pill" aria-label="Filled cells">0/81</span>
                    <span id="sudoku-timer" class="telemetry-pill" aria-label="Elapsed time">00:00</span>
                </div>
            </div>
        </section>

        <!-- Main Sudoku Board -->
        <main id="game-panel" class="board-wrapper" role="tabpanel">
            <div id="reaction-stage" class="reaction-stage" aria-live="polite" aria-atomic="false"></div>
            <div id="sudoku-board" class="sudoku-board" role="grid" aria-label="9 by 9 Sudoku grid"></div>
        </main>

        <!-- Active Spectator Hints Feed (Visible to both Players & Spectators) -->
        <section id="spectator-hints-feed" class="hints-feed" style="display: none;" aria-label="Spectator Hints"></section>

        <!-- Player Controls (hidden in Spectator mode) -->
        <section id="player-controls" class="player-controls" aria-label="Puzzle Controls">
            <div class="tool-bar" role="toolbar" aria-label="Cell tools">
                <button type="button" id="undo-btn" class="tool-btn">
                    <svg class="tool-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>
                    </svg>
                    <span>Undo</span>
                </button>
                <button type="button" id="erase-btn" class="tool-btn">
                    <svg class="tool-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M20 20H7L3 16a1 1 0 0 1 0-1.41l9.59-9.59a2 2 0 0 1 2.82 0l5.18 5.18a2 2 0 0 1 0 2.82L13.41 20"/>
                    </svg>
                    <span>Erase</span>
                </button>
                <button type="button" id="notes-btn" class="tool-btn" aria-pressed="false">
                    <svg class="tool-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                    </svg>
                    <span>Notes: Off</span>
                </button>
                <button type="button" id="hint-btn" class="tool-btn">
                    <svg class="tool-btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/>
                    </svg>
                    <span>Hint</span>
                </button>
            </div>

            <div class="numpad" role="group" aria-label="Number pad 1 to 9">
                @for ($d = 1; $d <= 9; $d++)
                    <button type="button" class="numpad-btn" data-digit="{{ $d }}" aria-label="Enter {{ $d }}">
                        <span class="numpad-btn__digit">{{ $d }}</span>
                        <span class="numpad-btn__count" aria-hidden="true">9</span>
                    </button>
                @endfor
            </div>
        </section>

        <!-- Watcher Interactions (Spectator Hints & Emoji Reactions) -->
        <section id="watcher-interactions" class="watcher-interactions" style="display: none;" aria-label="Spectator Interactions">
            <p id="watcher-hint-status" class="watcher-interactions__hint">
                Select an empty cell on the board, then suggest a digit or nudge the players:
            </p>

            <div class="spectator-pad" role="group" aria-label="Suggest a digit hint">
                @for ($d = 1; $d <= 9; $d++)
                    <button type="button" class="spectator-pad__btn" data-hint-digit="{{ $d }}" aria-label="Suggest digit {{ $d }}">
                        {{ $d }}
                    </button>
                @endfor
                <button type="button" id="spectator-nudge-btn" class="spectator-pad__action">Nudge</button>
                <button type="button" id="spectator-clear-hint-btn" class="spectator-pad__action spectator-pad__action--muted">Clear</button>
            </div>

            <div class="emoji-bar" role="group" aria-label="Send emoji reaction">
                <button type="button" class="emoji-btn" data-emoji="👏" aria-label="Send applause reaction">👏</button>
                <button type="button" class="emoji-btn" data-emoji="🔥" aria-label="Send fire reaction">🔥</button>
                <button type="button" class="emoji-btn" data-emoji="💡" aria-label="Send lightbulb reaction">💡</button>
                <button type="button" class="emoji-btn" data-emoji="😮" aria-label="Send surprised reaction">😮</button>
                <button type="button" class="emoji-btn" data-emoji="😂" aria-label="Send laugh reaction">😂</button>
                <button type="button" class="emoji-btn" data-emoji="🎉" aria-label="Send celebration reaction">🎉</button>
            </div>
        </section>

        <!-- Action Controls -->
        <div class="action-controls">
            <button type="button" id="restart-btn" class="btn-primary">
                New Puzzle
            </button>
        </div>

        <footer class="app-footer">
            <p>Zero-DB Real-Time Sudoku &bull; Powered by Laravel &amp; Centrifugo</p>
        </footer>
    </div>
</body>
</html>
