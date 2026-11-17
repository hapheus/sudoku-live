# Local verification — 2026-11-17

Destination base: `cd210c6fdd565a4c224f985134266d03caf58c84` (local implementation
on top of this revision). Source worker: `f2572338668dfc178f900d0a64b159ab9a9f282c`.
See `provenance.json` for source-file checksums. This record concerns the local
bot feature, independently of application release/device QA in #59 and #60.

- Node 22.23.4, macOS/Apple Silicon, local Docker Centrifugo 6.10.3.
- App: 253 tests in 47 files passed; ESLint and TypeScript passed.
- Bot: 33 unit tests passed using an explicitly in-memory WebSocket boundary.
  Real engine coverage includes both variants, unique puzzles, valid solutions,
  protected clues, moves, notes, shifts, completion, co-op edits and retries.
- Real isolated backend on loopback port 18081: late Watch snapshots, live
  placements, exact session count, unique identities/game IDs and graceful
  cleanup verified. Process restart creates fresh IDs. Docker stop/start recovery
  preserves the same games and restores snapshots. This exposed and fixed stale
  transport identity bindings and stale Watch room caches after reconnect.
- Actual CLI default (3), count (5), headed (3), combined headed/count (5) passed.
  Every headed Watch tab rendered a real board before readiness. A failed headed
  app navigation exits nonzero and removes all already-created sessions.
- Real co-op handshake, a human placement and notes, human departure, resumed
  shifts after the real 15-second join grace, host moves and solved snapshots
  passed against the isolated backend. This case advances the owned worker's
  scheduler clock to complete a game quickly; it uses real WebSocket delivery.
- Four integration cases passed together. The separate recovery-enabled run
  passed its three cases before adding the startup-failure case; its Docker
  outage scenario was executed, not inferred from the in-memory tests.
- Production `wss://sudoku-ws.fraha.dev/connection/websocket`: ordinary anonymous
  Centrifuge client successfully connected over TLS and disconnected. No public
  games/lobby sessions were created by this connectivity check. Production
  gameplay/co-op was not exercised.
- Production app and itch builds passed. Bot exclusion scanner passed for
  `dist` (1266 files), `dist-itch` (916), synchronized iOS/Android web assets
  (1268 each), and the compiled iOS simulator `.app` (1292). itch ZIP verification
  also passed. Exclusion runs automatically on every app build and itch package.
- Production Docker image `sudoku-shift:issue-62` built successfully. Its nginx
  runtime has no `/app`, Node executable, Chromium executable or bot/Playwright
  files in served assets. `.dockerignore` excludes the complete local tool.
- iOS simulator app built successfully with Xcode, signing disabled, using an
  isolated DerivedData directory. Android assets synchronized successfully;
  Android APK/AAB compilation was unavailable because no Android SDK is installed.
  No signed IPA, device install or store upload was performed.
- The isolated QA backend and browser/worker processes were stopped after QA.

## Human-looking play follow-up — 2026-11-17

- Players now use the same ordinary generated names as the app (for example
  `CalmOtter`), without a bot prefix or machine ID. Presence and Watch metadata
  are covered by protocol tests.
- Move deadlines now respond to actual rated difficulty, the next technique,
  available logical opportunities, candidate density, nearby follow-on moves,
  an individual tempo and occasional hesitation. Expert-rated generated puzzles
  have a valid pace profile. Partner notes invalidate the cached analysis, and
  partner edits/shifts reset fluent runs and recalculate thinking time.
- Removed an unused precomputed-pause helper; tests exercise the scheduler used
  by actual workers. Fixed the final-cell wait that could consume the remaining
  whole-game budget. Targets are now soft starting paces with bounded pauses.
- 36 local unit tests passed, including a complete game on the normal scheduler,
  varied placement gaps, visible search gestures, current-board analysis, player
  names and the final-cell regression. The app build and bot exclusion scan passed.
- All four real-backend integration cases passed together with Docker outage
  recovery enabled. The combined headed/count case also opens an independent
  browser Watch client and requires a newly rendered placement, visible host
  cursor and no conflict cells. Its final screenshot was inspected locally.
- This stronger browser check corrected a limitation in the initial evidence:
  simply finding a board also matched the app's offline placeholder. The isolated
  backend now allows precisely the local test app Origin, and the check waits
  for the authoritative host snapshot before measuring new placements.
- These timing and gesture rules simulate human play; no human indistinguishability
  benchmark is claimed. Production games were not created during this follow-up.
