# Sudoku Live

A fast, accessible, zero-backend Sudoku app built with **React 19**, **Vite**, **Capacitor**, Native CSS, and self-hosted real-time WebSockets powered by **Centrifugo v6** (`centrifuge` JS SDK).

---

## Playing

The app opens on Play setup, with grid size and difficulty choices. Select **Play** to start, or **Resume Current Game** to keep existing progress. During a game, **Setup** returns to the setup screen and **New Puzzle** starts a replacement (with confirmation when needed). The fixed bottom navigation provides **Play**, **Watch**, and **Settings**. Settings persist the Light/Dark theme and English/German language choice. Existing direct co-op and spectator links remain supported.

## UI verification

```bash
npm test
npm run build
npm run e2e                 # headless Chromium
npm run e2e:headed          # visible Chromium window
npm run e2e:headed -- --grep "settings change"  # one test
```

Install Chromium for Playwright when needed with `npx playwright install chromium`. Both E2E commands start a local Vite server on port 5178 automatically. Run them sequentially. Headed execution requires a graphical desktop session. Failures retain traces and screenshots under ignored `test-results/`; inspect a trace with `npx playwright show-trace <path-to-trace.zip>`. Visual references live in `tests/qa/baselines/`; review screenshots before updating them with `npm run e2e -- --update-snapshots`. Both modes use the same full Chromium binary (`channel: chromium`) and hide native scrollbar chrome for consistent screenshot geometry; scrolling remains enabled. Only the changing elapsed-time text is masked in screenshot comparisons. See [the QA report](tests/qa/REPORT.md) for verified coverage and limitations.

## Key Features

- **Calibrated Sudoku Generator & Unique-Solution Solver**:
  - Generates randomized valid 9×9 boards with symmetric clue removal and MRV bitmask backtracking to guarantee a **single unique solution**.
  - Four difficulty presets: **Easy** (38–42 clues, naked-singles solvable), **Medium** (30–34 clues), **Hard** (25–28 clues), and **Expert** (22–25 clues).
- **Accessible & Keyboard-First (Targeting WCAG 2.2 AA)**:
  - Semantic 9×9 `role="grid"` with `Row X, Column Y` coordinate labels, conflict announcements (`aria-invalid`), `aria-live` status updates, arrow-key navigation, digit entry (`1–9`), `Backspace`/`Delete`, `N` for pencil notes, and `Ctrl/Cmd+Z` undo.
- **Three Game Modes**:
  1. **Solo (Live Observable)**: Single-player solving with pencil-mark notes, automatic peer note cleanup, conflict highlighting, undo history, timer, and solver hints. Solo sessions publish live to `sudoku:lobby` when Centrifugo is connected so spectators can watch, suggest hints, and react in real time (while remaining 100% playable offline).
  2. **Online Co-op**: Real-time collaborative solving over Centrifugo with invite links, presence announcements, shared cell updates/notes, 300s history recovery on mobile/Capacitor reconnect, and co-op new-puzzle negotiation. Additional visitors beyond two players automatically join as spectators.
  3. **Watch Live (Spectator Mode)**: The Watch tab lists active rooms; direct spectator URLs also let visitors watch a live match, suggest cell hints (`1–9` or nudge) that players can apply with one click, and send floating emoji reactions.
- **100% Serverless & Zero-DB Architecture**:
  - Runs completely in the client (Browser SPA + iOS via Capacitor) with `localStorage` Solo persistence, `sessionStorage` co-op snapshot recovery, and direct WebSocket communication with Centrifugo v6.
- **Multi-App WebSocket Ready**:
  - Centrifugo runs in its own container (`centrifugo/centrifugo:v6`, Apache-2.0) with isolated channel namespaces (`sudoku` and extensible `app` in [docker/centrifugo/config.json](docker/centrifugo/config.json)), ready to serve web browsers or Capacitor iOS apps across multiple projects.

---

## Technology Stack

- **App / UI**: React 19, Vite, Native CSS (with `env(safe-area-inset-*)` iOS safe-area support)
- **Mobile Wrapper (iOS only)**: Capacitor 8 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, [capacitor.config.json](capacitor.config.json), [iOS Specification](docs/ios-spec.md))
- **Real-Time WebSockets**: Centrifugo v6 (`centrifugo/centrifugo:v6`) + `centrifuge` JS SDK
- **Web Hosting Container**: Lightweight `nginx:1.27-alpine` static SPA server with runtime `/env-config.js`
- **Testing**: Vitest + React Testing Library + jsdom

---

## Quick Start (Web & Docker)

```bash
# 1. Install JavaScript dependencies
npm install

# 2. Start Centrifugo + Nginx SPA via Docker Compose
docker compose up -d --build

# Or run Vite dev server locally alongside Centrifugo:
docker compose up -d centrifugo
npm run dev
```

Open `http://localhost:8000` (or Vite dev URL) in your browser. Centrifugo listens on `ws://localhost:8081/connection/websocket`.

---

## Native iOS Build (Capacitor 8 + Xcode)

Android is intentionally not targeted. See [docs/ios-spec.md](docs/ios-spec.md) for the full iOS & `fraha.dev` specification (`dev.fraha.sudokulive`).

```bash
# 1. Build web assets (defaults to wss://sudoku-ws.fraha.dev/connection/websocket in native iOS)
npm run build

# Or override endpoint explicitly before syncing:
VITE_WS_URL=wss://sudoku-ws.fraha.dev/connection/websocket VITE_PUBLIC_APP_URL=https://sudoku.fraha.dev npm run build

# 2. Sync built dist/ assets into the native ios/ Xcode project and open Xcode
npm run cap:sync
npm run cap:open:ios
```

---

## Multiplayer & Spectator Architecture

```
[Player A (Web / iOS)] <-- (WS: sudoku:game.{id} / sudoku:lobby) --> [Centrifugo v6]
                                                                            ^
[Player B (Partner)]   <-- (Presence, Sync, Recovery & Dedup) --------------+
[Spectator Clients]    <-- (Live Board, Cell Hints & Reactions) ------------+
```

- **Zero Backend**: Clients connect directly to Centrifugo (`sudoku` namespace with `presence`, `join_leave`, `history_size: 25`, `history_ttl: "300s"`, `force_recovery: true`, and anonymous client permissions).
- **Room Presence & State**: Participants announce `{ role, game_mode }` via `presence-announce` on subscribe/join, hosts publish room progress to `sudoku:lobby`, and all moves carry unique `eventId` tokens for deduplication.

---

## Production Deployment (`fraha.dev` + `cf-docker-tunnel-sync`)

The repository includes [compose.prod.yml](compose.prod.yml) for running **Nginx Static SPA (`app`)** and **Centrifugo v6 (`centrifugo`)** behind [cf-docker-tunnel-sync](https://github.com/hapheus/cf-docker-tunnel-sync):

```bash
cp .env.prod.example .env
# Defaults to DOMAIN_NAME=fraha.dev
docker compose -f compose.prod.yml up -d --build
```

- Web SPA is labeled for `sudoku.${DOMAIN_NAME:-fraha.dev}` (`https://sudoku.fraha.dev`, port `8000`) and injects runtime `WS_HOST`, `WS_PORT`, `WS_SCHEME`, and `PUBLIC_APP_URL` via `/env-config.js`.
- Centrifugo WebSockets are labeled for `sudoku-ws.${DOMAIN_NAME:-fraha.dev}` (`wss://sudoku-ws.fraha.dev`, port `8080` behind TLS) and allow both `https://sudoku.fraha.dev` and Capacitor iOS origins (`capacitor://localhost`, `https://localhost`, `http://localhost`).

---

## Running Tests

```bash
# Run React component, domain, and Centrifugo client tests
npm run test

# Build production SPA bundle
npm run build
```

---

## License

This project is open-source software licensed under the [MIT License](LICENSE).
