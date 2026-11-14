# Handover

## Completed work

Browser coverage updated to the current UI on top of `main` (`413cf9b`), tracked in issue #1. The earlier splash-only expectations were invalidated by subsequent setup/navigation/theme commits; they were replaced rather than bypassed. Added a headed script and reviewed Light/Dark references with explicit user approval. The user also approved the minimal number-pad whitespace correction that resolves axe's label/content mismatch.

## Work in progress / next steps

See [STATUS](STATUS.md), with current QA evidence in [the report](../../tests/qa/REPORT.md). The user explicitly authorized committing and pushing all current files; this includes the pre-existing iOS project, VariantSelector order, and `.impeccable` critique. Do not mistake these for newly authored changes by the test task. The user subsequently requested merging into `main` and switching the local checkout to `main`; integration is tracked in [PR #2](https://github.com/hapheus/tictacagro/pull/2). No release or deployment was authorized.

## Environment and commands

- `npm test`: Vitest / Testing Library.
- `npm run build`: Vite production bundle.
- `npx cap ls` / `npx cap ls ios`: CLI listing commands completed successfully, not a native compile check.
- `docker compose config -q`: configuration validation passed before opening the merge PR.
- `npm run e2e`: headless Chromium.
- `npm run e2e:headed`: identical suite in visible Chromium; append `-- --grep "settings change"` to select a test.
- `npx playwright show-trace <trace.zip>`: inspect retained failure traces in `test-results/`.
- No configured devenv E2E task, lint script, or typecheck script exists. No CI was added.

## Pitfalls

- Sandbox denies local listener creation (`listen EPERM: operation not permitted 127.0.0.1:5178`); browser tests need authorized local-server/browser execution.
- Run Playwright suites sequentially; concurrent runs interfere through the shared managed server and `test-results/` (`net::ERR_CONNECTION_REFUSED`).
- Hidden radio inputs are operable through their visible labels, not direct `.check()` hit testing. Do not use `force` to conceal actionability problems.
- Setup has multiple keyboard-focusable choices; Play is no longer the first Tab stop. Resume Current Game preserves progress; Play intentionally starts a new puzzle when progress exists.
- Seed localStorage only when absent. Unconditionally resetting the snapshot on every reload invalidates persistence tests.
- Headed Chromium uses native scrollbars while the default headless shell does not, changing full-page screenshot width by 15 px. Use the full Chromium channel in both modes plus `--hide-scrollbars`; a targeted comparison verified pixel-identical headed/headless captures. Do not loosen screenshot tolerances to compensate.
- Keep number-pad digit/count text separated: adjacent JSX spans without a separator are interpreted as concatenated visible text by axe.

## Native release gate

The user-authorized Xcode snapshot changes the app target from pinned iOS 15 to the SDK recommendation (17.0 in the installed SDK), and from iPhone/iPad to iPhone-only. This differs from `docs/ios-spec.md`. Preserve the snapshot; reconcile the intended support policy and validate native builds/devices before release. Web checks and plist parsing are not native compatibility evidence.

## Test architecture

Deterministic serialized Sudoku fixtures are created without replacing global storage. Each test has an isolated browser context; reload retains the application's real saved state. External WebSockets are intercepted to keep local coverage server-independent. Only the ticking elapsed-time text is masked in screenshots. Real co-op networking, native iOS, and animation timing remain outside this suite.
