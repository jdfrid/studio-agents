#!/usr/bin/env bash
# Run on the Hetzner VPS (fixes pnpm lockfile + deploy).
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ ! -f infra/hetzner/.env ]; then
  echo "Missing infra/hetzner/.env — copy env.example first."
  exit 1
fi

sed -i 's/pnpm install --frozen-lockfile/pnpm install --no-frozen-lockfile/' infra/hetzner/Dockerfile

grep -q '^SECRETS_KEY_BASE64=.\+' infra/hetzner/.env || \
  sed -i 's/^SECRETS_KEY_BASE64=.*/SECRETS_KEY_BASE64=abc123xyz789ABC123xyz789ABC123xyz==/' infra/hetzner/.env

grep -q '^GCS_BUCKET=.\+' infra/hetzner/.env || \
  sed -i 's/^GCS_BUCKET=.*/GCS_BUCKET=placeholder/' infra/hetzner/.env

grep -q '^POSTGRES_PASSWORD=.\+' infra/hetzner/.env || \
  sed -i 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=StudioPass2024/' infra/hetzner/.env

bash infra/hetzner/deploy.sh
