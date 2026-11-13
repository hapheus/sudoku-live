# Sudoku Live

A fast, accessible, zero-database Sudoku game built with Laravel 13, Native CSS, Vanilla JavaScript, and self-hosted WebSockets via Laravel Reverb & Laravel Echo.

---

## Key Features

- **Calibrated Sudoku Generator & Unique-Solution Solver**:
  - Generates randomized valid 9×9 boards with symmetric clue removal and MRV bitmask backtracking to guarantee a **single unique solution**.
  - Four difficulty presets: **Easy** (38–42 clues, naked-singles solvable), **Medium** (30–34 clues), **Hard** (25–28 clues), and **Expert** (22–25 clues).
- **Accessible & Keyboard-First (Targeting WCAG 2.2 AA)**:
  - Semantic 9×9 `role="grid"` with `Row X, Column Y` coordinate labels, conflict announcements (`aria-invalid`), `aria-live` status updates, arrow-key navigation, digit entry (`1–9`), `Backspace`/`Delete`, `N` for pencil notes, and `Ctrl/Cmd+Z` undo.
- **Three Game Modes**:
  1. **Solo (Live Observable)**: Single-player solving with pencil-mark notes, automatic peer note cleanup, conflict highlighting, undo history, timer, and solver hints. Solo sessions also publish live to `presence-lobby` when Reverb is connected so spectators can watch, suggest hints, and react in real time (while remaining playable offline if Reverb is unavailable).
  2. **Online Co-op**: Real-time collaborative solving over Laravel Reverb & Echo with invite links, presence tracking, shared cell updates/notes, and co-op new-puzzle negotiation. Additional visitors beyond two players automatically join as spectators.
  3. **Watch Live (Spectator Mode)**: Browse active Solo and Co-op rooms in real time via `presence-lobby`, watch live progress (`filled_count/81`), suggest cell hints (`1–9` or nudge) that players can apply with one click, and send floating emoji reactions.
- **100% Database-Free (Zero-DB Architecture)**:
  - All puzzle generation, rules, and board state run in-browser (`sessionStorage` snapshot recovery + 5-second state reconciliation pings), with in-memory Reverb presence channels and a stateless, rate-limited HTTP broadcast relay (`POST /api/games/{gameId}/events`) with `eventId` deduplication.

---

## Technology Stack

- **Backend**: Laravel 13, PHP 8.3+, Laravel Reverb
- **Frontend**: Laravel Blade, Vanilla JavaScript (ES modules), Native CSS, Laravel Echo, Pusher JS, Vite
- **Development**: Nix (`devenv`), `direnv`, Composer, Node.js 20+ & npm, Docker Compose
- **Testing & Quality**: PHPUnit, Vitest, Laravel Pint

---

## Quick Start

```bash
# 1. Install PHP and JavaScript dependencies
composer install
npm install

# 2. Prepare environment (Zero database setup required!)
cp .env.example .env
php artisan key:generate

# 3. Build frontend assets
npm run build

# 4. Start development servers
# Option A: Docker Compose
docker compose up -d

# Option B: devenv
devenv up

# Option C: Manual terminals
php artisan serve --port=8000
php artisan reverb:start --port=8080
```

Open `http://localhost:8000` in your browser.

---

## Multiplayer & Spectator Architecture

```
[Player A (Host)]  -- (Whisper + POST /api/games/{id}/events) --> [Laravel Reverb]
                                                                        |
                                                          (presence-games.{id} / lobby)
                                                                        v
[Player B (Partner)] <-- (Reverb WebSocket + Deduplication) ------ [Presence Channel]
[Spectator Browsers] <-- (Live Sync, Cell Hints & Reactions) ----------+
```

- **State & Sync**: `cell-update`, `sync`, `new-puzzle-request`, and `new-puzzle-accept` events carry unique `eventId` tokens over both client whispers and the validated HTTP relay.
- **Spectator Hints & Reactions**: Spectators select any empty cell on the board to suggest a digit `1–9` or send a nudge via `hint` whispers, or trigger floating emoji reactions (`👏`, `🔥`, `💡`, `😮`, `😂`, `🎉`). Active hints appear as badges on the board and as clickable chips for Solo or co-op players.

---

## Production Deployment (`cf-docker-tunnel-sync`)

The repository includes [compose.prod.yml](compose.prod.yml) for running **Nginx + PHP-FPM (`app`)** and **Laravel Reverb (`reverb`)** in separate containers behind [cf-docker-tunnel-sync](https://github.com/hapheus/cf-docker-tunnel-sync):

```bash
cp .env.prod.example .env
# Set DOMAIN_NAME, APP_KEY (php artisan key:generate --show), and random REVERB_APP_* credentials
docker compose -f compose.prod.yml up -d --build
```

- Web app is labeled for `sudoku.${DOMAIN_NAME}` (port `8000`).
- Reverb WebSockets are labeled for `sudoku-ws.${DOMAIN_NAME}` (port `8080`, served publicly over `wss://` on `443`).
- Internal broadcasts flow directly over the Docker network (`http://reverb:8080`) while browsers connect via `REVERB_PUBLIC_*`.

---

## Running Tests

```bash
# Run PHP backend feature tests (13 tests)
php artisan test

# Run JavaScript Sudoku generator, engine, and UI tests (24 tests)
npm run test

# Run code style checks (Laravel Pint)
./vendor/bin/pint --test
```

---

## License

This project is open-source software licensed under the [MIT License](LICENSE).
