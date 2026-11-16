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

## Update — 2026-11-16 (Device Support, Responsive Design & Play Landscape Critique)

- **Changes**:
  - Enabled landscape and all iPad orientations in `ios/App/App/Info.plist` (`UIRequiresFullScreen = false`), `ios/App/App/AppDelegate.swift` (`supportedInterfaceOrientationsFor`), and `public/manifest.webmanifest` (`"orientation": "any"`).
  - Implemented `.gameplay-stage` CSS Grid layouts in `src/styles/app.css` and `src/components/GamePlayView.jsx` for phone landscape (`@media (orientation: landscape) and (max-height: 540px)`), iPad / Desktop / itch.io (`@media (min-width: 900px) and (min-height: 540px)`), and dual-screen / iPhone Duo (`@media (horizontal-viewport-segments: 2)`).
  - Applied all 5 P0–P2 fixes from `/impeccable critique`:
    - P0: Docked `SolveSummary` into `.gameplay-stage__side` when `status === 'solved'` instead of showing `PlayerControls` / `SpectatorHintsFeed`.
    - P1: Hid `.tool-btn__kbd` on touch/small devices (`@media (min-width: 520px) and (hover: hover) and (pointer: fine)`).
    - P1: Positioned `.gameplay-stage__side` (`position: relative`) so `SpectatorPeekOverlay` scopes to the side column in landscape.
    - P2: Moved `messages.shiftHintNoCell` inline into `.shift-bar__hint` in `src/components/PlayerControls.jsx`.
    - P2: Strengthened dark-mode `--color-reveal-scrim` to `rgba(15, 19, 26, 0.84)`.
- **Checks**:
  - `npm run test`: 42 files, 215 tests passed.
  - `npm run quality`: passed (`lint` + `test`).
  - `npm run build` & `npm run cap:sync`: passed.
  - `impeccable detect --json`: 0 findings (`[]`) on `GamePlayView.jsx` and `PlayerControls.jsx`.
  - `npx playwright test tests/qa/game.spec.ts --update-snapshots`: 17 passed; visually inspected `game-dark-844x390.png` and `game-light-844x390.png`.
  - `npx playwright test`: 35 passed, 1 skipped (`tic-tac-toe-online.spec.ts` online lobby), 8 screenshot subpixel diffs (12–85 px, 0.01 ratio) in `tests/qa/game.spec.ts`.
  - Native iOS Simulator build (`xcodebuild ... -destination id=5D7AE121-DE31-4F71-817A-CE7B2E554BF3`) & launch on `iPhone 18 Pro` (iOS 27.0): `BUILD SUCCEEDED`, app launched cleanly.
  - **Blocked**: `iPhone Duo` simulator (`com.apple.CoreSimulator.SimDeviceType.iPhone-Duo`) requires `minRuntimeVersionString: 27.1.0`, while only iOS 18.1, 26.5, and 27.0 runtimes are installed (`xcrun simctl create` error 403 `Incompatible device`).

## Update — 2026-11-16 (Issue #47: Settings and shift controls)

- **Changes:** Escaped the player-name pattern's hyphen for HTML Unicode Sets (`v`) validation. The visible shift hint gets a full flex row, and the four-arrow action group reserves its minimum touch width. Small-landscape Settings uses the available container width; the selector is scoped to Settings so Setup and Watch retain their existing layout.
- **TDD evidence:** Before implementation, the real browser ignored the invalid pattern (`patternMismatch` stayed false for `Invalid!`), Settings measured only 500 px at 812×375, and an arrow extended outside the compressed action group. Each regression was observed failing before its corresponding fix.
- **New coverage:** `tests/qa/settings-shift-layout.spec.ts` exercises the agreed browser-UI seams. Dark and Light at 360×640, 390×844, 768×1024, 1280×800, 1440×900, and iPhone Mini landscape 812×375. Checks include native name validation and pattern-console errors, no horizontal page overflow, non-overlapping hint/actions, four buttons at least 44×44 px, Settings width, and zero axe WCAG 2/2.1 A/AA violations in Settings and hint-visible gameplay. No axe rules are disabled.
- **Visual evidence:** All 24 new `baselines/issue47-{settings,shift}-{theme}-{width}x{height}.png` references were visually inspected (matrix plus full-size Mini Settings and narrow-phone hint checks) and are connected to screenshot assertions. Only the random player tag is masked. Settings element captures retain the known fixed-bottom-navigation/full-page artifact documented above; content remains scrollable. Existing screenshot references were not refreshed.
- **Keyboard / motion / zoom:** The test edits and randomizes a name using the keyboard, switches theme using native radio-key navigation, and checks accessibility/overflow at 200% CSS zoom. Gameplay Escape clears selection to expose the real hint. Reduced motion is enabled by the Playwright configuration. No developer drawer exists.
- **Checks completed:** 216 Vitest tests in 42 files passed; lint has 0 errors and 27 existing warnings; production build, `npx cap ls`, `docker compose config -q`, and `git diff --check` passed. The new suite passed all 14 cases with screenshots in headless and headed Chromium.
- **Quality debt:** Default `npm run quality` passes its current 70-point threshold, scoring 72.8/100 (83.6% line coverage, 2.38% duplication, 27 lint warnings). The explicit `--min-score=90` check fails. An isolated archive of unchanged `main` (`3053b48`) reproduced exactly these metrics; threshold/quality work belongs to #51. No CI or quality thresholds were changed here.
- **Limits:** Chromium/macOS browser QA only, not native iOS/Safari, physical-device testing, VoiceOver, or full manual WCAG 2.2 certification. No standalone typecheck script or devenv E2E task is configured. Automated accessibility is not a substitute for manual certification.
- **Existing visual debt:** The final `game.spec.ts --grep 'setup and gameplay'` snapshot run had 3 passes and 9 failures, all existing gameplay references (`game-*.png`), not Setup. The unchanged-main archive had 2 passes and 10 failures in the same 12-case matrix; small board-glyph rendering differences vary between runs. The changed hint/Settings references pass independently. Existing references and screenshot tolerances were left untouched. The PR remains a draft rather than claiming the complete visual suite or the 90-point gate is green.
- **Test stability:** A first full functional run caught an immediate width read before the landscape layout settled. The regression assertion now polls the actual rendered Settings width (without sleeps or relaxed bounds); the minimum width requirement is unchanged. Related hint/action geometry is measured in one browser evaluation to avoid mixing coordinates across a scroll/layout update.
- **Final rerun:** `npm run e2e -- tests/qa/settings-shift-layout.spec.ts` passed 14/14 with all new screenshot assertions; `npm run e2e -- --ignore-snapshots` passed 57 with 1 existing online-only skip. This second command verifies the complete functional/axe suite, not old screenshot parity. The settled-width assertion passed in both runs.
