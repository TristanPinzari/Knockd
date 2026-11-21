# Knockd Web

The website at **https://knockd.rodeo**: team maps, stats, highlights and notes, "where next?". What it does is in the [README](../README.md#web-app-phase-2); the API it calls is in [API.md](API.md).

> **Status:** skeleton only. It signs in with Auth0, calls `GET /v1/me` and shows our London basemap. The screens come once the design is agreed.

## Stack

- **Vite + React + TypeScript** in `apps/web`, a plain single-page app (no server of its own)
- **MapLibre GL JS** with our basemap: `https://api.knockd.rodeo/tiles/style.json` (the same map library as the phone)
- **Auth0** (`@auth0/auth0-react`) for login. Account tokens go to the API as `Authorization: Bearer …`
- **Types** from `@knockd/shared`, the same request/response types the server and phone use, e.g. `api<GetMeRes>("/v1/me")`

## Files

```
apps/web/
  src/
    main.tsx      Auth0 provider + app root
    App.tsx       skeleton page (replace with the real screens)
    MapView.tsx   full-size MapLibre map with our basemap
    api.ts        useApi(): fetch with the signed-in user's token, typed errors
    config.ts     VITE_* settings from .env
  Dockerfile      build → nginx (for Coolify)
  nginx.conf      serves the single-page app
```

## Running locally

1. `cp apps/web/.env.example apps/web/.env` and fill in `VITE_AUTH0_CLIENT_ID` (see Auth0 below)
2. `pnpm --filter @knockd/web dev` → http://localhost:5173

It uses the live API by default. To use a local server instead, set `VITE_API_URL=http://localhost:3000`.

`pnpm check` from the repo root also typechecks and lints the web app. `pnpm --filter @knockd/web build` makes a production build in `apps/web/dist/`.

## One-time setup

### Auth0: an application for the website

The website needs its own Auth0 application (the phone's is a Native app with different callback URLs).

1. Auth0 dashboard → **Applications → Create Application** → name "Knockd Web", type **Single Page Web Applications**
2. In its **Settings**, add both addresses (comma-separated) to:
   - **Allowed Callback URLs:** `https://knockd.rodeo, http://localhost:5173`
   - **Allowed Logout URLs:** `https://knockd.rodeo, http://localhost:5173`
   - **Allowed Web Origins:** `https://knockd.rodeo, http://localhost:5173`
3. **Advanced Settings → Grant Types**: make sure **Refresh Token** is ticked, and under **Refresh Token Rotation** turn rotation on (the site keeps people signed in with refresh tokens)
4. Copy the **Client ID** into `VITE_AUTH0_CLIENT_ID` (local `.env`, and the Coolify build argument below). It isn't secret
5. If the API (`https://api.knockd.rodeo`) has an application access policy for user tokens, allow the new application there too

### DNS

At Porkbun, add an **A record for `knockd.rodeo`** (the bare domain, host left empty) pointing at the Vultr VM, the same IP as `api.knockd.rodeo`. Optionally a `www` record too, redirected to the bare domain in Coolify.

### Coolify: the `web` application

1. **+ New → Application**, same GitHub repo, branch `main`
2. Build pack **Dockerfile**, Dockerfile location `apps/web/Dockerfile`, base directory `/` (build context: repo root)
3. **Domain:** `https://knockd.rodeo`. Port **80**
4. **Build arguments** (Vite bakes them into the build, so they're build-time, not runtime): `VITE_AUTH0_CLIENT_ID=<the new client ID>`. `VITE_API_URL`, `VITE_AUTH0_DOMAIN` and `VITE_AUTH0_AUDIENCE` already default to production in the Dockerfile
5. Deploy. Like the API, it redeploys on every push to `main`

### API: allow the website (optional)

The API's `CORS_ORIGINS` defaults to `*`, which already works. To lock it down, set it on the `api` application in Coolify to `https://knockd.rodeo,http://localhost:5173`.
