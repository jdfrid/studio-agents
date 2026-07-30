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

# Move docker web to 8080 if still on 80
ENV_FILE="${ENV_FILE:-infra/hetzner/.env}"
if [ -f "$ENV_FILE" ] && grep -q '^HTTP_PORT=80' "$ENV_FILE"; then
  sed -i 's/^HTTP_PORT=80/HTTP_PORT=8080/' "$ENV_FILE"
  echo "Set HTTP_PORT=8080 in $ENV_FILE — redeploy docker stack"
fi

tee /etc/caddy/Caddyfile <<EOF
${DOMAIN}, www.${DOMAIN} {
    reverse_proxy localhost:8080
}

${ADMIN_DOMAIN} {
    reverse_proxy localhost:8080
}
EOF

systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

echo ""
echo "Done. Caddy will obtain Let's Encrypt certificates automatically."
echo "Verify: https://${DOMAIN} and https://${ADMIN_DOMAIN}"
