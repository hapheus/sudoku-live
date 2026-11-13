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

RUN apk add --no-cache curl

COPY --from=frontend-builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
