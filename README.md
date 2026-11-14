# Sudoku Live

A fast, accessible, zero-backend Sudoku app built with **React 19**, **Vite**, **Capacitor 8**, Native CSS, and self-hosted real-time WebSockets powered by **Centrifugo v6** (`centrifuge` JS SDK).

Built as a clean reference showcase for shipping one web codebase across **Native iOS (Capacitor + Fastlane)**, **itch.io HTML5**, and **Docker Self-Hosting**.

---

## Documentation Hub

| Area | Guide | Highlights |
|---|---|---|
| **iOS (Capacitor + Fastlane)** | [docs/ios/README.md](docs/ios/README.md) | `cap sync`, `preflight`, `simulator`, `archive`, TestFlight `beta`, ASC API Key auth, [iOS Spec](docs/ios/spec.md) |
| **itch.io HTML5 ZIP** | [docs/itch-io/README.md](docs/itch-io/README.md) | Relative asset base (`./`), iframe guards, automated ZIP verification, `butler push` |
| **Self-Hosting in Docker** | [docs/self-hosting/README.md](docs/self-hosting/README.md) | `nginx:1.27-alpine` + `centrifugo:v6`, runtime `/env-config.js`, `compose.prod.yml`, reverse proxies |
| **Architecture & Gameplay** | [docs/architecture/README.md](docs/architecture/README.md) | Zero-DB client design, MRV uniqueness solver, Solo / Co-op / Watch Live, WebSocket protocol |
| **Testing & QA** | [docs/testing/README.md](docs/testing/README.md) | Vitest unit tests, Playwright headless/headed E2E, axe-core a11y, [QA Report](tests/qa/REPORT.md) |

Full index: [docs/README.md](docs/README.md)

---

## Technology Stack

- **App / UI**: React 19, Vite 8, Native CSS (`env(safe-area-inset-*)` iOS safe areas, WCAG 2.2 AA semantics)
- **Native iOS**: Capacitor 8 (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, [capacitor.config.json](capacitor.config.json)) + Fastlane
- **Real-Time WebSockets**: Centrifugo v6 (`centrifugo/centrifugo:v6`) + `centrifuge` JS SDK
- **Self-Hosting Container**: Multi-stage `nginx:1.27-alpine` static SPA server with runtime `/env-config.js`
- **Testing**: Vitest + React Testing Library + Playwright + `@axe-core/playwright`

---

## Quick Start

### 1. Local Web & Docker Self-Hosting
```bash
npm install
npm run docker:up       # Starts Nginx SPA (:8000) + Centrifugo v6 (:8081)
```
Or run Vite locally alongside Centrifugo:
```bash
docker compose up -d centrifugo
npm run dev
```
See [docs/self-hosting/README.md](docs/self-hosting/README.md) for production deployment (`compose.prod.yml`) and reverse-proxy examples.

### 2. Native iOS (Capacitor 8 + Fastlane)
```bash
npm run ios:preflight   # Verify Capacitor, Xcode, and Fastlane setup
npm run cap:sync        # Build dist/ and sync into ios/
npm run ios:archive     # Export signed App Store IPA
npm run ios:testflight  # Bump build number and upload to TestFlight
```
See [docs/ios/README.md](docs/ios/README.md) for Simulator builds, `.env` templates, and App Store Connect API keys.

### 3. itch.io HTML5 ZIP
```bash
npm run build:itch      # Build dist-itch/ with base './' and create sudoku-live-itch.zip
npm run verify:itch     # Verify archive structure, relative paths, and file limits
```
See [docs/itch-io/README.md](docs/itch-io/README.md) for embed settings and `butler` upload commands.

---

## Verification

```bash
npm test                # Vitest unit, component, and itch.io package tests
npm run build           # Vite production bundle
npm run docker:config   # Validate docker-compose.yml and compose.prod.yml
npm run e2e             # Playwright headless Chromium + axe-core E2E suite
```

---

## License

This project is source-available software licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE) (`PolyForm-Noncommercial-1.0.0`).
