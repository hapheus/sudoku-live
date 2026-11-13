#!/bin/sh
set -e

cd /var/www/html

# Initialize .env if missing
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
fi

# Synchronize key Docker environment variables to .env so php-fpm & artisan CLI see them identically
sync_env() {
    key="$1"
    val="$2"
    if [ -n "$val" ]; then
        if grep -q "^${key}=" .env 2>/dev/null; then
            sed -i "s|^${key}=.*|${key}=${val}|" .env
        else
            echo "${key}=${val}" >> .env
        fi
    fi
}

sync_env APP_ENV "$APP_ENV"
sync_env APP_DEBUG "$APP_DEBUG"
sync_env APP_KEY "$APP_KEY"
sync_env APP_URL "$APP_URL"
sync_env SESSION_DRIVER "$SESSION_DRIVER"
sync_env SESSION_SECURE_COOKIE "$SESSION_SECURE_COOKIE"
sync_env BROADCAST_CONNECTION "$BROADCAST_CONNECTION"
sync_env CACHE_STORE "$CACHE_STORE"
sync_env QUEUE_CONNECTION "$QUEUE_CONNECTION"
sync_env REVERB_APP_KEY "$REVERB_APP_KEY"
sync_env REVERB_APP_SECRET "$REVERB_APP_SECRET"
sync_env REVERB_APP_ID "$REVERB_APP_ID"
sync_env REVERB_HOST "$REVERB_HOST"
sync_env REVERB_PORT "$REVERB_PORT"
sync_env REVERB_SERVER_HOST "$REVERB_SERVER_HOST"
sync_env REVERB_SERVER_PORT "$REVERB_SERVER_PORT"
sync_env REVERB_SCHEME "$REVERB_SCHEME"
sync_env REVERB_PUBLIC_HOST "$REVERB_PUBLIC_HOST"
sync_env REVERB_PUBLIC_PORT "$REVERB_PUBLIC_PORT"
sync_env REVERB_PUBLIC_SCHEME "$REVERB_PUBLIC_SCHEME"
sync_env REVERB_ALLOWED_ORIGINS "$REVERB_ALLOWED_ORIGINS"

# Ensure APP_KEY exists
if ! grep -q "APP_KEY=base64:" .env && [ -z "$APP_KEY" ]; then
    echo "Generating application key..."
    php artisan key:generate --force
fi

# Set proper ownership and permissions
chown -R www-data:www-data storage bootstrap/cache
chmod -R 775 storage bootstrap/cache

if [ "$APP_ENV" = "production" ]; then
    php artisan config:cache
    php artisan route:cache
    php artisan view:cache
fi

if [ "$#" -gt 0 ]; then
    echo "Starting custom container process: $*"
    exec "$@"
fi

echo "Starting Nginx + PHP-FPM web server..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
