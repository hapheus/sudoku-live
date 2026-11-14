# ==============================================================================
# Stage 1: Build React + Vite Frontend Assets
# ==============================================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY public public
COPY src src

RUN npm run build

# ==============================================================================
# Stage 2: Lightweight Nginx Static Web Runtime
# ==============================================================================
FROM nginx:1.27-alpine

LABEL org.opencontainers.image.title="Sudoku Live" \
      org.opencontainers.image.description="Zero-backend Sudoku SPA with real-time Centrifugo WebSocket co-op and spectator mode" \
      org.opencontainers.image.source="https://github.com/hapheus/sudoku-live" \
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
