# Capacitor 8 + Fastlane iOS Showcase

Sudoku Live packages a React 19 + Vite SPA into a native iOS shell using **Capacitor 8** (Swift Package Manager) and automates builds, build-number bumping, and TestFlight uploads with **Fastlane**.

Android is intentionally out of scope ([iOS Specification](spec.md)).

---

## Architecture Pipeline

```text
src/ + public/
   └─► npm run build (Vite) ──► dist/
          └─► npx cap sync ios ──► ios/App/App/public + CapApp-SPM
                 └─► fastlane ios archive / beta ──► ios/App/build/SudokuLive.ipa
```

Key files:
- [`capacitor.config.json`](../../capacitor.config.json) — App ID (`dev.fraha.sudoku`), `webDir: "dist"`, `iosScheme: "capacitor"`, and `allowNavigation` for `sudoku.fraha.dev` / `sudoku-ws.fraha.dev`.
- [`ios/fastlane/Appfile`](../../ios/fastlane/Appfile) — App identifier, Apple ID, and Team ID defaults (overridable via env vars).
- [`ios/fastlane/Fastfile`](../../ios/fastlane/Fastfile) — Lanes for preflight checks, web sync, unsigned Simulator builds, App Store Connect registration, signed IPA export, and TestFlight upload.
- [`ios/fastlane/.env.example`](../../ios/fastlane/.env.example) — Template for Fastlane and App Store Connect API Key credentials.

---

## Quick Setup

1. Install JavaScript dependencies and verify the native toolchain:
   ```bash
   npm install
   npm run ios:preflight
   ```
2. Copy the Fastlane environment template and fill in your credentials (never commit `ios/fastlane/.env` or `.p8` keys):
   ```bash
   cp ios/fastlane/.env.example ios/fastlane/.env
   ```

---

## Available Fastlane Lanes

Run via `npm` scripts from the repository root or directly inside `ios/`:

| Command | Fastlane Lane | Purpose |
|---|---|---|
| `npm run ios:preflight` | `fastlane preflight` | Validates `capacitor.config.json`, Xcode, `npx cap ls`, build number, and ASC API key status |
| `npm run ios:devices` | — | Lists connected physical Apple devices (with UDIDs) and iOS simulators via `devicectl` |
| `npm run ios:device -- <name\|udid>` | — | Builds web assets and deploys directly to a physical device or simulator without opening Xcode (supports `--no-sync`) |
| `cd ios && fastlane sync_web` | `fastlane sync_web` | Builds Vite (`VITE_WS_URL` defaulting to `wss://sudoku-ws.fraha.dev/connection/websocket`) and runs `cap sync ios` |
| `cd ios && fastlane simulator` | `fastlane simulator` | Builds unsigned Debug app for `generic/platform=iOS Simulator` (no paid Apple Developer account needed) |
| `cd ios && fastlane register_app` | `fastlane register_app` | Registers Bundle ID and App Store Connect entry via `produce` (`APP_LANGUAGE` defaults to `English`) |
| `npm run ios:archive` | `fastlane archive` | Builds and exports a signed App Store IPA to `ios/App/build/SudokuLive.ipa` |
| `npm run ios:testflight` | `fastlane beta` | Auto-bumps `CURRENT_PROJECT_VERSION` above local & remote TestFlight, builds IPA, and uploads to TestFlight |

Direct device deploy examples:

```bash
npm run ios:devices
npm run ios:device -- haPhone
npm run ios:device -- haPhone --no-sync
```

Optional lane flags:
- `skip_web:true` — Skip Vite build + `cap sync ios` when `ios/App/App/public` is already up to date.
- `skip_bump:true` — Keep the current `CURRENT_PROJECT_VERSION` during `beta`.
- `wait:true` — Wait for App Store Connect build processing to finish.

---

## Authentication Options

1. **App Store Connect API Key (recommended for CI & passwordless uploads)**:
   - Set `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_KEY_FILEPATH` (or `ASC_KEY_CONTENT` + `ASC_KEY_CONTENT_IS_BASE64=true`).
   - `Fastfile` passes `-authenticationKeyPath`, `-authenticationKeyID`, and `-authenticationKeyIssuerID` directly to `xcodebuild` for automatic signing.
2. **Xcode / Apple ID Fallback**:
   - If no ASC API key or `FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD` is set, `beta` falls back to `xcodebuild -exportArchive` using the local Xcode account session.

---

## WebSocket Origins for Capacitor iOS

In production, `WKWebView` loads assets from `capacitor://localhost`. Ensure Centrifugo's `CENTRIFUGO_CLIENT_ALLOWED_ORIGINS` includes:

```text
https://sudoku.fraha.dev capacitor://localhost https://localhost http://localhost
```

## Duo simulator verification

The iOS 27.2 Duo simulator build/launch smoke test and remaining interactive QA limitations are recorded in [GitHub issue #45](https://github.com/hapheus/sudoku-shift/issues/45). Multi-display screenshot capture requires an explicit display selector; a successful launch does not certify fold/unfold or rotation behavior.
