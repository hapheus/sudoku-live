# ==============================================================================
# Stage 1: Build React + Vite Frontend Assets
# ==============================================================================
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS frontend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY scripts/bot-exclusion.mjs scripts/bot-exclusion.mjs
COPY public public
COPY src src

RUN npm run build

# ==============================================================================
# Stage 2: Lightweight Nginx Static Web Runtime
# ==============================================================================
FROM nginx:1.31-alpine@sha256:fed7e14be83cbd2661a75cdc5b872d936cf155d46c327084d30b8df19ae88d72

LABEL org.opencontainers.image.title="Sudoku Shift" \
      org.opencontainers.image.description="Runnable Sudoku Shift SPA container (Game Off 2026) with real-time Centrifugo WebSocket co-op and spectator mode" \
      org.opencontainers.image.source="https://github.com/hapheus/sudoku-shift" \
      org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"

RUN apk add --no-cache curl

COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/up || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
