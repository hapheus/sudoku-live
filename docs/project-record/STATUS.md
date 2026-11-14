# Status

## Current work

- Issue: https://github.com/hapheus/sudoku-live/issues/3
- Implementation branch: `feat/showcase-packaging-selfhost`, based on `main` (`eb9c27b`).
- Showcase enhancements implemented:
  - Capacitor 8 + Fastlane: `preflight` and `simulator` lanes, DRY `build_release_ipa!` helper, English `APP_LANGUAGE` default, `ios/fastlane/.env.example`, and `docs/ios/README.md` (+ `docs/ios/spec.md`).
  - itch.io HTML5 ZIP: `scripts/package-itch.mjs` (`build:itch`, `verify:itch`), Vitest unit tests (`tests/itch-package.test.js`), and `docs/itch-io/README.md`.
  - Docker self-hosting: OCI labels and `HEALTHCHECK` in `Dockerfile`, security headers in `docker/nginx.conf`, Centrifugo admin UI disabled by default in `docker/centrifugo/config.json`, `docker:*` npm scripts, and `docs/self-hosting/README.md`.
  - Documentation split into topic directories (`docs/ios/`, `docs/itch-io/`, `docs/self-hosting/`, `docs/architecture/`, `docs/testing/`) with concise `README.md` hub.
- Verification complete: 107 Vitest tests (12 files), Vite production build, `build:itch` + `verify:itch` (18 files, 22.02 MB), `ios:preflight`, `ruby -c ios/fastlane/Fastfile`, and `docker:config` passed.
- Playwright E2E, `docker build`, and `fastlane simulator` / `archive` were not run in this step.

## Remaining

1. Before native release, reconcile the iOS 15/iPad specification with the existing Xcode settings: recommended deployment target (17.0 on the installed SDK), iPhone-only device family. Native build/device verification remains unperformed.
2. Compare/synchronize this record to Obsidian when vault write access is authorized.

Merge into `main` and local checkout of `main` were explicitly requested after commit/push. No release or deployment is authorized.

The Guide was discussed as a candidate for shorter app-oriented help; its content has not been changed in this test-focused task.
