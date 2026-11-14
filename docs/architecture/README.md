# Architecture & Gameplay

Sudoku Live is a **100% serverless, zero-database** application. All puzzle generation, validation, and persistence run in the client (`localStorage` / `sessionStorage`), while optional real-time features connect directly to **Centrifugo v6** over WebSockets.

---

## Game Modes

1. **Solo (Live Observable)**
   - Single-player solving with pencil-mark notes, automatic peer note cleanup, conflict highlighting, undo history, timer, and solver hints.
   - Publishes live progress to `sudoku:lobby` when Centrifugo is connected so spectators can watch, suggest hints, and react in real time (while remaining 100% playable offline).
2. **Online Co-op**
   - Real-time collaborative solving over Centrifugo with invite links, presence announcements, shared cell updates/notes, `300s` history recovery on reconnect, and co-op new-puzzle negotiation.
   - Additional visitors beyond two players automatically join as spectators.
3. **Watch Live (Spectator Mode)**
   - Lists active rooms in the Watch tab; direct spectator URLs let visitors watch a live match, suggest cell hints (`1–9` or nudge) that players can apply with one click, and send floating emoji reactions.

---

## Puzzle Engine & Accessibility

- **Calibrated Generator & Unique-Solution Solver** (`src/domain/sudoku-generator.js`, `src/domain/sudoku-engine.js`):
  - Generates randomized valid 9×9 and 6×6 boards with symmetric clue removal and MRV bitmask backtracking to guarantee a **single unique solution**.
  - Four difficulty presets: **Easy** (38–42 clues, naked-singles solvable), **Medium** (30–34 clues), **Hard** (25–28 clues), and **Expert** (22–25 clues).
- **Keyboard-First & WCAG 2.2 AA**:
  - Semantic `role="grid"` with `Row X, Column Y` coordinate labels, conflict announcements (`aria-invalid`), `aria-live` status updates, arrow-key navigation, digit entry (`1–9`), `Backspace`/`Delete`, `N` for pencil notes, and `Ctrl/Cmd+Z` undo.

---

## Multiplayer & Spectator Protocol

```text
[Player A (Web / iOS)] <-- (WS: sudoku:game.{id} / sudoku:lobby) --> [Centrifugo v6]
                                                                            ^
[Player B (Partner)]   <-- (Presence, Sync, Recovery & Dedup) --------------+
[Spectator Clients]    <-- (Live Board, Cell Hints & Reactions) ------------+
```

- **Zero Backend**: Clients connect directly to Centrifugo (`sudoku` namespace with `presence`, `join_leave`, `history_size: 25`, `history_ttl: "300s"`, `force_recovery: true`, and anonymous client permissions in [`docker/centrifugo/config.json`](../../docker/centrifugo/config.json)).
- **Multi-App WebSocket Ready**: Centrifugo isolates channel namespaces (`sudoku` and extensible `app`), ready to serve web browsers, itch.io embeds, and Capacitor iOS apps concurrently.
- **Room Presence & Deduplication**: Participants announce `{ role, game_mode }` via `presence-announce` on subscribe/join, hosts publish room progress to `sudoku:lobby`, and all moves carry unique `eventId` tokens (`MAX_SEEN_EVENT_IDS = 200`).
