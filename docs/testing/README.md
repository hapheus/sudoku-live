# Testing & Verification

Sudoku Live uses **Vitest** (with React Testing Library and `jsdom`) for fast unit/component/packaging checks and **Playwright** (Chromium + `@axe-core/playwright`) for end-to-end UI, accessibility, and visual regression verification.

---

## Unit & Packaging Tests (Vitest)

```bash
npm test
```

Covers:
- Sudoku engine & generator uniqueness guarantees (`tests/sudoku-engine.test.js`, `tests/sudoku-generator.test.js`)
- React UI, game flow, board, audio, and watch directory (`tests/*.test.{js,jsx}`)
- Centrifugo WebSocket client & deduplication (`tests/online-game-client.test.js`)
- itch.io HTML5 ZIP validation (`tests/itch-package.test.js`)

---

## End-to-End & Visual QA (Playwright)

```bash
# Install Chromium if not already present
npx playwright install chromium

# Headless Chromium suite
npm run e2e

# Visible Chromium window
npm run e2e:headed

# Run a single test by name
npm run e2e:headed -- --grep "settings change"
```

Notes:
- Both E2E commands automatically start a local Vite server on port `5178`. Run them sequentially.
- Headed execution requires a graphical desktop session.
- Failures retain traces and screenshots under `test-results/`; inspect a trace with:
  ```bash
  npx playwright show-trace <path-to-trace.zip>
  ```
- Visual reference baselines live in [`tests/qa/baselines/`](../../tests/qa/baselines/). Review screenshots before updating them with `npm run e2e -- --update-snapshots`.
- Both modes use the full Chromium binary (`channel: chromium`) and hide native scrollbar chrome for consistent screenshot geometry; only the ticking elapsed-time text is masked.
- See [the QA report](../../tests/qa/REPORT.md) for verified coverage and known limitations.

---

## Continuous Integration

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on pushes and pull requests targeting `main` and `develop`:

- **`unit-and-build`** (`ubuntu-latest`): `npm test` and `npm run build`.
- **`itch-package`** (`ubuntu-latest`): `npm run build:itch`, `npm run verify:itch`, and uploads `sudoku-live-itch.zip` as an artifact.
- **`docker-smoke`** (`ubuntu-latest`): `npm run docker:config`, builds and starts `docker compose`, and verifies `/up`, `/env-config.js`, and Centrifugo `/health`.
- **`e2e-playwright`** (`ubuntu-latest`): `npm run e2e -- --ignore-snapshots` (functional & `axe-core` checks on Linux without macOS font-diff false positives) and uploads traces/reports on failure.

[`.github/workflows/ios-simulator.yml`](../../.github/workflows/ios-simulator.yml) is optional and triggered manually via `workflow_dispatch`:

- **`ios-simulator`** (`macos-latest`): `ruby -c ios/fastlane/Fastfile`, `npm run ios:preflight`, and `fastlane simulator` (`CODE_SIGNING_ALLOWED=NO`).
