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
echo "=== Lemon Squeezy env (api container) ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api sh -c '
  echo "STORE=${LEMONSQUEEZY_STORE_ID:-MISSING}"
  echo "PAYG=${LEMONSQUEEZY_VARIANT_PAYG:-MISSING}"
  echo "SUB=${LEMONSQUEEZY_VARIANT_SUBSCRIPTION:-MISSING}"
  test -n "${LEMONSQUEEZY_API_KEY:-}" && echo "API_KEY=set" || echo "API_KEY=MISSING"
' 2>/dev/null || echo "(api not running)"

echo ""
echo "=== Lemon Squeezy API ping (store lookup) ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api node -e "
const storeId = process.env.LEMONSQUEEZY_STORE_ID;
const key = process.env.LEMONSQUEEZY_API_KEY;
if (!storeId || !key) { console.log('skip — missing STORE or API_KEY'); process.exit(0); }
fetch('https://api.lemonsqueezy.com/v1/stores/' + storeId, {
  headers: { Authorization: 'Bearer ' + key, Accept: 'application/vnd.api+json' }
}).then(async (r) => {
  const text = await r.text();
  console.log('HTTP', r.status, text.slice(0, 400));
}).catch((e) => console.error(String(e)));
" 2>/dev/null || echo "(api not running)"

echo ""
echo "=== Lemon Squeezy variants (PAYG + subscription) ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api node -e "
async function check(id, label) {
  const key = process.env.LEMONSQUEEZY_API_KEY;
  if (!id || !key) { console.log(label, 'MISSING'); return; }
  const r = await fetch('https://api.lemonsqueezy.com/v1/variants/' + id, {
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/vnd.api+json' }
  });
  const text = await r.text();
  console.log(label, 'HTTP', r.status, text.slice(0, 280));
}
await check(process.env.LEMONSQUEEZY_VARIANT_PAYG, 'PAYG');
await check(process.env.LEMONSQUEEZY_VARIANT_SUBSCRIPTION, 'SUB');
" 2>/dev/null || echo "(api not running)"

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
