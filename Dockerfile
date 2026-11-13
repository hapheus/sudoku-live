# ==============================================================================
# Stage 1: Build Frontend Assets
# ==============================================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY resources resources
COPY vite.config.js ./

RUN npm run build

# ==============================================================================
# Stage 2: Production PHP Runtime
# ==============================================================================
FROM php:8.4-cli-alpine

# Install required system packages and PHP extension build dependencies
RUN apk add --no-cache \
    sqlite \
    sqlite-dev \
    sqlite-libs \
    supervisor \
    curl \
    bash \
    libzip-dev \
    && docker-php-ext-install \
    pdo_sqlite \
    pcntl \
    posix \
    bcmath \
    zip \
    && rm -rf /var/cache/apk/*

# Install Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Copy application source code
COPY . .

# Copy compiled frontend assets from frontend-builder
COPY --from=frontend-builder /app/public/build ./public/build

# Install PHP dependencies without dev dependencies
RUN composer install --no-dev --optimize-autoloader --no-interaction

# Configure supervisor and entrypoint
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Ensure storage directories exist
RUN mkdir -p storage/framework/cache/data \
    storage/framework/sessions \
    storage/framework/views \
    storage/logs \
    bootstrap/cache \
    database

# Expose HTTP port (8000) and Reverb WebSocket port (8080)
EXPOSE 8000 8080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
