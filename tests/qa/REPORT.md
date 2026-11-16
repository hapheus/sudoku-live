# Current browser-flow QA — 2026-11-14

Issue: https://github.com/hapheus/tictacagro/issues/1
Branch: `test/current-browser-flow`

## Coverage

The suite now targets the current Play setup → game flow, not the superseded emerald splash. Setup includes grid/difficulty selection; the fixed Play / Watch / Settings navigation and in-game Setup / New Puzzle controls are intentional assertions, not hidden or removed to satisfy old tests.

- 12 responsive scenarios: Light and Dark at 360 × 640, 390 × 844, 768 × 1024, 1280 × 800, 1440 × 900, and 844 × 390 landscape.
- Each scenario covers keyboard traversal from setup to Play, grid focus, arrow/digit entry, undo, notes, hit-tested number-pad interaction, fixed navigation position, and horizontal overflow.
- Separate scenarios cover completion and Play Again, actual saved progress across reload, persistent theme/language changes, 200% CSS zoom, and 6×6 Easy selection/restoration.
- axe WCAG 2 A/AA and 2.1 A/AA checks run on setup, gameplay, notes-active, completion, Dark/Light settings, and 6×6 gameplay. No rules are disabled.
- Offline WebSocket interception prevents dependence on a production Centrifugo server; it is not a claim of live co-op coverage.

## Regression evidence

24 reviewed references: `baselines/{setup,game}-{dark,light}-{width}x{height}.png`. The twelve obsolete emerald/splash references were replaced with explicit user approval. References were visually reviewed before acceptance and are connected to actual `toHaveScreenshot` assertions. Only changing elapsed-time text is masked; other telemetry and layout remain visible. Both modes use full Chromium (`channel: chromium`) with native scrollbar chrome hidden, keeping scrolling enabled. A targeted comparison verified pixel-identical headed/headless captures; screenshot tolerances were not relaxed. The earlier headless-shell references differed by 1–2 pixels and were reviewed again after unifying the browser binary.

Local captures and failure traces are retained under ignored `test-results/`. `npx playwright show-trace <trace.zip>` opens a trace. Suites run with one worker and must be invoked sequentially because they share the local Vite server and artifact directory.

## Findings

- Existing number-pad `label-content-name-mismatch` was reproduced by axe before the fix. The adjacent digit/count spans produced concatenated visible text. An explicitly approved whitespace separator fixes this without changing the design or spoken names. The targeted axe check passed afterward.
- Native review identified a support-policy discrepancy: app-target settings resolve to the SDK recommendation (17.0 on the installed SDK) and iPhone-only device family, while `docs/ios-spec.md` still says iOS 15/iPad. This is a release gate, not a demonstrated compile failure; the user explicitly included these existing settings in the snapshot.
- Existing compact grid/touch-target constraints remain: nine-column cells on narrow phones are below the project's 44 px target. This test-focused change does not redesign the grid or the existing compact controls.
- Full-page captures can show the fixed bottom navigation over content at the original viewport boundary, especially 360 × 640 and landscape. This is an existing fixed-overlay/full-page-capture characteristic, not a newly introduced layout change. Hit-tested digit entry and scrolling prove the lower keypad remains reachable. It is not claimed that all content fits simultaneously in a short viewport.
- Hidden native radio inputs cannot be `.check()`-clicked by Playwright; the tests activate the visible labels instead, without `force` or visibility bypasses.

## Checks

- `npm test`: 54 tests passed, 8 files.
- `npm run build`: passed.
- `git diff --check`: passed.
- `npx cap ls` and `npx cap ls ios`: completed successfully; CLI listing only, not compilation.
- `docker compose config -q`: passed before opening integration PR #2.
- `plutil -lint ios/App/App.xcodeproj/project.pbxproj`: passed; syntax only, not an iOS build.
- `npm run e2e -- --update-snapshots`: 15 passed after reviewed reference acceptance.
- `npm run e2e`: 15 passed in 37.0s, including all screenshot comparisons without updates.
- `npm run e2e:headed`: the same 15 passed in 35.0s, including all screenshot comparisons without updates.
- axe: zero violations in the audited states after the approved number-pad fix; no rules disabled.

## Limitations

References were captured on macOS with the installed Playwright Chromium; other operating systems/renderers have not been validated. No native iOS/simulator run, VoiceOver session, actual touch device, live multi-client server test, or manual full WCAG certification. Zoom is 200% CSS zoom emulation, not native Safari browser zoom. Reduced motion is enabled for deterministic rendering; animation timing is not under test. Light/Dark are both covered. No developer drawer exists. No configured lint/typecheck script or devenv E2E task exists; these absent checks are not counted as passed. Use the documented package commands, which start Vite on port 5178 automatically. Headed execution requires a graphical desktop session.

## Update — 2026-11-14 (Gameplay Mobile Viewport Fit)

- **Changes**: Hidden `.bottom-nav` during active gameplay and spectating (replaced by top-bar `← Setup`, `?` Guide, and `⚙` Settings controls); switched `<500px` `.numpad` to a single-row 9-column strip (`44px` min-height); added `100dvh` board cap (`min-height: 540px`); eliminated `.notes-quick-bar` and `.action-feedback` vertical layout shifts; quieted `#restart-btn` to `.btn-secondary`; fixed nested `<main>` landmark in `SudokuBoard.jsx`.
- **Checks**:
  - `npm test`: 30 files, 150 tests passed.
  - `npm run lint`: 0 errors (29 pre-existing warnings).
  - `npm run build`: passed.
  - `npm run e2e -- --update-snapshots`: 17 passed (all 12 responsive viewports + axe WCAG 2.1 AA + `scrollHeight <= innerHeight + 1` on `height >= 640`).
  - `impeccable detect --json`: 0 findings on modified UI files.

## Update — 2026-11-16 (Multiplayer & Lobby)

- **Changes**: Added persistent random/custom player names with `Name#abcd` 4-hex-digit tags (`.player-tag__hash` muted tone) and automatic duplicate suffixes (`Name (2)`), Watch directory search + status/size filters + game duration display (`MM:SS` / `H:MM:SS`), and reconnect/sync test coverage.
- **Checks**:
  - `npm run test`: 39 files, 200 tests passed.
  - `npm run lint`: 0 errors.
  - `npm run build`: passed.
  - `npx playwright test tests/qa/multiplayer-lobby.spec.ts`: 13 passed (keyboard player name persistence & randomize, touch targets >= 44×44 px, zero horizontal overflow and zero axe WCAG 2.1 AA violations on Watch and Settings across 360×640, 390×844, 768×1024, 1280×800, 1440×900, and 844×390 in dark and light themes).
