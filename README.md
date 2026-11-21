# Knockd — Door-to-Door Team Coordination App

---

## The Problem

Small door-to-door sales crews (2–6 people) have no good way to coordinate in the field. The existing tools are either enterprise CRMs built for managers to monitor reps, or nothing. The day-to-day reality for a small crew looks like this:

- You split up to cover more ground, then have no idea where your teammate is or what streets they've already hit
- You end up knocking the same doors
- You're constantly texting "you guys done yet?" and physically regrouping to figure out next steps
- Planning who takes what means screenshotting Google Maps and drawing on the screenshot
- There's no shared picture of what's been covered and what hasn't

## The Idea

A lightweight, session-based map app for crews doing door-to-door work. No CRM, no manager dashboards, no enterprise pricing — just a shared live map that answers "where is everyone and what have they covered?"

It has two parts:
- **Mobile app (Phase 1, priority):** runs the day in the field: planning, live map, coverage
- **Web app (Phase 2):** post-session analysis and area planning across weeks and months

**Core loop:**
1. Crew pulls up to an area
2. One person creates a session, shares a code
3. Everyone joins — each person appears as a different colored dot on the map
4. The crew plans together in **planning mode**: assign blocks to people or pairs, then apply the plan to the shared map
5. As people move, they leave a colored trail behind them
6. Streets get "painted" as they're worked — the map fills in visually as the crew works
7. Sales are marked with a long-press on the house; everything else is assumed no sale
8. Session ends when the crew is done for the day, with end-of-day stats
9. Anyone in the session who's on a team can upload it to that team, where it shows up on the team's maps in the web app

## Mobile App (Phase 1)

The mobile app is focused on **today**: the live session, the plan, and the stats. Analysis of history belongs in the web app. The one exception is team data the session creator chooses to load (see "Loading team data into a session").

### Sessions
- Create a session and share a join code. Joining needs no account, just a name
- Session ends when the creator ends it or at the end of the day

### Live map
- Each teammate is a coloured dot with a trail behind them
- Group chat
- "Heading here" pins to mark a specific point

### Worked vs passed-by streets
Walking past a street isn't the same as knocking it. Each street is classified using the GPS timestamps:
- **Worked:** slow movement with stops (roughly 1–3 km/h average, measured as minutes spent per 100m of street). Painted in solid colour
- **Passed by:** steady walking or driving through. Shown as a thin, faint line
- Driving never counts. Only worked streets count toward coverage
- A street is treated as one unit. GPS (±5–10m) can't reliably tell which side of the street was done

### Blocks
- A block is an area enclosed by roads: the "big rectangle" of houses crews actually work one at a time
- Blocks are generated from OpenStreetMap road data (PostGIS polygonize). House outlines come from open building footprint data (e.g. Microsoft's Canadian building footprints)
- Blocks are the unit for selecting, assigning and measuring coverage. Each block knows its house count, and its coverage is the % of its streets that were worked

### Planning mode
Replaces screenshot-and-draw. A shared planning screen inside the session:
- Everyone in the huddle sees it live on their own phone
- Draw freehand, tap blocks to assign them to a person or pair, add arrows or short notes
- Changes stay a draft until someone taps **Apply**, then it becomes the shared map everyone works from
- **Optional suggestions:** tap Suggest to get 3 split options, generated on the phone (instant, works offline). Settings:
  - Crew size (from the session)
  - Solo or pairs (e.g. a crew of 4 in pairs = 2 chunks; pairs split a chunk by side of the street)
  - Time window (default now → 8pm, since 5–8pm after work is the best time to knock)
  - Knock rate in houses per hour (learned from the crew's past sessions, with a default such as 25/hour per pair when there's no history)
  - Starting point (the car or current location)
- The algorithm grows one group of connected blocks per person or pair outward from different starting blocks, balanced by house count against the time budget. Different starting blocks give the different options
- An optional server API can add heavier work later, like real walking routes through each chunk (OSRM)

### Sales
- Every house is assumed no sale. No need to keep the app open to log each door
- **Long-press a house** to mark a sale (not double-tap, which zooms the map), with a quick undo
- **Live sale alert:** when someone makes a sale, everyone in the session gets a notification ("Jas just closed a sale on Oak St!") and the house lights up on their map
- **Leaderboard:** a small in-session leaderboard of sales per person

### End-of-day stats
Plain stats, per person and for the crew: streets worked vs passed, blocks completed, houses covered, sales, distance, active time.

### Uploading to a team
- At the end of a session, everyone in it who's on a team gets a prompt listing their teams: "Add to London Painters?"
- Plans from the team's plan library can be loaded into planning mode as a starting point (see Web App)

### Loading team data into a session
Crews use previous customers nearby as references ("we just painted the Hendersons' place down the street"). So a session can show data from a team map:
- When creating a session, a creator with an account can pick one of their team maps (e.g. London D2D) and choose which data to load:
  - **Previous customers:** houses marked as a sale in past sessions, with how long ago. On by default
  - **Past coverage:** "hit X time ago" paths, with the same fading as the web map
  - **Sale-rate colours:** blocks coloured green to red
- Only data inside the session's area is loaded, and it's downloaded when the session starts so it works offline
- Previous customers show a small badge on the house. Tap it to see "Sale · 8 months ago"
- **Everyone in the session sees loaded data**, including guests
- Each person can toggle each layer on or off on their own phone, so the map doesn't get cluttered
- Off by default, so the live map stays focused on today unless the creator loads something
- *Nice to have:* planning suggestions that prefer blocks near previous customers

### Offline
- GPS points, sales and planning changes are stored on the phone (SQLite), each with a unique ID
- Sent when the connection comes back. The server ignores duplicates
- Worked/passed-by classification uses the GPS timestamps, so delayed uploads don't affect it

### Battery
The app runs for a whole shift and crews can't charge mid-job, so battery use is a top priority:
- Record location only after moving about 10m, and let the OS pause GPS when standing still
- Send updates in batches every 15–30 seconds instead of on every reading
- Everything works with the screen off, in the background
- Measure battery use per hour on a real test walk early on

### Demo
- **Simulated crew mode:** fake teammates walking scripted routes over a real neighbourhood, so the demo isn't a few dots sitting still indoors

## Web App (Phase 2)

Post-session analysis and area planning. Mobile is the priority, but the goal is to build both.

**Who it's for:** anyone coordinating door-to-door sessions: the owner, a crew lead, or the whole team looking at the map together. Everything is shared within a team.

### Teams and maps
- Anyone can create a team and invite others by link. Once someone joins, they can see all of the team's maps
- Sessions are uploaded **once to the team**, not to a specific map
- **Maps are saved views** of the team's data: a name plus an area boundary and/or filters
  - "London D2D Map": a boundary around London
  - "Brampton Map": a boundary around Brampton
  - "World Map": no boundary, the company's entire progress
  - Maps can also filter by date, e.g. "Summer 2026"
- A session in Byron shows up on both London and World automatically. Nobody has to add it to each map, and removing a session removes it everywhere
- A company that wants one combined picture puts everyone in one team
- **Roles:** owner/admin invites people and can remove sessions. Members can view, upload and make plans

### How the map is drawn
**Paths show effort and recency.** Each session's paths are drawn as their own translucent lines, with visibility = duration × age:
- **Duration:** a drive-by is barely noticeable. Around 30+ minutes on a street is clearly solid
- **Age:** a multiplier that fades paths over an adjustable fade time (default 4 months). After that, old work stays just barely visible
- Repeat visits stack, so a street worked three times looks darker than one worked once

**Block colour shows sale rate** (sales ÷ houses worked):
- 🟢 Green: lots of sales, good money-making houses
- 🟡 Yellow: average
- 🔴 Red: no sales
- ⚪ Grey: not enough data yet. A block stays neutral until enough houses have been worked there (e.g. 15+), and small samples are nudged toward the team's average so one lucky sale doesn't paint a block green
- The colour scale changes in lightness as well as hue, so it still reads for colour-blind users

### Core features
- **Time slider:** replay how the territory filled in ("show the map as of 3 weeks ago")
- **Filters:** date range, crew, neighbourhood
- **Stats:** coverage, houses worked, distance, sales, and **sale rate** = sales ÷ houses, per session or per area
- **"Hit X time ago"** for any street or block
- **Where next?:** a simple ranking of how wealthy an area is (census median household income) × how long since it was last hit
- **Plan library:** a boss sits down and makes several plans (blocks assigned per person or pair). The crew picks one in the field, it loads into mobile planning mode, and it's marked as used once a session runs it. Plans belong to the team and can be tied to a map
- **Previous paths and session history:** replay any past session and see which streets each person walked

### Nice to have
- Demographics overlay (income, homeownership, home age, density) and demographics compared with sales
- Smarter "where next?" that also uses past sale rate
- Best time to knock, by hour (5–8pm is already the established default)
- Plan vs actual: blocks assigned vs blocks actually worked
- **Gemini add-on:** "ask your data" questions like "which neighbourhoods sold best in October?", turned into read-only SQL on the team's data
- CSV export

## Accounts & Data

- Joining a live session: no account needed, just a code and a name
- Uploading to a team and viewing team maps: account and team membership required
- **Uploading:** at the end of a session, anyone in it who's on a team can upload it. Uploads are deduplicated by (team, session ID), so if everyone taps "add" it's only stored once. A session can go to more than one team, once each
- **Loaded team data** (e.g. previous customers) is visible to everyone in the session, including guests, since anyone knocking benefits from references
- **Everyone's paths are uploaded**, including guests without accounts. The join screen says so: "your path may be saved to the crew's team map"
- **Grace period:** session data stays on the server for about 7 days so someone can upload it later if everyone skipped the prompt or a phone died. Sessions nobody uploads are deleted after that
- After a session, GPS trails are snapped to streets (map matching). The snapped paths, worked streets, blocks and sales are saved. The raw GPS points are deleted
- **Positioning:** the history is the crew's shared memory, not a way for a manager to track people. Paths are saved as streets walked per session, not a minute-by-minute record of where someone was

**Designing Phase 1 so Phase 2 is easy:**
- All data goes through the server's API, never straight from the phone to the database, so the web app can use the same API
- Save session data from day one. Even if the web app comes later, its history starts with the first session
- Keep the server, mobile app and (later) web app in one repo with shared types

## Why It's Different

Every existing app (SPOTIO, SalesRabbit, Knockio, Timeero, etc.) is built manager-down. A boss watches reps from a dashboard. They're CRM-first, $15–50/user/month, and overkill for a small informal crew.

This is peer-to-peer. Teammates see each other, not a manager seeing subordinates. The target user is a 3-person painting crew or summer sales team, not a 50-rep enterprise sales org. Free or near-free pricing.

## Platform Requirement

**Must work on both iOS and Android.** This is non-negotiable. Door-to-door crews are mixed — some people have iPhones, some have Androids. An iOS-only or Android-only app kills the "whole crew joins a session" concept on day one. Every technical decision should be made with cross-platform in mind from the start, not bolted on later.

## Technical Approach

- React Native + Expo (cross-platform iOS/Android — satisfies the platform requirement above)
- Google Maps SDK for the map layer (react-native-maps; streets as polylines, blocks and houses as polygons)
- Node + Socket.io server for live sync: dots, trails, pins, chat and planning, with one room per session code
- **Tiger Data** (Postgres + PostGIS + TimescaleDB) as the database:
  - Hypertable for GPS pings during a session
  - PostGIS streets, blocks and house footprints
  - Worked streets with timestamps for history
  - Continuous aggregates for stats over time (e.g. each crew's knock rate)
  - Map queries return what's in view as GeoJSON (`ST_AsGeoJSON`)
- **OSRM** map matching to snap GPS trails onto real streets
- Hosted on a **Vultr** VM (Docker Compose via Coolify) running the Socket.io server and OSRM
- **Auth0** for accounts and team invites (shared by mobile and the web app)
- Web app: Next.js using the same server API and Google Maps. Census data (median household income for "where next?", plus demographics) loaded into PostGIS from Statistics Canada dissemination areas
- Data model: teams → members, sessions (unique per team + session ID), plans. Maps are saved views (boundary polygon + filters) over the team's sessions
- **Gemini:** optional web add-on for "ask your data". No role on mobile

```
Phones  <--websockets-->  Vultr VM                    -->  Tiger Data
                          ├─ Node/Socket.io server         (Postgres + PostGIS)
                          └─ OSRM map matching
```

Later, Firebase could take over the live layer (offline queueing, auto-reconnect) while Tiger Data keeps the permanent history. Not needed for the MVP.

## Name & Domain

- Working name: **Knockd** — checked on App Store and Google Play, no conflicting app found
- For the GoDaddy Registry domain prize, the domain has to be on a GoDaddy Registry extension (e.g. .co, .us, .biz), not .com. Something like knockd.co. Check the eligible list at the event
- Register it early and point it at the Vultr server so HTTPS works from the start

## Market

Validated market (D2D software is a real category) but the lightweight peer-coordination niche is unserved. Target users: summer sales crews, painting companies, fundraising canvassers, political canvassing teams, small field sales teams. All informal, price-sensitive, coordination-heavy.

**Pricing:** the mobile app (live sessions) is free. Teams, team maps and the web app are paid. No paywall for the hackathon.

## Hackathon

**Prizes we're targeting:**
- 1st/2nd/3rd Overall
- Most Adventurous ("discover the unknown"): the map shows where the crew hasn't been yet
- Best Use of Tiger Data: hypertables for GPS pings, PostGIS for streets and blocks, continuous aggregates for stats
- Best Use of Vultr: hosts the server and OSRM map matching
- Best Use of Auth0: accounts and team invites
- Best Domain Name from GoDaddy Registry
- Best Use of Entire: use Sessions and Graph while building
- Best Use of Gemini: only if the "ask your data" add-on gets built

Check how many prize tracks one project can enter.

**Who does what:**
- Gansi: backend (server, database, map matching, deployment)
- Jasmine: mobile app
- Web app: split once those are done

**Priorities:**
1. Mobile: sessions, live map, worked vs passed-by streets, blocks, sales, planning mode, simulated crew mode
2. Server and database on Vultr + Tiger Data, with uploads to teams
3. Web: team map with paths and sale-rate colours, time slider, stats
4. Everything else in the web section

**Demo:** seed the database with a few weeks of fake past sessions so the web map already has history. Then run a simulated session on the phone and show it appear on the web map after upload.

**Before the event:** get a basic Expo app with background location running on both an iPhone and an Android. Background location permissions are the most likely thing to cost hours during the hackathon.
