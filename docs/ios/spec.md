# Sudoku Live — iOS & `fraha.dev` Technical Specification

**Product**: Sudoku Live (iOS Native Shell via Capacitor 8)  
**Primary Domain**: `fraha.dev` (`https://sudoku.fraha.dev` / `wss://sudoku-ws.fraha.dev/connection/websocket`)  
**iOS Bundle Identifier**: `dev.fraha.sudoku`  
**Minimum OS Target**: iOS 15.0 (iPhone & iPad, Swift Package Manager)

---

## 1. Strategic Context & Boundaries

### Problem Statement & Core Value
Sudoku Live delivers a zero-backend, real-time 9×9 Sudoku experience for iOS devices by packaging the framework-agnostic puzzle domain and React 19 SPA inside a dedicated Capacitor 8 iOS native shell (`ios/`). Players can solve puzzles offline in **Solo** mode, collaborate synchronously with a partner in **Online Co-op** via shareable `https://sudoku.fraha.dev/games/{gameId}` links, or spectate active rooms and send cell hints/reactions in **Watch Live** mode — backed by self-hosted **Centrifugo v6** WebSockets at `wss://sudoku-ws.fraha.dev/connection/websocket`.

### In-Scope
- **Native iOS Target (`ios/`)**: Capacitor 8 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`) using Swift Package Manager (`ios/App/CapApp-SPM/Package.swift`), Xcode scheme `App`, and Bundle ID `dev.fraha.sudoku`.
- **Production Endpoints (`fraha.dev`)**:
  - Public Web / Share URL: `https://sudoku.fraha.dev`
  - Public WebSocket Endpoint: `wss://sudoku-ws.fraha.dev/connection/websocket`
  - Allowed WebSocket Origins on Centrifugo: `https://sudoku.fraha.dev`, `capacitor://localhost`, `https://localhost`, `http://localhost`
- **iOS Viewport & Input Ergonomics**: `viewport-fit=cover`, `env(safe-area-inset-*)` padding, `ios.contentInset: "never"`, `ios.preferredContentMode: "mobile"`, minimum `44px–50px` touch targets, and native `navigator.share` sheet integration.
- **Offline & Reconnect Resilience**: Local puzzle generation and `localStorage` persistence for Solo mode; `sessionStorage` snapshot recovery plus Centrifugo `300s` / 25-message channel history recovery when iOS resumes from background.

### Explicit Non-Goals (Out-of-Scope)
- **Android Platform**: Android (`@capacitor/android`, Gradle, `android/`, `androidScheme`, Google Play packaging) is explicitly **out of scope** and excluded from project configuration, scripts, and deployment targets.
- **Server-Side Database / REST API**: No persistent backend database or user account service; room discovery and game synchronization remain stateless over Centrifugo channels (`sudoku:lobby`, `sudoku:game.{id}`).
- **Native SwiftUI Rewrite**: Game rendering and interaction stay in the shared React 19 + Native CSS UI layer hosted inside `WKWebView`.

---

## 2. DDD Domain Modeling (Framework-Agnostic)

The core architecture isolates pure puzzle rules from React state, Capacitor iOS APIs, and Centrifugo transport:

| Layer | Responsibility | Codebase Modules |
|---|---|---|
| **Domain** | Pure 9×9 board rules, candidate generation, conflict detection, MRV bitmask uniqueness solver | `src/domain/sudoku-engine.js`, `src/domain/sudoku-generator.js` |
| **Application** | Mode orchestration (`solo`, `online`, `watch`), undo stack, co-op rematch/reset negotiation, auto-pause timer | `src/App.jsx`, `src/utils/watcher-helpers.js` |
| **Infrastructure** | Centrifugo v6 WebSocket client, `eventId` dedup, `localStorage`/`sessionStorage` adapters, iOS native URL fallbacks | `src/services/online-game-client.js`, `src/services/online-state-storage.js`, `capacitor.config.json` |
| **Presentation** | WCAG 2.2 AA grid, coordinates (`R1`–`R9`, `C1`–`C9`), numpad, Watch directory, spectator hints & reactions | `src/components/*.jsx`, `src/styles/app.css`, `src/utils/aria-helpers.js` |

### Aggregates, Entities & Value Objects
- **`SudokuGame` (Aggregate Root)**:
  - `board: number[81]` (`0` = empty, `1–9` = digit)
  - `givens: boolean[81]` (immutable starting clues)
  - `solution: number[81]` (unique verified solution)
  - `notes: number[][81]` (sorted candidate pencil marks `1–9` per cell)
  - `owners: ('given' | 'host' | 'guest' | null)[81]` (authorship attribution for Co-op board colors)
  - `conflicts: number[]` (indices violating row/column/box uniqueness)
  - `status: 'playing' | 'solved'`
  - `history: Snapshot[]` (local undo stack)
- **Value Objects**:
  - `Difficulty`: `'easy' | 'medium' | 'hard' | 'expert'`
  - `CellCoordinate`: index `0..80` mapped to `Row (R1..R9)` and `Column (C1..C9)`
  - `RoomId` (`isValidGameId`: `/^[A-Za-z0-9_-]{6,64}$/`), `ClientId`, `EventId`
  - `SpectatorHint`: `{ index: number, digit: number | null }` (`null` = nudge)

### Domain Events & State Transitions
- **`CellUpdated`**: Validated against `givens[index] === false`; removes conflicting peer pencil marks on digit entry; transitions `status -> 'solved'` when `filledCount === 81 && conflicts.length === 0`.
- **`NotesUpdated`**: Toggles candidate digit or batch-fills/clears candidate notes.
- **`PresenceAnnounced`**: Publishes `{ clientId, role: 'host' | 'guest' | 'spectator', game_mode }` on `sudoku:game.{id}`.
- **`LobbyUpdated`**: Publishes `{ id, game_id, status, game_mode, difficulty, filled_count }` on `sudoku:lobby`.
- **`HintSuggested` / `ReactionSent`**: Spectator advisory events rendered without mutating authoritative `SudokuGame` cells until a player accepts a hint chip.

### Required Hexagonal Ports (Interfaces)
1. **`RealtimeTransportPort`** (`OnlineGameClient`):
   - `connect()`, `disconnect()`, `joinLobby(handlers)`, `leaveLobby()`, `joinGameChannel(gameId, role, gameMode, handlers)`, `leaveGameChannel()`, `broadcastGameEvent(gameId, type, data)`.
   - Must deduplicate incoming events via bounded `seenEventIds` (`MAX = 200`) and resolve native iOS transport to `wss://sudoku-ws.fraha.dev/connection/websocket` unless overridden by `VITE_WS_URL` or `window.__APP_CONFIG__`.
2. **`StatePersistencePort`**:
   - Solo state: `localStorage` (`sudoku_solo_save_v1`, `sudoku_difficulty`).
   - Online room snapshot: `sessionStorage` (`online-state-storage.js`) keyed per `gameId`.
3. **`ShareLinkPort`**:
   - Uses iOS native share sheet (`navigator.share`) when available, with clipboard/input-selection fallback; always generates `https://sudoku.fraha.dev/games/{gameId}` inside native Capacitor shells (`capacitor://localhost`).
4. **`EnvironmentConfigPort`**:
   - Precedence: explicit constructor config → `window.__APP_CONFIG__` → Vite `import.meta.env.VITE_*` → iOS production default (`fraha.dev`).

---

## 3. Formalized User Stories

| ID | Bounded Context | User Story |
|---|---|---|
| **IOS-01** | Native iOS Shell | As an **iPhone player**, I want the app packaged with Bundle ID `dev.fraha.sudoku` and safe-area insets, so that the 9×9 board and numpad never collide with the Dynamic Island or home indicator. |
| **IOS-02** | Solo Solving | As an **offline iOS commuter**, I want to generate uniquely solvable Sudoku puzzles and have my progress saved locally, so that I can play on flights or subways without a network connection. |
| **IOS-03** | Real-Time Co-op | As an **iOS host**, I want to tap **Share Link** to open the iOS Share Sheet with `https://sudoku.fraha.dev/games/{id}`, so that a friend can join via browser or iOS and solve collaboratively over `wss://sudoku-ws.fraha.dev`. |
| **IOS-04** | Mobile Reconnect | As an **iOS co-op player**, I want missed moves to recover automatically when I switch back to the app after backgrounding iOS, so that our boards stay in sync via Centrifugo 300s history recovery and 5s ping reconciliation. |
| **IOS-05** | Live Spectating | As a **spectator on iOS**, I want to browse live Solo and Co-op games in the **Watch Live** lobby, tap empty cells to send digit hints or nudges, and trigger emoji reactions without modifying the players' board directly. |

---

## 4. Enterprise & Non-Functional Specifications

### 4.1 iOS Platform & `fraha.dev` Configuration Matrix
- **Capacitor Config (`capacitor.config.json`)**:
  - `appId`: `"dev.fraha.sudoku"`
  - `appName`: `"Sudoku Live"`
  - `webDir`: `"dist"`
  - `backgroundColor`: `"#0f172a"`
  - `ios`: `{ "scheme": "App", "contentInset": "never", "preferredContentMode": "mobile", "scrollEnabled": true, "allowsLinkPreview": false }`
  - `server`: `{ "hostname": "localhost", "iosScheme": "capacitor", "allowNavigation": ["sudoku.fraha.dev", "sudoku-ws.fraha.dev"] }`
- **Production Infrastructure (`compose.prod.yml` & `.env.prod.example`)**:
  - Default `DOMAIN_NAME`: `fraha.dev`
  - Web SPA hostname (`cf.tunnel.hostname`): `sudoku.fraha.dev` (`PUBLIC_APP_URL=https://sudoku.fraha.dev`)
  - Centrifugo hostname (`cf.tunnel.hostname`): `sudoku-ws.fraha.dev` (`WS_HOST=sudoku-ws.fraha.dev`, `WS_PORT=443`, `WS_SCHEME=https`)
  - Centrifugo `CENTRIFUGO_CLIENT_ALLOWED_ORIGINS`: `"https://sudoku.fraha.dev capacitor://localhost https://localhost http://localhost"`
- **Universal Links Readiness (Optional Xcode Capability)**:
  - Add Associated Domains entitlement `applinks:sudoku.fraha.dev` and serve `/.well-known/apple-app-site-association` for `dev.fraha.sudoku` when enabling deep links directly from Safari/Messages into the iOS app.

### 4.2 Localization Key Registry (English Baseline)
All user-facing UI strings are organized for deterministic extraction into `.arb` / JSON resource bundles:

| Key | Default (`en`) Fallback | Context |
|---|---|---|
| `app.title` | `Sudoku Live` | App header & iOS `CFBundleDisplayName` |
| `mode.solo` | `Solo` | Mode tab |
| `mode.online` | `Online Co-op` | Mode tab |
| `mode.watch` | `Watch Live` | Mode tab |
| `status.live` | `Live` | Centrifugo connected badge |
| `status.connecting` | `Connecting...` | Centrifugo connecting badge |
| `status.disconnected` | `Disconnected` | Centrifugo disconnected badge |
| `status.reconnect` | `Reconnect` | Manual retry CTA |
| `coop.waiting_partner` | `Waiting for partner` | Co-op presence badge |
| `coop.partner_online` | `Partner online` | Co-op presence badge |
| `coop.invite_copied` | `Invite link copied.` | Clipboard confirmation |
| `watch.empty_online` | `No live Sudoku matches right now.` | Watch Lobby empty state |
| `watch.empty_offline` | `Not connected to the live server right now.` | Watch Lobby offline state |
| `watch.spectating_banner` | `Spectating Live Match — Read-only board` | Spectator top bar |
| `watch.back_to_lobby` | `Back to Lobby` | Spectator exit CTA |
| `game.solved_summary` | `Puzzle Solved` | Completion summary |
| `error.given_cell` | `Starting clue is locked.` | Invalid cell edit feedback |

### 4.3 Accessibility (VoiceOver & WCAG 2.2 AA)
- **Board Semantics**: `role="grid"` with `aria-rowcount="9"`, `aria-colcount="9"`, and per-cell `aria-label` describing coordinates, digit/notes state, given/partner authorship, and conflict state (`aria-invalid="true"`).
- **Focus & Keyboard**: Roving `tabIndex` across the 81 cells; external Bluetooth keyboard support on iPadOS (`Arrow` keys, `1–9`, `N`, `Esc`, `Cmd+Z`).
- **Touch Targets & Contrast**: Minimum `44px` interactive controls (`50px` numpad keys), `#f1f5f9` / `#0f172a` high-contrast surface palette, `@media (prefers-reduced-motion: reduce)` and `@media (forced-colors: active)` rules.

### 4.4 Observability
- **Transport Telemetry**: Centrifugo connection transitions (`disconnected`, `connecting`, `connected`) surfaced via `onConnectionChange`; channel presence join/leave logged cleanly without PII.
- **Deduplication & Sync Metrics**: Bounded `seenEventIds` (`200` entries) prevents duplicate replay application; `ping` reconciliation compares board checksum/diff every `5s`.
- **iOS Build Logging**: Keep Capacitor default `loggingBehavior: "debug"` in development and set `"none"` in App Store Release builds.

### 4.5 Performance & Memory Budgets
- **Puzzle Generation**: Uniquely solvable 9×9 generation via MRV bitmask solver completes synchronously in `< 50 ms` on iOS WKWebView.
- **Web Bundle Footprint**: Vite production bundle `dist/` remains `< 150 kB` gzipped for instant cold-start inside `ios/App/App/public`.
- **Channel History & Memory**: Centrifugo namespace `sudoku` retains `history_size: 25`, `history_ttl: "300s"`; client deduplication map capped at `200` event IDs.
- **Layout Stability**: Zero horizontal overflow (`document.documentElement.scrollWidth <= window.innerWidth`) at `390×844` (iPhone portrait) and `375×667` (iPhone SE).
