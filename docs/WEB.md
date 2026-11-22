# Knockd Web

The website at **https://knockd.rodeo**: team maps, stats, highlights and notes, "where next?". What it does is in the [README](../README.md#web-app-phase-2); the API it calls is in [API.md](API.md).

> **Built:** sign-in, your teams (and making one), invite links, and the team map: maps as tabs, lead-rate blocks, fading paths, A/B leads, highlights and notes, stats, recent sessions, a time slider, and people (invite, roles, remove, leave). Owners and editors mark the map: **Highlight a road** (drag along streets), **Circle an area** (drag a loop; one that crosses itself is saved as its outline), **Add a note** (click, up to 140 characters), and delete any of them from its popup. **Not yet:** "where next?", session replay.

## Look

Map-first, like a ride app: the map fills the screen and everything else floats on it in white cards with big rounded corners, bold Inter type, pill buttons and one pink accent (`--accent` in [src/styles.css](../apps/web/src/styles.css), where all the design tokens live). On phones the side panel becomes a bottom sheet. **Dark mode** follows the computer's setting until you click the moon/sun button, which flips light and dark (remembered in the browser). The dark map comes from `/tiles/style-dark.json`, and the map layers switch to light lines on the dark basemap ([src/theme.ts](../apps/web/src/theme.ts), `themed()` in [src/map/layers.ts](../apps/web/src/map/layers.ts)).

## Screens

| Route                        | Screen                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| (signed out)                 | Landing: the map behind one card with Log in / Create an account                     |
| `/`                          | Your teams, and starting a new one                                                   |
| `/invite/:token`             | Joins the team from an invite link (after signing in, if needed), then opens its map |
| `/teams/:teamId/maps/:mapId` | The team map. `/teams/:teamId` opens the first map                                   |

On the team map, the selected map's session data (worked blocks with their outlines, paths, leads) loads once and stays put while you pan and zoom; it reloads only when the map, time slider or light/dark changes. Block colours compare the map's blocks (worst red, middle yellow, best green; grey until 15 houses are worked), because real lead rates are small (a few %) and fixed thresholds would paint everything red. Paths fade by duration × age using the team's `fadeDays`.

## Stack

- **Vite + React + TypeScript** in `apps/web`, a plain single-page app (no server of its own)
- **MapLibre GL JS** with our basemap: `https://api.knockd.rodeo/tiles/style.json` (the same map library as the phone)
- **Auth0** (`@auth0/auth0-react`) for login. Account tokens go to the API as `Authorization: Bearer …`
- **Types** from `@knockd/shared`, the same request/response types the server and phone use, e.g. `api<GetMeRes>("/v1/me")`

## Files

```
apps/web/
  src/
    main.tsx      router + Auth0 (returns you to the page you opened after login)
    App.tsx       routes
    styles.css    design tokens and components (buttons, pills, cards, panel, time bar)
    ui.tsx        small shared pieces (Logo, Avatar, Stat, Modal, formatting)
    MapView.tsx   useMap(): MapLibre with our basemap (light/dark), middle-button drag to pan
    theme.ts      light/dark mode: follows the computer until the moon/sun button is used
    map/layers.ts team map layers: blocks, paths, leads, highlights, notes
    map/draw.ts   freehand highlighter strokes and loops, note clicks
    pages/        Landing, Teams, AcceptInvite, TeamMap, MembersDialog
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
5. **Let it call the API.** Applications → APIs → Knockd API (`https://api.knockd.rodeo`) → **Application Access** → Knockd Web → Edit → **User Access: Authorized**. Without this, sign-in fails with _Client "…" is not authorized to access resource server "https://api.knockd.rodeo"_

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
