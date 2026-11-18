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

# Run a single test by name
npm run e2e -- --grep "settings change"
```

Notes:
- Tests always run headlessly. Use screenshots and traces to inspect failures.
- The E2E command automatically starts a local Vite server on port `5178`.
- Failures retain traces and screenshots under `test-results/`; inspect a trace with:
  ```bash
  npx playwright show-trace <path-to-trace.zip>
  ```
- Visual reference baselines live in [`tests/qa/baselines/`](../../tests/qa/baselines/). Review screenshots before updating them with `npm run e2e -- --update-snapshots`.
- Tests use the full Chromium binary (`channel: chromium`) and hide native scrollbar chrome for consistent screenshot geometry; only the ticking elapsed-time text is masked.
- See [the QA report](../../tests/qa/REPORT.md) for verified coverage and known limitations.

---

## Continuous Integration

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on pushes and pull requests targeting `main` and `develop`:

- **`unit-and-build`** (`ubuntu-latest`): `npm test` and `npm run build`.
- **`itch-package`** (`ubuntu-latest`): `npm run build:itch`, `npm run verify:itch`, and uploads `sudoku-shift-itch.zip` as an artifact.
- **`docker-smoke`** (`ubuntu-latest`): `npm run docker:config`, builds and starts `docker compose`, and verifies `/up`, `/env-config.js`, and Centrifugo `/health`.
- **`e2e-playwright`** (`ubuntu-latest`): `npm run e2e -- --ignore-snapshots` (functional & `axe-core` checks on Linux without macOS font-diff false positives) and uploads traces/reports on failure.

[`.github/workflows/ios-simulator.yml`](../../.github/workflows/ios-simulator.yml) is optional and triggered manually via `workflow_dispatch`:

- **`ios-simulator`** (`macos-latest`): `ruby -c ios/fastlane/Fastfile`, `npm run ios:preflight`, and `fastlane simulator` (`CODE_SIGNING_ALLOWED=NO`).

## Responsive regions

See [the responsive region contract](responsive-layout.md) for screen placement, geometry assertions, safe-area and hinge handling, and outstanding device acceptance.

## Board artwork

See [the artwork optimization report](board-artwork/README.md) for the 100-image catalog,
retired-ID migration, byte budgets, reproducible preparation, theme comparisons and
outstanding physical-device checks. Run `npx playwright test tests/qa/board-artwork.spec.ts`
for headless image, persistence, accessibility and visual regression checks.

## Local broker regression checks

With an isolated Centrifugo using `docker/centrifugo/config.json` bound to local
port 8081, run:

```bash
CENTRIFUGO_E2E=1 npm run e2e -- tests/qa/protocol-boundary.spec.ts tests/qa/session-compatibility.spec.ts tests/qa/lifecycle-restore.spec.ts tests/qa/tic-tac-toe-online.spec.ts
```

These are headless Chromium tests against a real local broker, not production or
physical devices. They cover compatible/incompatible live and recovered events,
player versus spectator feature scope, leave/rejoin, repeated transport suspension,
subscription identity/counts, and co-op with both admission policies. The lifecycle
UI test also exercises persisted browser page events and real back navigation,
attaching the observed page-transition sequence. Its launch configuration allows
Chromium's back/forward cache; the recorded `pageshow.persisted` value distinguishes
actual cache restoration from a non-cached remount. Native lifecycle and mixed
installed app builds remain device QA in #59/#72.

## Concurrent-state recovery

The bounded revision/generation contract and complete backend scenario matrix are
in [the convergence report](../architecture/snapshot-recovery.md). The CI Playwright
job starts a separate Centrifugo on port 17881 and executes `playwright.sync.config.ts`.
For local reproduction, use the setup/cleanup commands in that report; no production
or existing development broker needs to be interrupted. `SYNC_ALL=1` runs the full
suite through this config on its separate Vite port 5182. The existing real-UI broker
cases additionally use `CENTRIFUGO_E2E=1` and the local broker on port 8081.
