# Sudoku Shift

Runnable Docker container for **Sudoku Shift** — a zero-backend 9×9 and 6×6 Sudoku SPA with real-time Co-op and Spectator mode, built with React 19, Vite 8, and Nginx (port `8000`).

Created for **[GitHub Game Off 2026](https://itch.io/jam/game-off-2026)**.

Play in your browser on **[itch.io](https://hapheus.itch.io/sudoku-shift)** or download the iPhone and iPad app from the **[App Store](https://apps.apple.com/app/sudoku-shift/id6834748729)**.

## Quick Start

Solo mode works out of the box. For live **Co-op** and **Watch/Spectator** mode, a **Centrifugo v6** WebSocket server is required and can be passed directly via Docker environment variables.

### Single Container (with external Centrifugo)

```bash
docker run -d \
  --name sudoku-shift \
  -p 8000:8000 \
  -e WS_URL="wss://your-centrifugo-host/connection/websocket" \
  hapheus/sudoku-shift:latest
```

Then open `http://localhost:8000`.

### Docker Compose (App + Centrifugo v6)

```yaml
services:
  app:
    image: hapheus/sudoku-shift:latest
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      WS_HOST: "localhost"
      WS_PORT: "8081"
      WS_SCHEME: "http"
      # Or set the full WebSocket URL directly:
      # WS_URL: "wss://sudoku-ws.example.com/connection/websocket"

  centrifugo:
    image: centrifugo/centrifugo:v6
    restart: unless-stopped
    ports:
      - "8081:8080"
    volumes:
      - ./docker/centrifugo/config.json:/centrifugo/config.json:ro
    environment:
      CENTRIFUGO_CLIENT_ALLOWED_ORIGINS: "*"
```

> See [`docker/centrifugo/config.json`](https://github.com/hapheus/sudoku-shift/blob/main/docker/centrifugo/config.json) in the repository for the required Centrifugo namespace configuration (`sudoku` and `app`).

## Environment Variables

At container startup, `entrypoint.sh` writes `/usr/share/nginx/html/env-config.js` so one image works across environments without rebuilding:

| Variable | Description | Example |
|---|---|---|
| `WS_URL` | Full Centrifugo WebSocket endpoint (overrides `WS_HOST`/`WS_PORT`/`WS_SCHEME`) | `wss://sudoku-ws.example.com/connection/websocket` |
| `WS_HOST` | Centrifugo hostname | `localhost` |
| `WS_PORT` | Centrifugo port | `8081` |
| `WS_SCHEME` | `http` (`ws://`) or `https` (`wss://`) | `https` |
| `PUBLIC_APP_URL` | Optional public base URL for share/invite links | `https://sudoku.example.com` |

## Links

- Source & Docs: [github.com/hapheus/sudoku-shift](https://github.com/hapheus/sudoku-shift)
- Game Jam: [itch.io/jam/game-off-2026](https://itch.io/jam/game-off-2026)
