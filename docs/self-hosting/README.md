# Self-Hosting in Docker Showcase

Sudoku Live runs as a **zero-database, two-container stack**:
1. **`app`**: Lightweight `nginx:1.27-alpine` serving the React + Vite SPA on port `8000`, with startup runtime configuration via `/env-config.js`.
2. **`centrifugo`**: Official `centrifugo/centrifugo:v6` real-time WebSocket server on port `8080` (mapped to `8081` locally).

---

## Architecture & Runtime Config Pattern

```text
                    ┌──────────────────────────────────────────┐
Browser / iOS ─────►│ Reverse Proxy / Cloudflare Tunnel (TLS)  │
                    └───────────────┬──────────────────┬───────┘
                                    │                  │
                          https://sudoku...   wss://sudoku-ws...
                                    │                  │
                                    ▼                  ▼
                          ┌──────────────────┐ ┌───────────────┐
                          │ app (nginx:8000) │ │ centrifugo    │
                          │ /env-config.js   │ │ (:8080)       │
                          │ /up (health)     │ │ /health       │
                          └──────────────────┘ └───────────────┘
```

### Build Once, Run Anywhere (`/env-config.js`)
[`docker/entrypoint.sh`](../../docker/entrypoint.sh) generates `/usr/share/nginx/html/env-config.js` from container environment variables on every startup (`WS_HOST`, `WS_PORT`, `WS_SCHEME`, `WS_URL`, `PUBLIC_APP_URL`).
[`docker/nginx.conf`](../../docker/nginx.conf) serves `/env-config.js` with `Cache-Control: no-store, no-cache, must-revalidate` while caching hashed `/assets/` for 1 year (`immutable`).

---

## Quick Start (Local / LAN)

```bash
# 1. Start both containers
npm run docker:up

# 2. Validate Compose files anytime
npm run docker:config

# 3. Stop containers
npm run docker:down
```

- Web SPA: `http://localhost:8000` (healthcheck: `http://localhost:8000/up`)
- Centrifugo WebSocket: `ws://localhost:8081/connection/websocket` (healthcheck: `http://localhost:8081/health`)

---

## Production Deployment (`compose.prod.yml`)

[`compose.prod.yml`](../../compose.prod.yml) is pre-configured for `cf-docker-tunnel-sync` over an external `cf-tunnel-net` Docker network:

```bash
cp .env.prod.example .env
# Edit DOMAIN_NAME or endpoints if not using fraha.dev
docker compose -f compose.prod.yml up -d --build
```

### Using Caddy or Traefik Instead of Cloudflare Tunnel
Route two hostnames to the internal container ports:
- `sudoku.example.com` → `app:8000`
- `sudoku-ws.example.com` → `centrifugo:8080`

Then set in `.env`:
```dotenv
WS_HOST=sudoku-ws.example.com
WS_PORT=443
WS_SCHEME=https
PUBLIC_APP_URL=https://sudoku.example.com
CENTRIFUGO_CLIENT_ALLOWED_ORIGINS="https://sudoku.example.com capacitor://localhost https://localhost http://localhost"
```

---

## Security & Hardening Notes

- **Centrifugo Admin UI**: Disabled by default in [`docker/centrifugo/config.json`](../../docker/centrifugo/config.json) (`"admin": { "enabled": false }`) so no default passwords are shipped. Enable only when needed via `CENTRIFUGO_ADMIN_ENABLED=true`, `CENTRIFUGO_ADMIN_PASSWORD`, and `CENTRIFUGO_ADMIN_SECRET`.
- **Origin Allowlist**: Restrict `CENTRIFUGO_CLIENT_ALLOWED_ORIGINS` in production to your web domain and Capacitor iOS origins (`capacitor://localhost`, `https://localhost`, `http://localhost`).
- **Nginx Headers**: [`docker/nginx.conf`](../../docker/nginx.conf) sets `server_tokens off`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `X-Frame-Options: SAMEORIGIN`.
