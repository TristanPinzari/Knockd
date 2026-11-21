# Knockd Backend

The backend serves both the mobile app and the web app. This doc covers the stack, architecture, data model, data processing and deployment. The REST endpoints and socket events are in [API.md](API.md). Product scope is in the [README](../README.md).

Owner: Tristan

---

## Architecture

```
Mobile app  <--Socket.io + REST-->  Vultr VM (Coolify)               -->  Tiger Cloud
Web app     <--REST------------->   ├─ api: Express + Socket.io           (Postgres + TimescaleDB + PostGIS)
                                    │     └─ serves london.pmtiles (basemap)
```

- **One server** handles REST (teams, maps, plans, uploads, history) and Socket.io (everything live in a session)
- **Tiger Cloud** is the only database. It's managed, so it doesn't live on the VM
- **Map matching** runs in PostGIS when a session ends (see [End-of-session processing](#end-of-session-processing)), so there is no separate routing service
- **Basemap tiles** are one static file served by the API (see [Maps and tiles](#maps-and-tiles))

### Principles

- **All data goes through the API.** Phones and the web app never talk to the database directly, so both frontends share one API
- **Save session data from day one.** The web app's history starts with the first real session, even if the web app is built later
- **The client generates IDs** for anything created offline (pings, leads, planning changes), so the server can deduplicate on retry
- **One repo, shared types.** The API contract lives in `packages/shared` as Zod schemas used by the server and both frontends

---

## Stack

| Piece           | Choice                                                    | Notes                                                                                                                                                        |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Language        | TypeScript, Node 22 LTS                                   |                                                                                                                                                              |
| HTTP            | Express 5                                                 |                                                                                                                                                              |
| Realtime        | Socket.io 4                                               | One room per session code                                                                                                                                    |
| Validation      | Zod                                                       | Schemas in `packages/shared`, used for both REST bodies and socket payloads                                                                                  |
| Database        | Tiger Cloud (Postgres + TimescaleDB + PostGIS)            | **Check that PostGIS can be enabled on the free tier first**                                                                                                 |
| ORM             | Drizzle ORM (postgres.js driver)                          | Typed queries for normal tables; Drizzle's `sql` template for PostGIS and Timescale queries                                                                  |
| Migrations      | Drizzle Kit                                               | Generated migrations for normal tables; custom SQL migrations (`drizzle-kit generate --custom`) for hypertables, policies, continuous aggregates and PostGIS |
| Auth            | Auth0 + `express-oauth2-jwt-bearer`                       | Verifies account tokens on REST and on socket connect                                                                                                        |
| Guest auth      | `jose`                                                    | Server-signed guest token issued when someone joins with a code                                                                                              |
| Map tiles       | Protomaps basemap as a PMTiles file                       | London extract, served as a static file with HTTP range requests. Clients render with MapLibre                                                               |
| Data scripts    | TypeScript (`tsx`) + CLI tools (osmium, ogr2ogr, pmtiles) | No Python. Everything else is TypeScript already                                                                                                             |
| Logging         | pino                                                      |                                                                                                                                                              |
| Dev / tests     | `tsx watch`, Vitest                                       |                                                                                                                                                              |
| Package manager | pnpm workspaces                                           |                                                                                                                                                              |

---

## Repo layout

```
apps/
  server/
    src/
      http/        REST routes and middleware
      realtime/    Socket.io handlers and in-memory session state
      db/          Drizzle schema, client, queries
      jobs/        session processing (map matching, coverage, block stats) and scheduled jobs
      sim/         simulated crew
    scripts/       data imports (london/) and smoke tests (smoke-*.ts)
    drizzle/       migrations (generated + custom SQL)
  mobile/          Jasmine
  web/             later
packages/
  shared/          Zod schemas and types for REST and socket events
docker-compose.yml
```

---

## Data model

An overview. The source of truth is the Drizzle schema in [apps/server/src/db/schema.ts](../apps/server/src/db/schema.ts), with migrations in `apps/server/drizzle/`. API types are in [packages/shared/src](../packages/shared/src).

### Accounts and teams

| Table             | Key columns                                                                        |
| ----------------- | ---------------------------------------------------------------------------------- |
| `users`           | id, auth0_sub, display_name                                                        |
| `teams`           | id, name, fade_days (how long map paths take to fade), created_by                  |
| `team_members`    | team_id, user_id, role (`owner` / `editor` / `viewer`)                             |
| `team_invites`    | token, team_id, created_by, expires_at                                             |
| `maps`            | id, team_id, name, boundary (MultiPolygon, null = no boundary), from_date, to_date |
| `team_highlights` | id, team_id, geom (LineString or Polygon), colour (one of 6 presets), created_by   |
| `team_notes`      | id, team_id, location (Point), text, created_by                                    |

### Live sessions

| Table             | Key columns                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessions`        | id, join_code (unique among live sessions), created_by_user_id (null for guests), created_by_member_id (the session admin), status (`live` / `ended` / `processed`), started_at, ended_at, planned_area (Polygon), loaded_map_id, loaded_layers |
| `session_cells`   | session_id, cell_id. Map cells loaded so far (~1 km grid, see [API.md](API.md#map-cells))                                                                                                                                                       |
| `session_members` | id, session_id, user_id (null for guests and bots), display_name, colour, is_bot, joined_at, left_at, removed_at                                                                                                                                |
| `pings`           | **hypertable**: time, session_id, member_id, client_id, location (Point), accuracy_m. Unique (client_id, time)                                                                                                                                  |
| `leads`           | **hypertable**: id (client UUID), created_at (from the phone), session_id, member_id, house_id, grade (`A` / `B` / `C`), note, updated_at, deleted_at (undo). PK (id, created_at)                                                               |
| `pins`            | id (client UUID), session_id, member_id, location, label, deleted_at                                                                                                                                                                            |
| `chat_messages`   | id (client UUID), session_id, member_id, body                                                                                                                                                                                                   |
| `session_plans`   | session_id, plan (jsonb: claims, drawings, notes, each with authorId), version (+1 per edit), updated_at                                                                                                                                        |

### Processed session results

Written by end-of-session processing. Kept forever for uploaded sessions.

| Table                     | Key columns                                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `session_paths`           | session_id, member_id, path (MultiLineString, snapped to streets), distance_m                                                     |
| `session_street_coverage` | **hypertable**: session_id, member_id, street_id, duration_s, classification (`worked` / `passed`), houses, first_seen, last_seen |
| `session_block_stats`     | session_id, block_id, houses_worked, leads_a, leads_b, leads_c, last_worked_at                                                    |
| `team_sessions`           | team_id, session_id, uploaded_by, uploaded_at. **Primary key (team_id, session_id)** to stop duplicate uploads                    |

### Map reference data

Imported once per region by scripts.

| Table          | Key columns                                                                |
| -------------- | -------------------------------------------------------------------------- |
| `streets`      | id, osm_id, name, geom (LineString, split at every intersection), length_m |
| `blocks`       | id, geom (Polygon), house_count                                            |
| `houses`       | id, geom (Polygon), centroid, block_id, street_id (nearest street)         |
| `census_areas` | dguid, geom (MultiPolygon), median_household_income                        |

---

## Tiger Data features

| Feature               | Used for                                                                                                                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hypertables           | `pings` (by time), `leads` (by `created_at`), `session_street_coverage` (by `first_seen`). Time columns are part of each primary key                                                                                                                                                                                                       |
| Retention policy      | Drop raw pings older than 7 days. This is the grace period, handled by the database with no code                                                                                                                                                                                                                                           |
| Compression policy    | Compress pings older than 1 day, segmented by session and member, ordered by time and client ID                                                                                                                                                                                                                                            |
| Continuous aggregates | `member_activity_1m` (active minutes; outlives the 7-day ping retention), `leads_hourly` (A/B/C per member per hour, undos excluded), `knock_rate_hourly` (houses on worked streets per hour of work, the learned knock rate). All real-time. Defined in `src/db/continuous-aggregates.sql`, applied by `db:migrate` outside a transaction |
| PostGIS               | Streets, blocks, houses, census areas, map matching results, `ST_AsGeoJSON` for map queries, `ST_Intersects` with a map's boundary                                                                                                                                                                                                         |

---

## Live sessions

### In-memory state

- The server keeps only online presence in memory (who's connected, plus simulated-crew bots). Everything else (members, pings, leads, pins, chat, the plan) is in the database
- So a server restart (e.g. a redeploy) only drops socket connections: phones reconnect and refetch the snapshot. A running simulated crew stops and has to be restarted
- Single server only. If there's ever more than one, add the Socket.io Redis adapter

### Pings

- Phones send pings in batches every 15–30 seconds
- The server inserts each batch in one query (`ON CONFLICT (client_id) DO NOTHING`) and broadcasts the latest positions to the room
- Offline batches arrive late with their original timestamps. Processing uses the ping timestamps, not the arrival time

### Reconnecting

- When a phone reconnects, it rejoins the room and sends anything in its offline queue
- The server replies with a snapshot: members, latest positions, leads, pins, the plan, and chat since the last message the phone saw

### Ending a session

- Ends when the creator ends it, or automatically 12 hours after it started
- On end: status → `ended`, the room gets `session:ended`, and the session is queued for processing

---

## End-of-session processing

[src/jobs/process-session.ts](../apps/server/src/jobs/process-session.ts), one session at a time, all in one transaction (re-running replaces earlier results). Typically under a second.

1. **Snap (map matching in PostGIS):** each ping with accuracy ≤ 30 m is matched to the nearest street segment within ~30 m (`ORDER BY geom <-> location`). Streets are split at every intersection, so this is accurate for people walking residential streets, with no extra service
2. **Drop driving:** time between two pings faster than 2.5 m/s (9 km/h) is ignored
3. **Time per street:** the time to each member's next ping, capped at 60 s (so a phone asleep at lunch doesn't count as hours), is added to the street of the ping
4. **Classify:** a member's time on a street ≥ max(45 s, 1.2 s per metre of street) (≈ 2 min per 100 m) → `worked`, otherwise `passed` → `session_street_coverage`, with the street's house count
5. **Paths:** each member's pings snapped onto the streets → `session_paths`, with walking distance (driving excluded)
6. **Block stats:** houses on worked streets, A/B/C leads and last worked time per block → `session_block_stats`
7. **Done:** status → `processed`, `session:processed` broadcast (the upload prompt can show). Writes after this return `410`

Thresholds are in `PROCESSING` at the top of the file; tune them after a real test walk. OSRM map matching can replace step 1 later if real-world matching turns out noisy.

### Uploading

- Upload = insert into `team_sessions`. The primary key makes duplicate uploads a no-op
- Only team members who were in the session while logged in can upload it, and only after it ends

### Background jobs

[src/jobs/scheduler.ts](../apps/server/src/jobs/scheduler.ts), inside the API server (single instance, so no job queue). Every 10 minutes, and on startup:

- **Auto-end** sessions still live after 12 hours
- **Catch up:** queue any session that's `ended` but not `processed` (e.g. the server restarted mid-way)
- **Grace period:** delete sessions older than 7 days that nobody uploaded (cascades to members, leads, pins, chat, results). Raw pings are separately dropped after 7 days by the hypertable retention policy

---

## Map and analytics queries

- **Maps are views.** A map query = the team's uploaded sessions ∩ the map's boundary ∩ the map's filters ∩ the viewport
- **Paths:** returned with duration and age, so the frontend can calculate visibility (duration × age, with the team's fade time)
- **Lead rate per block** = (A + B) ÷ houses worked, nudged toward the team average for small samples: `(AB + k × team_rate) ÷ (houses_worked + k)`, with k ≈ 15. Blocks below the minimum number of houses worked are returned as "not enough data"
- **Where next?:** rank blocks by `census median income × days since last worked`, both normalised
- **Loading team data into a session:** the same queries clipped to the session area, sent to the phone at session start

---

## Maps and tiles

**MapLibre + a self-hosted basemap, not Google Maps.** Google's map SDK can't download maps for offline use, and offline is in scope. MapLibre can, it's free, and the same library works on React Native and web. It needs an Expo dev build, which we need anyway for background location.

- The basemap is a **Protomaps PMTiles** file cut to London (~13 MB, zoom 0–15): `pmtiles extract` from the latest Protomaps daily build with the London bounding box
- It's **built into the Docker image** by a separate build stage (see the [Dockerfile](../apps/server/Dockerfile)). Docker caches that step; bump `TILES_REFRESH` to pull a newer build
- [src/tiles/router.ts](../apps/server/src/tiles/router.ts) serves `/tiles/style.json` (Protomaps "light" style from `@protomaps/basemaps`), `/tiles/{z}/{x}/{y}.mvt` (read from the archive with the `pmtiles` library) and the raw `/tiles/london.pmtiles` (range requests). No API key
- XYZ tiles work in any MapLibre, including React Native offline packs, so phones download the session area ahead of time for offline use
- **Local dev:** put `london.pmtiles` in `apps/server/data/tiles/` (gitignored), made with the [pmtiles CLI](https://github.com/protomaps/go-pmtiles/releases): `pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles london.pmtiles --bbox=-81.42,42.82,-81.05,43.10 --maxzoom=15`
- Our own data (streets, blocks, houses, paths) comes from the API as GeoJSON and is drawn on top
- Credit "© OpenStreetMap contributors" on both apps

---

## Map data imports

TypeScript scripts in `apps/server/scripts/london/`. Downloads go to `apps/server/data/` (gitignored).

```
pnpm --filter @knockd/server data:download   # OSM roads + buildings via Overpass (4×4 tiles, resumable)
pnpm --filter @knockd/server data:import     # stage → build.sql → streets, blocks, houses
pnpm --filter @knockd/server data:census     # StatCan DAs + median household income
```

| Data    | Source                                                                                                            | Steps                                                                                                                                                                        |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roads   | OpenStreetMap via the Overpass API                                                                                | Split every road at every intersection (`ST_Node`) → street segments on residential/local roads → `streets`                                                                  |
| Blocks  | Generated from roads                                                                                              | `ST_Polygonize` on the road network (1,500–400,000 m²). Houses left outside (cul-de-sac subdivisions) are grouped by street into extra blocks. Blocks with no houses dropped |
| Houses  | OpenStreetMap buildings (good coverage in London thanks to municipal imports)                                     | Residential buildings of 40–600 m², assigned to a block and their nearest street within ~70 m → `houses`                                                                     |
| Census  | StatCan 2021 DA boundary shapefile + Census Profile (DA, Ontario CSV). Downloaded by hand: StatCan blocks scripts | DAs around London, characteristic 243 (median total income of household) → `census_areas`                                                                                    |
| Basemap | Protomaps daily build                                                                                             | `pmtiles extract` with a London bounding box → `london.pmtiles`                                                                                                              |

**London as imported:** 14,082 street segments, 4,037 blocks, 112,188 houses (97% in a block, median 18 per block), 626 census areas (613 with income, median $84,000).

`build.sql` refuses to run once sessions reference the map data, since rebuilding renumbers streets, blocks and houses.

Credits: "© OpenStreetMap contributors" (ODbL); Statistics Canada, 2021 Census (Open Government Licence – Canada).

---

## Auth

- **Accounts:** Auth0. REST requests send an access token, checked by `express-oauth2-jwt-bearer`. The first request from a new user creates their `users` row
- **Guests:** joining with a code returns a guest token signed by the server, tied to one session and member, and valid until the session ends
- **Sockets:** the handshake sends either an Auth0 token or a guest token. The server checks it before joining the room
- **Team permissions:** checked per request against `team_members.role`
- **Session admin:** the member who created the session (`sessions.created_by_member_id`). Only they can end the session and remove a member. Everyone else in a session has the same permissions

---

## Simulated crew

- A server module (`src/sim`) that adds fake members to a real session
- Each bot follows a scripted route (GeoJSON, walking pace with stops at houses) and sends pings exactly like a phone, so the server handles them as normal traffic
- Bots occasionally mark leads, so lead alerts and the leaderboard have something to show
- Started from a dev-only endpoint or script
- **Demo seed** (`pnpm --filter @knockd/server seed:demo`, [scripts/seed-demo.ts](../apps/server/scripts/seed-demo.ts)): creates the "Knockd Demo" team (World + Byron maps, 2 library plans) with 12 past sessions over 6 weeks around Byron. Crews walk real streets at a realistic pace, lead chances follow census income per block, and each session goes through the real processing and is uploaded. Deterministic. Prints a 7-day invite link; `--promote` makes everyone who joined an admin; `--reset` regenerates. The seed owner is a placeholder user (`seed|knockd-demo`) that can't log in

---

## Deployment

- **Vultr VM** (Toronto, 4 vCPU / 8 GB) with the Coolify Marketplace image
- **`api`**: a Coolify **Application** built from [apps/server/Dockerfile](../apps/server/Dockerfile) (build context: repo root). Coolify redeploys it on every push to `main`
  - On start it runs `pnpm db:migrate` (new Drizzle migrations + continuous aggregates), then the server
  - Also serves the London basemap (style, tiles, `london.pmtiles`), built into the image
- Background jobs (session processing, auto-end, cleanup) run inside the same container
- Coolify's proxy handles HTTPS (Let's Encrypt) and WebSockets once the domain points at the VM, so no separate Caddy setup
- **Domain:** `knockd.rodeo`. DNS A records `api.knockd.rodeo` (the API) and `coolify.knockd.rodeo` (the dashboard) point at the VM. Vultr region: Toronto
- The mobile app isn't hosted here: it's built with Expo. Where the web app is hosted is decided when it's built
- **Tiger Cloud** is managed separately. The connection string goes in an environment variable

### Environment variables

| Variable                         | Purpose                                     |
| -------------------------------- | ------------------------------------------- |
| `DATABASE_URL`                   | Tiger Cloud connection string               |
| `AUTH0_DOMAIN`, `AUTH0_AUDIENCE` | Auth0 token checks                          |
| `GUEST_TOKEN_SECRET`             | Signing guest tokens                        |
| `GEMINI_API_KEY`                 | Only if the "ask your data" add-on is built |

---

## To check early

- PostGIS is available on the Tiger Cloud free tier
- That `ST_Polygonize` on London's roads gives sensible blocks (cul-de-sacs and parks will need cleanup)
- Worked/passed thresholds, using a real test walk
