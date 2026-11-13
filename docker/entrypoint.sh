#!/bin/sh
set -e

cd /var/www/html

# Initialize .env if missing
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
fi

# Synchronize key Docker environment variables to .env so php-cli / php -S see them identically
if [ -n "$REVERB_APP_KEY" ]; then
    sed -i "s/^REVERB_APP_KEY=.*/REVERB_APP_KEY=$REVERB_APP_KEY/" .env 2>/dev/null || echo "REVERB_APP_KEY=$REVERB_APP_KEY" >> .env
fi
if [ -n "$REVERB_APP_SECRET" ]; then
    sed -i "s/^REVERB_APP_SECRET=.*/REVERB_APP_SECRET=$REVERB_APP_SECRET/" .env 2>/dev/null || echo "REVERB_APP_SECRET=$REVERB_APP_SECRET" >> .env
fi
if [ -n "$REVERB_APP_ID" ]; then
    sed -i "s/^REVERB_APP_ID=.*/REVERB_APP_ID=$REVERB_APP_ID/" .env 2>/dev/null || echo "REVERB_APP_ID=$REVERB_APP_ID" >> .env
fi

# Ensure APP_KEY exists
if ! grep -q "APP_KEY=base64:" .env && [ -z "$APP_KEY" ]; then
    echo "Generating application key..."
    php artisan key:generate --force
fi

# Ensure SQLite file exists
mkdir -p database
if [ ! -f database/database.sqlite ]; then
    echo "Initializing database.sqlite..."
    touch database/database.sqlite
fi

# Set proper ownership and permissions
chown -R www-data:www-data storage bootstrap/cache database
chmod -R 775 storage bootstrap/cache database

# Run database migrations
echo "Running migrations..."
php artisan migrate --force

echo "Starting Web server and Reverb WebSocket server..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
