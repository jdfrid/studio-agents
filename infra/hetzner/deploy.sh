#!/usr/bin/env bash
# Build and start the full stack. Run from repo root on the Hetzner VPS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git pull --ff-only || true
fi

ENV_FILE="infra/hetzner/.env"
COMPOSE_FILE="infra/hetzner/docker-compose.yml"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy infra/hetzner/env.example and fill in secrets."
  exit 1
fi

if [ ! -f /swapfile ]; then
  echo "Adding 2G swap for Docker build..."
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache --progress=plain api
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache --progress=plain worker
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build web
# Ensure admin port is published (Caddy routes admin.* → 8081)
if ! grep -q '^ADMIN_HTTP_PORT=' "$ENV_FILE" 2>/dev/null; then
  echo "ADMIN_HTTP_PORT=8081" >> "$ENV_FILE"
  echo "Added ADMIN_HTTP_PORT=8081 to $ENV_FILE"
fi

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate api worker web
echo "Restarting web so nginx picks up api container..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart web
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

# Refresh Caddy admin→8081 routing when Caddy is installed
if command -v caddy >/dev/null 2>&1 && [ -f /etc/caddy/Caddyfile ]; then
  if grep -q 'localhost:8080' /etc/caddy/Caddyfile && ! grep -q 'localhost:8081' /etc/caddy/Caddyfile; then
    echo "Updating Caddyfile so admin.* proxies to port 8081..."
    bash "$(dirname "$0")/setup-domain.sh" prompt2spot.com || true
  fi
fi

echo "Studio Agents is up."
echo "  Git HEAD: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo "  User app:  http://prompt2spot.com (or http://$(curl -fsS ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'))"
echo "  Admin app: http://admin.prompt2spot.com (docker port ${ADMIN_HTTP_PORT:-8081})"
echo ""
echo "If deploy was run elsewhere: on this VPS use: cd ~/studio-agents && git pull && bash infra/hetzner/deploy.sh"
