# Knockd API. Build from the repo root (the server depends on packages/shared):
#   docker build -f apps/server/Dockerfile .
FROM node:22-slim

ENV HUSKY=0 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# Install dependencies first so they're cached between builds when only code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter "@knockd/server..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server

WORKDIR /app/apps/server
ENV NODE_ENV=production \
    PORT=3000
EXPOSE 3000

# Apply any new database migrations, then start. `exec` so the server receives SIGTERM on redeploys.
CMD ["sh", "-c", "pnpm db:migrate && exec node --import tsx src/index.ts"]
