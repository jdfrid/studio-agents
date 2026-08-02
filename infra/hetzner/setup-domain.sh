#!/usr/bin/env bash
# Optional: HTTPS via Caddy on the host (Docker web on 8080).
# Run on Hetzner after DNS points to this server.
set -euo pipefail

DOMAIN="${1:-prompt2spot.com}"
ADMIN_DOMAIN="admin.${DOMAIN}"

echo "=== Domain setup for ${DOMAIN} ==="
echo "1. Ensure GoDaddy A records point @ and www and admin to this server IP"
echo "2. Update infra/hetzner/.env: APP_URL=https://${DOMAIN}, ADMIN_URL=https://${ADMIN_DOMAIN}"
echo ""

if ! command -v caddy >/dev/null 2>&1; then
  echo "Installing Caddy..."
  apt-get update && apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update && apt-get install -y caddy
fi

# Move docker web to 8080 if still on 80 (exact match — avoid turning 8080 into 808080)
ENV_FILE="${ENV_FILE:-infra/hetzner/.env}"
if [ -f "$ENV_FILE" ]; then
  if grep -q '^HTTP_PORT=808080$' "$ENV_FILE"; then
    sed -i 's/^HTTP_PORT=808080$/HTTP_PORT=8080/' "$ENV_FILE"
    echo "Fixed typo HTTP_PORT=808080 → 8080 in $ENV_FILE"
  elif grep -q '^HTTP_PORT=80$' "$ENV_FILE"; then
    sed -i 's/^HTTP_PORT=80$/HTTP_PORT=8080/' "$ENV_FILE"
    echo "Set HTTP_PORT=8080 in $ENV_FILE"
  fi
fi

# User app on 8080, admin SPA on 8081 (docker maps ADMIN_HTTP_PORT→81).
# Keep Host headers so cookies / redirects stay on the correct subdomain.
tee /etc/caddy/Caddyfile <<EOF
${DOMAIN}, www.${DOMAIN} {
    reverse_proxy localhost:8080 {
        header_up Host {host}
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-Proto {scheme}
    }
}

${ADMIN_DOMAIN} {
    reverse_proxy localhost:8081 {
        header_up Host {host}
        header_up X-Forwarded-Host {host}
        header_up X-Forwarded-Proto {scheme}
    }
}
EOF

systemctl enable caddy
if ! systemctl is-active --quiet caddy; then
  echo "Starting Caddy (ensure Docker web is on 8080, not 80 — run deploy.sh first if needed)..."
  systemctl start caddy || true
fi
systemctl reload caddy 2>/dev/null || systemctl restart caddy

echo ""
echo "Done. Caddy will obtain Let's Encrypt certificates automatically."
echo "Verify: https://${DOMAIN} and https://${ADMIN_DOMAIN}"
