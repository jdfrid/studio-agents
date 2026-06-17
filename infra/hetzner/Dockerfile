# syntax=docker/dockerfile:1
# Debian slim: ffmpeg-static ships glibc binaries (Alpine/musl breaks mux jobs).
FROM node:20-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY infra/prisma ./infra/prisma

RUN pnpm install --frozen-lockfile
RUN pnpm prisma:generate \
  && pnpm --filter @studio/api... build \
  && pnpm --filter @studio/worker... build \
  && pnpm --filter @studio/web... build

FROM node:20-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app /app

COPY infra/hetzner/entrypoint-api.sh /entrypoint-api.sh
RUN chmod +x /entrypoint-api.sh

FROM runtime AS api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint-api.sh"]

FROM runtime AS worker
CMD ["pnpm", "--filter", "@studio/worker", "start"]

FROM nginx:1.27-alpine AS web
COPY infra/hetzner/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
