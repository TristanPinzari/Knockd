# Knockd API. Build from the repo root (the server depends on packages/shared):
#   docker build -f apps/server/Dockerfile .

# ---------- Basemap tiles: London cut from the latest Protomaps world build (~13 MB) ----------
# Docker caches this step, so it only re-downloads when TILES_REFRESH changes.
FROM debian:bookworm-slim AS tiles
ARG PMTILES_VERSION=1.31.2
ARG TILES_REFRESH=2026-11-21
ARG LONDON_BBOX=-81.42,42.82,-81.05,43.10
RUN apt-get update && apt-get install -y --no-install-recommends curl jq ca-certificates \
    && curl -fsSL "https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/go-pmtiles_${PMTILES_VERSION}_Linux_x86_64.tar.gz" \
       | tar -xz -C /usr/local/bin pmtiles \
    && BUILD=$(curl -fsSL https://build-metadata.protomaps.dev/builds.json | jq -r '.[-1].key') \
    && echo "Protomaps build ${BUILD} (refresh ${TILES_REFRESH})" \
    && pmtiles extract "https://build.protomaps.com/${BUILD}" /london.pmtiles --bbox="${LONDON_BBOX}" --maxzoom=15

# ---------- API ----------
FROM node:22-slim

ENV HUSKY=0 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# curl is used by Coolify's healthcheck (GET /health inside the container).
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /app

# Install dependencies first so they're cached between builds when only code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter "@knockd/server..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY --from=tiles /london.pmtiles apps/server/data/tiles/london.pmtiles

WORKDIR /app/apps/server
ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000

# Apply any new database migrations, then start. `exec` so the server receives SIGTERM on redeploys.
CMD ["sh", "-c", "pnpm db:migrate && exec node --import tsx src/index.ts"]
