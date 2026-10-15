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
echo "=== Creem env (api container; values hidden) ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api sh -c '
  for v in CREEM_API_KEY CREEM_WEBHOOK_SECRET CREEM_PRODUCT_PAYG CREEM_PRODUCT_MONTHLY CREEM_PRODUCT_YEARLY; do
    eval "val=\${$v:-}"
    test -n "$val" && echo "$v=set" || echo "$v=MISSING"
  done
  case "${CREEM_API_KEY:-}" in creem_test_*) echo "MODE=sandbox";; creem_*) echo "MODE=production";; *) echo "MODE=none";; esac
  echo "PAYMENTS_ENABLED=${PAYMENTS_ENABLED:-unset}"
' 2>/dev/null || echo "(api not running)"

echo ""
echo "=== Creem products ==="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T api node -e "
const key = process.env.CREEM_API_KEY;
const base = key && key.startsWith('creem_test_') ? 'https://test-api.creem.io' : 'https://api.creem.io';
async function check(id, label) {
  if (!id || !key) { console.log(label, 'MISSING'); return; }
  const r = await fetch(base + '/v1/products?product_id=' + encodeURIComponent(id), { headers: { 'x-api-key': key } });
  const json = await r.json().catch(() => ({}));
  console.log(label, 'HTTP', r.status, json.name ?? '', json.price ?? '', json.currency ?? '', json.billing_period ?? '');
}
await check(process.env.CREEM_PRODUCT_PAYG, 'PAYG');
await check(process.env.CREEM_PRODUCT_MONTHLY, 'MONTHLY');
await check(process.env.CREEM_PRODUCT_YEARLY, 'YEARLY');
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
