# itch.io HTML5 ZIP Packaging Showcase

Sudoku Live supports building a self-contained, verified **itch.io HTML5 ZIP** (`sudoku-live-itch.zip`) ready for browser embed upload or `butler push`.

---

## Why itch.io Requires a Dedicated Build

itch.io serves HTML5 games inside sandboxed CDN iframes under a nested path (not domain root `/`). Standard SPA builds break unless configured for this environment:

1. **Relative Asset Base (`base: './'`)**:
   - Configured in [`vite.config.js`](../../vite.config.js) when `mode === 'itch'`.
   - Ensures `<script>` and `<link>` tags in `index.html` resolve relative to the iframe URL (`./assets/...` instead of `/assets/...`).
2. **Root-Level `index.html` in the ZIP**:
   - itch.io requires `index.html` at the **root** of the archive, not inside a `dist-itch/` subdirectory.
3. **Iframe & Storage Guards**:
   - `VITE_ITCH_BUILD=true` enables embedded iframe guards in `src/App.jsx` and `src/services/online-game-client.js` so restricted `localStorage`/`sessionStorage` or `history.replaceState` contexts never crash the app.
4. **Explicit WebSocket Endpoint**:
   - Defaults `VITE_WS_URL` to `wss://sudoku-ws.fraha.dev/connection/websocket` so Online Co-op and Watch Live work from the itch.io iframe. Override via `VITE_WS_URL=... npm run build:itch`.

---

## Build & Verify

```bash
# Build dist-itch/, package sudoku-live-itch.zip, and run automated checks
npm run build:itch

# Verify an existing sudoku-live-itch.zip without rebuilding
npm run verify:itch
```

[`scripts/package-itch.mjs`](../../scripts/package-itch.mjs) automatically:
- Builds with `vite build --mode itch` and `VITE_ITCH_BUILD=true`.
- Strips `.DS_Store` and `.map` files from `dist-itch/`.
- Packages `sudoku-live-itch.zip` with `index.html` at the archive root.
- Verifies relative asset paths, root `index.html`, zero junk files, and itch.io's 1,000-file archive limit.

---

## Uploading to itch.io

### Option A: Web Dashboard
1. Create or open your HTML5 project on itch.io.
2. Upload `sudoku-live-itch.zip` and check **This file will be played in the browser**.
3. Recommended embed settings:
   - **Viewport dimensions**: `480 × 820` (portrait) or `960 × 720` (responsive)
   - **Mobile friendly**: Enabled
   - **Fullscreen button**: Enabled

### Option B: `butler` CLI
```bash
butler push sudoku-live-itch.zip <your-username>/sudoku-live:html5
```
