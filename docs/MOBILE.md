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
- API reference: [API.md](API.md). Request/response types: `@knockd/shared`
