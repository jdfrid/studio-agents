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
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate api worker web
echo "Restarting web so nginx picks up api container..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart web
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo ""
echo "Studio Agents is up. Open http://$(curl -fsS ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
