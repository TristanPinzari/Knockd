# Knockd Mobile

## Environment

`apps/mobile/.env` (Expo exposes `EXPO_PUBLIC_*` variables to the app):

```
EXPO_PUBLIC_API_URL=https://api.knockd.rodeo
EXPO_PUBLIC_AUTH0_DOMAIN=dev-38gdunm50atj1prl.us.auth0.com
EXPO_PUBLIC_AUTH0_CLIENT_ID=27uxMSEwhyQwXQnTuRoBmrJlYUhZVGgr
EXPO_PUBLIC_AUTH0_AUDIENCE=https://api.knockd.rodeo
```

None of these are secret (they ship inside the app), but keep `.env` out of git anyway.

- **Bundle ID / package name:** `rodeo.knockd.app`. The Auth0 callback URLs are registered for it:
  `rodeo.knockd.app.auth0://dev-38gdunm50atj1prl.us.auth0.com/ios/rodeo.knockd.app/callback` and the same with `/android/`. If you change the ID, tell Tristan so he updates them in Auth0
- **Login:** request scope `openid profile email offline_access` and the audience above, so the access token works with the API and refresh tokens keep people logged in
- **Two kinds of token:**
  - **Account token** (Auth0 access token): for `/v1/me`, `/v1/teams/...`, `/v1/invites/...`. Optional on `POST /v1/sessions` and `/v1/sessions/join`: send it there to link the session to the account (needed to upload it to a team later)
  - **Session token** (returned by create/join): for everything under `/v1/sessions/:id/...` and the socket (`io(API_URL, { auth: { token } })`)
- **Map style:** `https://api.knockd.rodeo/tiles/style.json` (MapLibre). Tiles are standard XYZ, so offline packs work. See "Map tiles" in [API.md](API.md)
- **Teammates' trails:** load `GET /v1/sessions/:id/trails` on open/reconnect, append points from `positions` socket events, and draw `trailToGeoJSON(memberId, points)` from `@knockd/shared` as a MapLibre line layer styled on `mode` (`knocking` thick, `walking` thin, `driving` faint). No user input needed: speed decides
- **Suggest** runs on the phone, all from `@knockd/shared`. To see what it should look like, open [suggest-viewer.html](suggest-viewer.html) in a browser (routes, two-colour dashes for groups, numbered houses, U-turn badges, the walk to the meeting point):
  1. `suggestInputFromArea(areaCells, selectedHouseIds)` turns the `/area` cells you already have into streets + selected houses
  2. `suggestRoutes({ ...thatInput, memberIds, start, regroup, secondsPerDoor })`: `start` is the car (or the phone's location), `regroup` the optional pin, `secondsPerDoor` from `GET /v1/sessions/:id/door-time`. Takes about 100 to 400 ms for 500 houses (run it when the user taps a button, with a spinner)
  3. Show `options` (best first): `label`, `togetherS` (when everyone's back together), `meetPoint`, and each group's `route` (from the car to their last door), `toMeet` (their walk from there to the meeting point, drawn fainter), `memberIds` and `knocks` (who knocks which door, in order: colour each house by its `memberId` and number it by its place in that person's own list). Move the car and pin markers to `start` and `regroup` (Suggest snaps them onto the nearest street). Warn about `unroutedHouseIds` (houses with no known street) if there are any
  4. Mark every spot where a route turns back on itself (dead ends, one side then the other) with a clear U-turn badge
  5. To swap people between groups, swap `memberIds` (and the `memberId`s in `knocks`) in the option. When one is picked, send every op from `suggestionToPlanOps(option, plan, uuid)` with `plan:edit`, in order
- API reference: [API.md](API.md). Request/response types: `@knockd/shared`

## Running the app

The map needs native code, so use a development build (not Expo Go):

```
cp apps/mobile/.env.example apps/mobile/.env
pnpm install
pnpm -F @knockd/mobile ios        # or: android (first run builds the dev client)
pnpm -F @knockd/mobile start      # later runs: Metro for the dev client
```

Checks: `pnpm -F @knockd/mobile typecheck`, `lint`, `test` (jest-expo for UI/mock/map, vitest for location/realtime/trails).

Screens live in `apps/mobile/app` (expo-router) and use mock data from `src/mock`. The map, realtime and location modules are
reached only through `src/ui/slots.ts`; today it points at placeholders in `src/ui/placeholders`. Live-map variants can be previewed
with `/session?scenario=offline|lead|passed`.
