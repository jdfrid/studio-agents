#!/usr/bin/env bash
# Quick billing / free-video diagnostics on the Hetzner VPS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

ENV_FILE="infra/hetzner/.env"
COMPOSE_FILE="infra/hetzner/docker-compose.yml"

echo "=== Git (latest commit) ==="
git log -1 --oneline

echo ""
echo "=== .env FREE_VIDEOS_PER_USER ==="
grep -E '^FREE_VIDEOS_PER_USER=' "$ENV_FILE" || echo "(missing — add FREE_VIDEOS_PER_USER=1)"

echo ""
echo "=== API container env ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api printenv FREE_VIDEOS_PER_USER 2>/dev/null || echo "(api not running)"

echo ""
echo "=== Users and run counts ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  psql -U "${POSTGRES_USER:-studio}" -d "${POSTGRES_DB:-studio_agents}" -c \
  "SELECT u.email, u.id, COUNT(r.id)::int AS runs
   FROM \"User\" u
   LEFT JOIN \"ProjectRun\" r ON r.\"userId\" = u.id
   GROUP BY u.id, u.email
   ORDER BY u.\"createdAt\" DESC;"

echo ""
echo "Expected on latest code: commit message contains 'free first video' or 'Improve billing UX'."
echo "If FREE_VIDEOS=1 and runs=0, /auth/me should show canCreateVideo=true and freeVideosRemaining=1."
