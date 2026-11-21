# Knockd website (static, served by nginx). Build from the repo root (it uses packages/shared):
#   docker build -f apps/web/Dockerfile --build-arg VITE_AUTH0_CLIENT_ID=... .
# Vite bakes the VITE_* values into the build, so they're build arguments, not runtime env.

FROM node:22-slim AS build
ENV HUSKY=0 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter "@knockd/web..."

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web

ARG VITE_API_URL=https://api.knockd.rodeo
ARG VITE_AUTH0_DOMAIN=dev-38gdunm50atj1prl.us.auth0.com
ARG VITE_AUTH0_AUDIENCE=https://api.knockd.rodeo
ARG VITE_AUTH0_CLIENT_ID
ENV VITE_API_URL=$VITE_API_URL \
    VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN \
    VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE \
    VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID
RUN pnpm --filter @knockd/web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
