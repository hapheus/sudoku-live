#!/bin/sh
set -e

HTML_DIR="/usr/share/nginx/html"

# Generate runtime configuration so one container image works across environments/domains
cat > "${HTML_DIR}/env-config.js" <<EOF
window.__APP_CONFIG__ = {
  wsHost: "${WS_HOST:-}",
  wsPort: "${WS_PORT:-}",
  wsScheme: "${WS_SCHEME:-}",
  wsUrl: "${WS_URL:-}",
  publicAppUrl: "${PUBLIC_APP_URL:-}"
};
EOF

echo "Starting Nginx static SPA server on port 8000..."
exec nginx -g "daemon off;"
