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

## Logic rating and bounded generation (#50)

Clue-count presets are search targets, not difficulty definitions or hard upper bounds (uniqueness may require extra clues). `sudoku-rating.ts` deterministically applies naked singles (Easy), hidden singles (Medium), and locked candidates / naked pairs (Hard). A verified unique puzzle that stalls beyond these techniques is Expert; this does not claim that guessing is the only possible human technique.

Generation verifies every candidate's unique solution, prefers an exact requested logic tier, and limits retries to avoid blocking the client indefinitely. If none matches, it selects the closest measured tier, using clue distance only as a tie-breaker, and reports the **actual** difficulty. This matters especially for 6×6, where advanced tiers may not be found within the retry budget. Requested and actual difficulty are retained separately so Setup/resume does not discard an honestly downgraded puzzle; old snapshots fall back compatibly. Gameplay and lobby show actual difficulty.

Row/column swaps stay within a box band/stack; whole-band/stack swaps are Sudoku automorphisms. Applying the same bijection to clues, board and solution preserves the number of clue solutions. Tests cover all four shift operations in both variants, plus seeded generation across every requested tier.

The [multiplayer trust and input contract](multiplayer-trust.md) records the action
matrix, anonymous ownership limits, complete network validation, history rules,
and compatibility behavior.

The [session transition ownership map](session-transitions.md) records current
orchestration responsibilities and the incremental join-request command boundary.
