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

| Marker | Meaning                                                                              |
| ------ | ------------------------------------------------------------------------------------ |
| 🔓     | No auth                                                                              |
| 👤     | Account token                                                                        |
| 🎟️     | Session token (guest or account member of that session)                              |
| 🛡️     | Account token + team role: editor or owner (marked "owner" where only the owner can) |

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

Create a session. Guests can create sessions. If an Auth0 account token is sent (`Authorization: Bearer <account token>`), the session and your member are linked to your account, which you need to upload it to a team later. `loadMap` (account only) loads one of your team's maps into the session: the map must be on one of your teams (`404` otherwise). Its data is then served by `GET /v1/sessions/:id/layers`.

```ts
{
  displayName: string,
  location: { lat, lng },
  area:                                                                  // the planned area
    | { kind: "circle", center: { lat, lng }, radiusM: number }          // pin + radius (100–3000 m)
    | { kind: "polygon", polygon: GeoJSON Polygon },                     // drawn
  loadMap?: { mapId, layers: ("leads" | "coverage" | "leadRate" | "highlights" | "notes")[] }   // account only
}
→ { session, joinCode, member, token }
```

### `POST /v1/sessions/join` 🔓 (or 👤)

```ts
{ code: string, displayName: string } → { session, member, token }
```

Errors: `400 invalid_request` (not a valid 6-character code), `404 session_not_found`, `409 session_full` (8 members max), `410 session_ended`

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
  coverage?: FeatureCollection,          // same features as GET /v1/maps/:id/paths
  leadRate?: { blockId, rate | null, housesWorked }[],  // null = not enough data
  highlights?: highlight[],                          // see Highlights & notes
  notes?: note[],
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
{ clientId, lat, lng, label?: string } → { pin }   // label: optional, max 80, e.g. "meet up here once done"
// pin = { clientId, memberId, lat, lng, label | null, createdAt }
```

### `DELETE /v1/sessions/:id/pins/:clientId` 🎟️

### `POST /v1/sessions/:id/messages` 🎟️

```ts
{ clientId, body } → { message }
```

### `GET /v1/sessions/:id/messages?after=<messageId>` 🎟️

Messages missed while disconnected.

### `GET /v1/sessions/:id/trails?since=<timestamp>` 🎟️

Everyone's GPS trail so far, for drawing trails when the app opens or reconnects. `since` returns only newer points.

```ts
→ { trails: { memberId, points: [tMs, lat, lng][] }[] }   // oldest first; t in ms since the epoch
```

**Drawing trails:** keep each member's points (from this endpoint, then append `positions` events) and pass them to `trailToGeoJSON(memberId, points)` from `@knockd/shared`. It returns one line per stretch with `properties.mode`: `"knocking"` (averaging under ~3 km/h), `"walking"` or `"driving"` (over 9 km/h), and breaks the line at gaps over 2 minutes. Style on `mode` (e.g. thick / thin / faint). The thresholds match end-of-session processing, so live trails agree with the final worked/passed results.

---

## Planning (in session)

One live plan per session, edited by anyone over the socket (`plan:edit`, see Socket.io below) and broadcast to everyone as `plan:updated`. No draft or Apply step. Three ways to plan, all optional and mixable:

- **Claims:** a block claimed for a member. Anyone can claim for anyone (yourself, or a teammate as organiser). Two members on one block = a pair
- **Drawings:** `route` (draw as a dashed line with an arrow tip) or `freehand` (solid line)
- **Notes:** short text on the map

Drawings and notes are either **for a member** (`memberId`, drawn in their colour) or in a **utility colour** (`colour`): exactly one of the two is set. Every item has an `authorId` (who made it), set by the server, so "clear mine" only removes your own items.

**Colours:** `PALETTE` in `@knockd/shared` has 12 colours. Members get the first free one when they join (max 8). `utilityColours(memberColours)` gives the rest, for instructions not aimed at anyone.

### `GET /v1/sessions/:id/plan` 🎟️

```ts
→ { plan: PlanContent, version: number }   // version: +1 per edit, 0 = never edited
// PlanContent = {
//   claims:   { blockId, memberId, authorId }[],
//   drawings: { id, kind: "route" | "freehand", points: { lat, lng }[], memberId | null, colour | null, authorId }[],
//   notes:    { id, lat, lng, text, memberId | null, colour | null, authorId }[],
// }
```

The snapshot (`GET /v1/sessions/:id`) includes the same `plan` and its version as `planVersion`.

**Staying in sync:** keep the latest `version` you've seen. On `plan:updated`, ignore it if its version is older than yours; if it's more than one ahead (you missed an update, e.g. a signal drop), refetch `GET /plan`. Also refetch on reconnect. When debugging, two phones with the same version have identical plans.

### `GET /v1/sessions/:id/door-time` 🎟️

Seconds per door, for Suggest (which runs on the phone: `suggestRoutes` in `@knockd/shared`). Currently always the default of 60; will be learned from team history.

```ts
→ { secondsPerDoor: number, source: "history" | "default" }
```

---

## Teams

Roles:

|                                                                        | Owner | Editor | Viewer |
| ---------------------------------------------------------------------- | ----- | ------ | ------ |
| See maps, stats, replays, highlights, notes                            | ✓     | ✓      | ✓      |
| Upload sessions                                                        | ✓     | ✓      | ✓      |
| Create/delete highlights, notes and maps; remove sessions              | ✓     | ✓      |        |
| Invite people, change roles, remove people, team settings, delete team | ✓     |        |        |

People who accept an invite join as **viewers**.

### `POST /v1/teams` 👤

```ts
{ name } → { team }      // creator becomes owner; the team starts with a "World Map" (no boundary)
```

### `GET /v1/teams/:id` 👤 · `PATCH /v1/teams/:id` 🛡️ (owner) · `DELETE /v1/teams/:id` 🛡️ (owner)

### `GET /v1/teams/:id/members` 👤

### `PATCH /v1/teams/:id/members/:userId` 🛡️ (owner)

```ts
{
  role: "editor" | "viewer"; // the owner's role can't be changed
}
```

### `DELETE /v1/teams/:id/members/:userId` 🛡️ (owner, or yourself to leave)

### `POST /v1/teams/:id/invites` 🛡️ (owner)

```ts
→ { token, url, expiresAt }
```

### `POST /v1/invites/:token/accept` 👤

```ts
→ { team }
```

### `POST /v1/teams/:id/sessions` 👤

Upload a session. You must be on the team (any role), and have been in the session **while logged in** (created or joined it with your account token). The session must have ended (`409` if it is live). Uploading the same session twice is a no-op.

```ts
{ sessionId } → { uploaded: true, alreadyUploaded: boolean }
```

### `GET /v1/teams/:id/sessions?from=&to=` 👤

Session history.

### `GET /v1/teams/:id/sessions/:sessionId` 👤

Session detail for replay: members, matched paths (properties `{ memberId, distanceM }`), street coverage (`{ memberId, streetId, durationS, classification, firstSeen, lastSeen }`), leads with positions and final stats. Uses processed results, so it works after raw GPS points are deleted.

### `DELETE /v1/teams/:id/sessions/:sessionId` 🛡️

Removes the session from the team (and from every map).

---

## Maps

A map is a saved view over the team's **uploaded** sessions: an optional boundary and date range. Queries take `bbox=minLng,minLat,maxLng,maxLat` and an optional `asOf` timestamp for the time slider (only sessions started before it). Results are capped at 5,000 features.

### `GET /v1/teams/:id/maps` 👤 · `POST /v1/teams/:id/maps` 🛡️

```ts
{ name, boundary?: GeoJSON Polygon | MultiPolygon, from?, to? } → { map }   // 201
// map = { id, teamId, name, boundary | null, from | null, to | null, createdAt }   (no boundary = whole team, e.g. "World Map")
```

### `PATCH /v1/maps/:id` 🛡️ · `DELETE /v1/maps/:id` 🛡️

PATCH takes any of `{ name, boundary, from, to }`; `null` clears boundary/from/to.

### `GET /v1/maps/:id/paths?bbox=&asOf=` 👤

```ts
→ FeatureCollection   // street segments (LineStrings), one per member per street per session
// properties: { sessionId, memberName, streetId, durationS, classification: "worked" | "passed", workedAt }
```

Newest first. The client calculates visibility (duration × age) using the team's `fadeDays`.

### `GET /v1/maps/:id/blocks?bbox=&asOf=` 👤

```ts
→ { blocks: { blockId, rate | null, housesWorked, leads: { A, B, C }, lastWorkedAt | null, geometry }[] }   // geometry: the block outline (simplified GeoJSON)
// Only blocks with results. rate = (A + B + 15 × teamRate) / (housesWorked + 15), smoothed toward the
// map's average; null (grey) until 15 houses have been worked. C leads don't count.
```

### `GET /v1/maps/:id/leads?bbox=&grades=A,B&asOf=` 👤

```ts
→ { leads: { houseId, lat, lng, grade, note, at }[] }   // latest lead per house; at = last updated
```

### `GET /v1/maps/:id/stats?from=&to=` 👤

```ts
→ { sessions, housesWorked, streetsWorked, distanceM, leads: { A, B, C }, leadRate | null }
```

`from`/`to` narrow the map's own date range.

### `GET /v1/maps/:id/where-next?near=lat,lng&limit=10` 👤

```ts
→ { suggestions: { blockId, centroid, medianIncome, daysSinceWorked | null, score }[] }
// Blocks with 5+ houses within 3 km of near. score = (income / max income nearby) × min(days since worked, 365) / 365.
// Never worked = 365 days; unknown income = the area average. limit 1–50 (default 10).
```

---

## Highlights & notes (team)

The web's planning tools, like a highlighter on a map screenshot. Everyone on the team can list them; owners and editors create and delete them (on the web). Phones get them read-only through session layers (`highlights`, `notes` in `loadMap.layers`).

### `GET /v1/teams/:id/highlights?bbox=` 👤 · `POST /v1/teams/:id/highlights` 🛡️

```ts
{ geometry: GeoJSON LineString | Polygon, colour } → { highlight }   // 201
// LineString = a stroke along roads; Polygon = a loop around an area
// colour: one of HIGHLIGHT_COLOURS (6 presets in @knockd/shared). No built-in meaning
// highlight = { id, teamId, geometry, colour, createdBy: { id, displayName }, createdAt }
// GET → { highlights: highlight[] }
```

### `DELETE /v1/highlights/:id` 🛡️

### `GET /v1/teams/:id/notes?bbox=` 👤 · `POST /v1/teams/:id/notes` 🛡️

```ts
{ lat, lng, text } → { note }   // 201; text max 140
// note = { id, teamId, lat, lng, text, createdBy: { id, displayName }, createdAt }
// GET → { notes: note[] }
```

### `DELETE /v1/notes/:id` 🛡️

### `GET /v1/geo/blocks?bbox=` 👤

Blocks (FeatureCollection, properties `{ blockId, houseCount }`) in a bbox, outside a session.

---

## Map tiles

The basemap for MapLibre: OpenStreetMap data from Protomaps, cut to London (zoom 0–15). No API key. Not under `/v1`.

### `GET /tiles/style.json` 🔓

**Use this as the map style URL.** A ready-made MapLibre style (Protomaps "light", English labels) whose source is the XYZ tiles below. Fonts and icons load from `protomaps.github.io`.

```ts
<MapView mapStyle="https://api.knockd.rodeo/tiles/style.json" />
```

### `GET /tiles/style-dark.json` 🔓

The same basemap in Protomaps' dark flavour (the website's dark mode).

### `GET /tiles/{z}/{x}/{y}.mvt` 🔓

Vector tiles (gzipped on the wire). `204` for empty tiles outside London. Standard XYZ, so it works in any MapLibre, including React Native **offline packs**: download the session area at zooms ~12–16 before heading out.

### `GET /tiles/london.pmtiles` 🔓

The whole archive (~13 MB) with HTTP range requests, for `pmtiles://` on the web if preferred.

Attribution to show on the map: "© Protomaps © OpenStreetMap" (included in the style's source).

---

## Simulated crew

Bots that join a session and walk real streets, for the demo and for testing indoors. Works on the live server.

### `POST /v1/sessions/:id/sim` 🎟️

Session admin only, live sessions only.

```ts
{ bots: 1–7, pace?: "demo" | "realistic" } → { botMemberIds: string[] }   // 201
// demo (default): ~10 s per door, ~2 km/h. realistic: ~1 min per door
```

- Bots join as normal members named like `Alex (sim)`, with `isBot: true`, their own colour, and online status. They count toward the 8-member limit (`409 session_full`)
- Each bot walks the street segments of its blocks: its blocks in the applied plan if it's in a group, otherwise a slice of the planned area
- They send pings exactly like a phone (a GPS point every 5 s, uploaded every 15 s), so apps get normal `positions`, and occasionally mark A/B/C leads (`lead:new`)
- They stop automatically when the session ends
- Errors: `403` (not the admin), `409` (already running), `410` (session ended), `400` (no houses in the area)

### `DELETE /v1/sessions/:id/sim` 🎟️

Session admin only. Stops the bots and removes them from the session (`member:left` for each). `404` if none are running.

---

## Socket.io

Connect with `auth: { token }` (session token). The server checks it and joins the socket to that session's room.

### Server → client

| Event                     | Payload                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `member:joined`           | `{ member }`                                                                                                                                         |
| `member:left`             | `{ memberId }`                                                                                                                                       |
| `member:status`           | `{ memberId, online }`                                                                                                                               |
| `positions`               | `{ positions: { memberId, lat, lng, t }[] }`: every point from a member's upload batch, oldest first. Append to their trail; the newest is their dot |
| `lead:new`                | `{ lead, memberName }` (drives the alert and leaderboard)                                                                                            |
| `lead:updated`            | `{ lead }`                                                                                                                                           |
| `lead:removed`            | `{ clientId }`                                                                                                                                       |
| `pin:new` / `pin:removed` | `{ pin }` / `{ clientId }`                                                                                                                           |
| `message:new`             | `{ message }`                                                                                                                                        |
| `plan:updated`            | `{ plan, version, editedBy }`: the whole plan after anyone's edit. Replace your copy (see "Staying in sync" under Planning)                          |
| `session:ended`           | `{}`                                                                                                                                                 |
| `session:processed`       | `{}` (the upload prompt can show now)                                                                                                                |

### Client → server

`plan:edit` with one of:

| Op           | Payload                                                              | Does                                                                  |
| ------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `claim`      | `{ blockId, memberId }`                                              | Claim a block for a member (yourself or a teammate)                   |
| `claimMany`  | `{ blockIds, memberId }`                                             | Claim up to 200 blocks at once                                        |
| `unclaim`    | `{ blockId, memberId }`                                              | Remove one member's claim on a block                                  |
| `draw`       | `{ stroke: { id, kind, points, memberId \| null, colour \| null } }` | Add a route/freehand line, or replace one with the same `id`          |
| `erase`      | `{ drawingId }`                                                      | Remove a drawing (the eraser sends this for each line it touches)     |
| `note`       | `{ note: { id, lat, lng, text, memberId \| null, colour \| null } }` | Add a note, or replace one with the same `id`                         |
| `removeNote` | `{ noteId }`                                                         | Remove a note                                                         |
| `clearMine`  | `{}`                                                                 | Remove all your own claims, drawings and notes. Teammates' items stay |

- Send with an acknowledgement callback: `socket.emit("plan:edit", op, (res) => ...)`. `res` is `{ ok: true }` or `{ ok: false, error }` (e.g. "That person isn't in this session", "Set exactly one of memberId or colour", or the session has ended)
- On success everyone (including the sender) gets `plan:updated` with the new `version`. Planning edits need a connection (they aren't queued offline): if the ack fails, tell the user it didn't save
- **Instant updates:** run `applyPlanEdit(plan, op, myMemberId)` from `@knockd/shared` locally before the server replies. It's the exact code the server runs. Replace with the server's `plan:updated` when it arrives
- **Undo/redo** (your own actions only) is built on the phone from these ops: undo `claim` → `unclaim`, undo `draw` → `erase`, undo `note` → `removeNote`, and the reverse for redo. Keep the stroke/note to redraw it
- Claims and drawings/notes `for` a member must name someone in the session
- Edits are applied one at a time per session; the last edit wins
- Limits: 1,000 claims, 200 drawings (500 points each), 50 notes
