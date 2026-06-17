#!/bin/sh
set -e

echo "Running database migrations..."
pnpm prisma:deploy

echo "Seeding demo tenant..."
pnpm prisma:seed

echo "Starting API..."
exec pnpm --filter @studio/api start
