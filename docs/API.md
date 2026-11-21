# Knockd API

The contract between the backend (Tristan) and the mobile and web apps. Request and response shapes here are a guide. The source of truth will be the Zod schemas in `packages/shared`.

Everything is free for the hackathon. There's no paywall and no endpoint checks a plan or subscription.

---

## Conventions

### Transport

- **REST for every write and every read.** Pings, leads, chat, pins, uploads: all REST. This works from background location tasks (where iOS can suspend WebSockets) and makes the offline queue a simple list of REST calls to retry
- **Socket.io for broadcasts.** The server pushes live changes to everyone in a session. The only client → server socket event is editing the planning draft, since everyone is looking at the screen and edits are frequent
- **Reconnecting:** fetch the snapshot (`GET /v1/sessions/:id`), then listen on the socket again

### Base URL and versioning

All REST endpoints are under `/v1`.

### Auth

Send `Authorization: Bearer <token>` on every request. There are two kinds of token:

- **Account token:** an Auth0 access token. Needed for teams, maps, plans and uploads
- **Guest token:** signed by the server and returned when creating or joining a session. Works only for that session's endpoints. Account users also get a session token when they create or join, which identifies their member in that session

| Marker | Meaning                                                 |
| ------ | ------------------------------------------------------- |
| 🔓     | No auth                                                 |
| 👤     | Account token                                           |
| 🎟️     | Session token (guest or account member of that session) |
| 🛡️     | Account token + team role (admin/owner)                 |

### Format

- JSON in, JSON out. Timestamps are ISO 8601 UTC strings. Coordinates are `{ lat, lng }`. Map geometry is GeoJSON
- Errors use standard HTTP status codes with this body:
  ```json
  { "error": { "code": "session_not_found", "message": "No session with that code" } }
  ```
- Common codes: `400 invalid_request`, `401 unauthorized`, `403 forbidden`, `404 not_found`, `409 conflict`, `409 session_full`, `410 session_ended`

### Idempotency

Anything a phone might create offline has a **client-generated UUID** (`clientId`). Sending the same `clientId` twice is a no-op that returns the existing item. This makes offline retries safe.

### Map cells

Each session has a **planned area** (picked when creating it: pin + radius, or drawn), which is what gets split into blocks for planning. On top of that, the session area grows as the crew walks, using a fixed grid of cells about 1 km across.

- **Cell ID:** `` `${Math.floor(lat * 100)}_${Math.floor(lng * 100)}` ``, e.g. `4298_-8130`. Server and clients compute it the same way
- The phone loads the cells around each member, and fetches new cells when someone gets within about 500 m of an unloaded one
- The cells a session has loaded make up the session area

---

## Me

### `GET /v1/me` 👤

Your profile and teams. Creates your user on the first call.

```ts
→ { user: { id, displayName }, teams: { id, name, role }[] }
```

### `PATCH /v1/me` 👤

```ts
{ displayName } → { user }
```

### `GET /v1/me/sessions` 👤

Your recent sessions, including ones not uploaded yet (kept for 7 days).

```ts
→ { sessions: { id, startedAt, endedAt, status, uploadedTo: teamId[] }[] }
```

---

## Sessions

### `POST /v1/sessions` 🔓 (or 👤)

Create a session. Guests can create sessions. If an Auth0 account token is sent (`Authorization: Bearer <account token>`), the session and your member are linked to your account, which you need to upload it to a team later. Loading team data (`loadMap`) is not built yet.

```ts
{
  displayName: string,
  location: { lat, lng },
  area:                                                                  // the planned area
    | { kind: "circle", center: { lat, lng }, radiusM: number }          // pin + radius (100–3000 m)
    | { kind: "polygon", polygon: GeoJSON Polygon },                     // drawn
  loadMap?: { mapId, layers: ("leads" | "coverage" | "leadRate")[] }   // account only
}
→ { session, joinCode, member, token }
```

### `POST /v1/sessions/join` 🔓 (or 👤)

```ts
{ code: string, displayName: string } → { session, member, token }
```

Errors: `404 session_not_found`, `409 session_full` (8 members max), `410 session_ended`

Optionally send an account token, as with create. A logged-in user who is already in the session (e.g. reinstalled the app) gets their existing member and a fresh token back, with no duplicate.

### `GET /v1/sessions/:id` 🎟️

Snapshot for first load and reconnecting.

```ts
→ {
  session: { id, joinCode, status, startedAt, createdByMemberId, loadedMap? },
  members: { id, displayName, colour, online, lastPosition? }[],
  leads: Lead[],
  pins: Pin[],
  plan: { draft, applied },
  messages: Message[]          // most recent 50
}
```

### `POST /v1/sessions/:id/end` 🎟️

Session admin (the creator) only. Broadcasts `session:ended` and queues processing.

### `POST /v1/sessions/:id/leave` 🎟️

### `DELETE /v1/sessions/:id/members/:memberId` 🎟️

Session admin (the creator) only. Removes a member and invalidates their session token. Broadcasts `member:left`.

### `GET /v1/sessions/:id/area?cells=4298_-8130,4298_-8129` 🎟️

Streets, blocks and houses for the given cells, as GeoJSON. Adds the cells to the session area. The phone caches the result for offline use.

```ts
→ { cells: { id, streets: FeatureCollection, blocks: FeatureCollection, houses: FeatureCollection }[] }
// Feature properties:
//   streets: { streetId, name, lengthM }             (LineString)
//   blocks:  { blockId, houseCount }                 (Polygon)
//   houses:  { houseId, blockId, streetId }          (Polygon, simplified)
```

- Up to 25 cells per request
- Each house belongs to exactly one cell (by its centre). **Streets and blocks that cross a cell edge appear in both cells**, so dedupe by `streetId` / `blockId`
- Send `Accept-Encoding: gzip` (most HTTP clients do by default): a dense 2-cell area is ~275 KB raw, ~47 KB gzipped

### `GET /v1/sessions/:id/layers?cells=...` 🎟️

Loaded team data for the given cells. Empty if no map was loaded. Visible to everyone in the session, guests included.

```ts
→ {
  leads?: { houseId, grade, note, at }[],  // at = last updated
  coverage?: FeatureCollection,          // paths with durationS and lastWorkedAt
  leadRate?: { blockId, rate | null, housesWorked }[]   // null = not enough data
}
```

### `GET /v1/sessions/:id/stats` 🎟️

Leaderboard during the session, end-of-day stats after.

```ts
→ {
  crew: Stats,
  members: (Stats & { memberId })[]
}
// Stats = { streetsWorked, streetsPassed, blocksCompleted, housesCovered, leads: { A, B, C }, distanceM, activeS }
```

Distance-based stats are estimates until the session is processed.

---

## In-session writes

All take a `clientId` and are idempotent.

### `POST /v1/sessions/:id/pings` 🎟️

A batch of GPS points, sent every 15–30 seconds or when catching up after being offline.

```ts
{ pings: { clientId, t, lat, lng, accuracy }[] } → { accepted: number }
```

### `POST /v1/sessions/:id/leads` 🎟️

```ts
{ clientId, t, houseId, grade: "A" | "B" | "C", note?: string } → { lead }
// t: when the lead was marked on the phone (ISO timestamp). Becomes createdAt.
// note: optional, max 140 characters
// lead = { clientId, memberId, houseId, grade, note, createdAt, updatedAt }
```

Broadcasts `lead:new`.

### `PATCH /v1/sessions/:id/leads/:clientId` 🎟️

Edit a lead's grade or note. Updates `updatedAt`.

```ts
{ grade?: "A" | "B" | "C", note?: string | null } → { lead }   // note: null clears it
```

Broadcasts `lead:updated`.

### `DELETE /v1/sessions/:id/leads/:clientId` 🎟️

Undo. Broadcasts `lead:removed`.

### `POST /v1/sessions/:id/pins` 🎟️

```ts
{ clientId, lat, lng } → { pin }
```

### `DELETE /v1/sessions/:id/pins/:clientId` 🎟️

### `POST /v1/sessions/:id/messages` 🎟️

```ts
{ clientId, body } → { message }
```

### `GET /v1/sessions/:id/messages?after=<messageId>` 🎟️

Messages missed while disconnected.

---

## Planning (in session)

### `GET /v1/sessions/:id/plan` 🎟️

```ts
→ { draft: Plan, applied: Plan | null }
// Plan = { groups: { memberIds: string[], blockIds: string[] }[], drawings: Drawing[], notes: Note[] }
```

### `POST /v1/sessions/:id/plan/apply` 🎟️

The draft becomes the applied plan. Broadcasts `plan:applied`.

### `POST /v1/sessions/:id/plan/load` 🎟️ 👤

Load a plan from the team's library as the draft. The account must be on the plan's team.

```ts
{ planId } → { draft }
```

### `GET /v1/sessions/:id/knock-rate` 🎟️

The crew's learned knock rate for on-device suggestions. Falls back to the default with no history.

```ts
→ { housesPerHourPerGroup: number, source: "history" | "default" }
```

---

## Teams

### `POST /v1/teams` 👤

```ts
{ name } → { team }      // creator becomes owner
```

### `GET /v1/teams/:id` 👤 · `PATCH /v1/teams/:id` 🛡️ · `DELETE /v1/teams/:id` 🛡️ (owner)

### `GET /v1/teams/:id/members` 👤

### `PATCH /v1/teams/:id/members/:userId` 🛡️

```ts
{
  role: "admin" | "member";
}
```

### `DELETE /v1/teams/:id/members/:userId` 🛡️ (or yourself, to leave)

### `POST /v1/teams/:id/invites` 🛡️

```ts
→ { token, url, expiresAt }
```

### `POST /v1/invites/:token/accept` 👤

```ts
→ { team }
```

Upload a session. You must be on the team, and have been in the session **while logged in** (created or joined it with your account token). The session must have ended (`409` if it is live). Uploading the same session twice is a no-op.

Upload a session. You must be on the team and have been in the session. Uploading the same session twice is a no-op.

```ts
{ sessionId } → { uploaded: true, alreadyUploaded: boolean }
```

### `GET /v1/teams/:id/sessions?from=&to=` 👤

Session history.

### `GET /v1/teams/:id/sessions/:sessionId` 👤

Session detail for replay: members, matched paths, street coverage, leads and stats. **Not built yet** (needs end-of-session processing).

### `DELETE /v1/teams/:id/sessions/:sessionId` 🛡️

Removes the session from the team (and from every map).

---

## Maps

Map queries take `bbox=minLng,minLat,maxLng,maxLat` and an optional `asOf` timestamp for the time slider.

### `GET /v1/teams/:id/maps` 👤 · `POST /v1/teams/:id/maps` 👤

```ts
{ name, boundary?: GeoJSON Polygon, filters?: { from?, to? } } → { map }
```

### `PATCH /v1/maps/:id` 👤 · `DELETE /v1/maps/:id` 🛡️

### `GET /v1/maps/:id/paths?bbox=&asOf=` 👤

```ts
→ FeatureCollection   // LineStrings with { sessionId, memberName, durationS, workedAt }
```

The client calculates visibility (duration × age) using the team's fade time.

### `GET /v1/maps/:id/blocks?bbox=&asOf=` 👤

```ts
→ { blocks: { blockId, rate | null, housesWorked, leads: { A, B, C }, lastWorkedAt | null }[] }
```

### `GET /v1/maps/:id/leads?bbox=&grades=A,B&asOf=` 👤

```ts
→ { leads: { houseId, lat, lng, grade, note, at }[] }
```

### `GET /v1/maps/:id/stats?from=&to=` 👤

Coverage, houses worked, distance, leads by grade, lead rate.

### `GET /v1/maps/:id/where-next?near=lat,lng&limit=10` 👤

```ts
→ { suggestions: { blockId, centroid, medianIncome, daysSinceWorked | null, score }[] }
```

---

## Plans (library)

### `GET /v1/teams/:id/plans?used=false` 👤 · `POST /v1/teams/:id/plans` 👤

```ts
{ name, mapId?, groups: { label, blockIds }[] } → { plan }
```

### `GET /v1/plans/:id` 👤 · `PATCH /v1/plans/:id` 👤 · `DELETE /v1/plans/:id` 👤

### `GET /v1/geo/blocks?bbox=` 👤

Blocks and house counts for building plans on the web, outside a session.

---

## Map tiles

### `GET /tiles/london.pmtiles` 🔓

The basemap as a Protomaps PMTiles file, for MapLibre. Supports HTTP range requests. Not under `/v1` since it's a static file.

---

## Dev only

Disabled in production.

### `POST /v1/dev/sim`

Start a simulated crew in a session.

```ts
{ sessionId, bots: number, route?: GeoJSON } → { botMemberIds: string[] }
```

---

## Socket.io

Connect with `auth: { token }` (session token). The server checks it and joins the socket to that session's room.

### Server → client

| Event                     | Payload                                                   |
| ------------------------- | --------------------------------------------------------- |
| `member:joined`           | `{ member }`                                              |
| `member:left`             | `{ memberId }`                                            |
| `member:status`           | `{ memberId, online }`                                    |
| `positions`               | `{ positions: { memberId, lat, lng, t }[] }`              |
| `lead:new`                | `{ lead, memberName }` (drives the alert and leaderboard) |
| `lead:updated`            | `{ lead }`                                                |
| `lead:removed`            | `{ clientId }`                                            |
| `pin:new` / `pin:removed` | `{ pin }` / `{ clientId }`                                |
| `message:new`             | `{ message }`                                             |
| `plan:draft`              | `{ draft, editedBy }`                                     |
| `plan:applied`            | `{ plan }`                                                |
| `session:ended`           | `{}`                                                      |
| `session:processed`       | `{}` (the upload prompt can show now)                     |

### Client → server

| Event       | Payload                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan:edit` | `{ op: "assign", blockId, groupIndex }` · `{ op: "unassign", blockId }` · `{ op: "setGroups", groups }` · `{ op: "draw", stroke }` · `{ op: "note", note }` · `{ op: "clear" }` |

Also `{ op: "erase", drawingId }` and `{ op: "removeNote", noteId }`.

- Send with an acknowledgement callback: `socket.emit("plan:edit", op, (res) => ...)`. `res` is `{ ok: true }` or `{ ok: false, error }` (e.g. `"No group 9"`, or the session has ended)
- On success everyone (including the sender) gets `plan:draft` with the full draft
- **Instant updates:** run `applyPlanEdit(draft, op)` from `@knockd/shared` locally before the server replies. It's the exact code the server runs, so the results match. Replace with the server's `plan:draft` when it arrives
- Edits are applied one at a time per session. If two people assign the same block at once, the last edit wins
- Limits: 8 groups, 200 drawings (500 points each), 50 notes
