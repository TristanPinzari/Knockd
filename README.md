# Knockd

A shared live map for door-to-door crews. Plan the area together, see where everyone is, and watch the map fill in as the team works.

Not a CRM and not a manager dashboard. Teammates see each other, and the history is the crew's shared memory.

This README covers the project scope. Technical docs:

- [Backend](docs/BACKEND.md): stack, architecture, data model, deployment
- [API](docs/API.md): REST endpoints and socket events
- [Mobile](docs/MOBILE.md): mobile app (Jasmine)
- [Web](docs/WEB.md): web app

---

## The Problem

Small door-to-door crews (2–8 people) split up to cover more ground, then lose track of each other:

- You have no idea where your teammate is or what streets they've already hit
- You end up knocking the same doors
- You're constantly texting "where are you?" and "you guys done yet?"
- Planning who takes what means screenshotting Google Maps and drawing on the screenshot
- There's no shared picture of what's been covered and what hasn't

Existing tools (SPOTIO, SalesRabbit, Knockio) are built for managers watching reps, are CRM-first, and cost $15–50 per user per month.

## The Idea

A lightweight, session-based map app for crews doing door-to-door work. No CRM, no manager dashboards, no enterprise pricing — just a shared live map that answers "where is everyone and what have they covered?"

It has two parts:

- **Mobile app (Phase 1, priority):** runs the day in the field: planning, live map, coverage
- **Web app (Phase 2):** post-session analysis and area planning across weeks and months

**Launch city: London, Ontario.** We know the area, and the demo and seeded history are set there.

**Core loop:**

1. Crew pulls up to an area
2. One person creates a session, picks the area (pin + radius, or draw it), and shares a code
3. Everyone joins — each person appears as a different coloured dot on the map
4. The crew plans together in **planning mode**: Knockd splits the area into blocks, the crew assigns blocks to people or pairs (or taps Suggest), then applies the plan to the shared map
5. As people move, they leave a coloured trail behind them
6. Streets get "painted" as they're worked, and blocks fill in as their streets are covered
7. Leads are marked with a long-press on the house and graded A, B or C; everything else is assumed no lead
8. Session ends when the crew is done for the day, with end-of-day stats
9. Anyone in the session who's on a team can upload it to that team, where it shows up on the team's maps in the web app

## Mobile App (Phase 1)

The mobile app is focused on **today**: the live session, the plan, and the stats. Analysis of history belongs in the web app. The one exception is team data the session creator chooses to load (see "Loading team data into a session").

### Sessions

- Create a session and share a join code. Joining needs no account, just a name
- Up to 8 people per session, one colour each
- **The session creator is the session admin:** they can end the session, remove a member, and choose which team data to load. Everyone else is on equal footing (anyone can plan, apply a plan, mark leads)
- Session ends when the creator ends it or at the end of the day

### Session area

Two things work together:

- **Picked area:** when creating a session, the creator drops a pin and radius or draws the area. This is what gets split into blocks for planning
- **Growing area:** map data around each crew member loads automatically as they walk, so walking outside the picked area still works

### Live map

- Each teammate is a coloured dot with a trail behind them
- **Trails show what people are doing**, worked out automatically from speed (nobody marks anything):
  - **Thick:** knocking door to door
  - **Thin:** walking past
  - **Faint:** driving
  - So you can see where a teammate is and what they've covered without calling or texting them
- Group chat
- **Pins** with an optional short label, e.g. "meet up here once done" or "heading here"

### Worked vs passed-by streets

Walking past a street isn't the same as knocking it. Each street is classified using the GPS timestamps:

- **Worked:** slow movement with stops (roughly 1–3 km/h average, measured as minutes spent per 100m of street). Painted in solid colour
- **Passed by:** steady walking or driving through. Shown as a thin, faint line
- Driving never counts. Only worked streets count toward coverage
- A street is treated as one unit. GPS (±5–10m) can't reliably tell which side of the street was done

### Blocks

- A block is an area enclosed by roads: the "big rectangle" of houses crews actually work one at a time
- Blocks are generated automatically from map data, and every house in a block is known from open building outline data
- Cul-de-sacs and crescents that don't form a closed loop become their own block
- **Houses only, no apartments.** Door-to-door sales (internet, roofing, painting) doesn't knock apartment buildings, and you usually can't get past the front desk anyway. Apartment buildings are filtered out of the map data
- Blocks are the unit for selecting, assigning and measuring coverage. Each block knows its house count. Its coverage is the % of its streets that were worked, and it fills in with the worker's colour as that goes up

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
- _Nice to have:_ real walking routes through each assigned chunk

### Leads

Crews selling things like painting or roofing rarely make a sale at the door. The goal is a lead: the homeowner's number and interest, so the company can call back to book a quote. Leads are graded by the person who got them:

- **A:** wants it done now and is ready to work with the company. The best case
- **B:** wants it later, but not too far off (within about a year)
- **C:** no particular interest, but their number is useful for automated calls and texts

How it works in the app:

- Every house is assumed no lead. No need to keep the app open to log each door. There are **no other door statuses** (no "visited", "no answer", "call back" or "not soliciting")
- **Long-press a house → tap A, B or C** (not double-tap, which zooms the map), with a quick undo
- **Optional short note** on a lead, up to 140 characters, e.g. "old house, peeling paint, loved our work" or "don't knock, very bad". Leads are assumed good unless the note says otherwise
- A lead's grade and note can be edited later. Each lead keeps when it was created and last updated
- **No contact details:** phone numbers and emails go in whatever form or CRM the company already uses. Knockd is for coordination and geography, not a CRM
- **Live lead alert:** everyone in the session gets a notification ("Jas just got an A lead on Oak St!") and the house lights up on their map
- **Leaderboard:** a small in-session leaderboard of leads per person, by grade

### End-of-day stats

Plain stats, per person and for the crew: streets worked vs passed, blocks completed, houses covered, leads by grade, distance, active time.

### Uploading to a team

- At the end of a session, everyone in it who's on a team gets a prompt listing their teams: "Add to London Painters?"
- Plans from the team's plan library can be loaded into planning mode as a starting point (see Web App)

### Loading team data into a session

Crews use previous leads nearby as references ("we just did a quote for the place down the street"). So a session can show data from a team map:

- When creating a session, a creator with an account can pick one of their team maps (e.g. London D2D) and choose which data to load:
  - **Previous leads:** houses graded in past sessions, with grade and how long ago. On by default, filterable by grade (e.g. A only)
  - **Past coverage:** "hit X time ago" paths, with the same fading as the web map
  - **Lead-rate colours:** blocks coloured green to red
- Only data inside the session's area is loaded, and it's downloaded when the session starts so it works offline
- Previous leads show a small grade badge on the house. Tap it to see "A lead · 8 months ago"
- The app doesn't know which leads became jobs (that's in the company's CRM), so references are shown as leads, not confirmed customers
- **Everyone in the session sees loaded data**, including guests
- Each person can toggle each layer on or off on their own phone, so the map doesn't get cluttered
- Off by default, so the live map stays focused on today unless the creator loads something
- _Nice to have:_ planning suggestions that prefer blocks near previous leads

### Offline

- The map for the session area is downloaded ahead of time, so the map itself works without signal
- GPS points, leads and planning changes are stored on the phone, each with a unique ID
- Sent when the connection comes back. The server ignores duplicates
- Worked/passed-by classification uses the GPS timestamps, so delayed uploads don't affect it

### Battery

The app runs for a whole shift and crews can't charge mid-job, so battery use is a top priority:

- Record location only after moving about 10m, and let the OS pause GPS when standing still
- Send updates in batches every 15–30 seconds instead of on every reading
- Everything works with the screen off, in the background
- Measure battery use per hour on a real test walk early on

### Demo

- **Simulated crew mode:** fake teammates walking scripted routes over a real neighbourhood, so the demo isn't a few dots sitting still indoors. Runs on the server, so they show up on any phone like normal teammates

### Screens

1. Welcome (log in, or join with a code)
2. Home (teams, active session, start)
3. Create session (area picker, optional team data to load)
4. Lobby (join code, member colours)
5. Plan (assign blocks, Suggest, Apply)
6. Live map (the main screen)
7. House sheet (A/B/C grade with undo, short note, previous lead info)
8. Team progress (leaderboard, coverage so far)
9. End-of-day stats (with Add to team)
10. Settings (offline map, battery mode)

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
- **Team roles:** owner/admin invites people and can remove sessions. Members can view, upload and make plans

### How the map is drawn

**Paths show effort and recency.** Each session's paths are drawn as their own translucent lines, with visibility = duration × age:

- **Duration:** a drive-by is barely noticeable. Around 30+ minutes on a street is clearly solid
- **Age:** a multiplier that fades paths over an adjustable fade time (default 4 months). After that, old work stays just barely visible
- Repeat visits stack, so a street worked three times looks darker than one worked once

**Block colour shows lead rate** ((A + B leads) ÷ houses worked):

- 🟢 Green: lots of A/B leads, good money-making houses
- 🟡 Yellow: average
- 🔴 Red: no A/B leads
- ⚪ Grey: not enough data yet. A block stays neutral until enough houses have been worked there (e.g. 15+), and small samples are nudged toward the team's average so one lucky lead doesn't paint a block green
- **C leads don't count toward colour.** An area can produce lots of C leads (or one great salesperson can) without the area actually using the service much. C leads are still shown in stats
- The colour scale changes in lightness as well as hue, so it still reads for colour-blind users

### Core features

- **Time slider:** replay how the territory filled in ("show the map as of 3 weeks ago")
- **Filters:** date range, crew, neighbourhood
- **Stats:** coverage, houses worked, distance, leads by grade, and **lead rate** = (A + B leads) ÷ houses worked, per session or per area
- **"Hit X time ago"** for any street or block
- **Where next?:** a simple ranking of how wealthy an area is (census median household income) × how long since it was last hit
- **Previous paths and session history:** replay any past session and see which streets each person walked
- **Plan library** (after the team map works): a boss sits down and makes several plans (blocks assigned per person or pair). The crew picks one in the field, it loads into mobile planning mode, and it's marked as used once a session runs it. Plans belong to the team and can be tied to a map

### Nice to have

- Demographics overlay (income, homeownership, home age, density) and demographics compared with lead rate
- Smarter "where next?" that also uses past lead rate
- Best time to knock, by hour (5–8pm is already the established default)
- Plan vs actual: blocks assigned vs blocks actually worked
- **Gemini add-on:** "ask your data" questions like "which neighbourhoods sold best in October?", answered from the team's data
- CSV export

### Screens

1. Landing page
2. Team dashboard
3. Team map (lead-rate colours, path fade, time slider)
4. Session replay
5. Plan library and members

## Accounts & Data

- Joining a live session: no account needed, just a code and a name
- Uploading to a team and viewing team maps: account and team membership required
- **Uploading:** at the end of a session, anyone in it who's on a team can upload it. Uploads are deduplicated by (team, session ID), so if everyone taps "add" it's only stored once. A session can go to more than one team, once each
- **Loaded team data** (e.g. previous leads) is visible to everyone in the session, including guests, since anyone knocking benefits from references
- **Everyone's paths are uploaded**, including guests without accounts. The join screen says so: "your path may be saved to the crew's team map"
- **Grace period:** session data stays on the server for 7 days so someone can upload it later if everyone skipped the prompt or a phone died. Sessions nobody uploads are deleted after that, and raw GPS points are always deleted after 7 days
- After a session, GPS trails are snapped to streets (map matching). The snapped paths, worked streets, blocks, lead grades and lead notes are saved. No phone numbers or contact details are stored
- **Positioning:** the history is the crew's shared memory, not a way for a manager to track people. Paths are saved as streets walked per session, not a minute-by-minute record of where someone was

## Why It's Different

Every existing app (SPOTIO, SalesRabbit, Knockio, Timeero, etc.) is built manager-down. A boss watches reps from a dashboard. They're CRM-first, $15–50/user/month, and overkill for a small informal crew.

This is peer-to-peer. Teammates see each other, not a manager seeing subordinates. The target user is a 3-person painting crew or summer sales team, not a 50-rep enterprise sales org. Free or near-free pricing.

## Platform Requirement

**Must work on both iOS and Android.** This is non-negotiable. Door-to-door crews are mixed — some people have iPhones, some have Androids. An iOS-only or Android-only app kills the "whole crew joins a session" concept on day one. Every technical decision should be made with cross-platform in mind from the start, not bolted on later.

## Name & Domain

- Working name: **Knockd** — checked on App Store and Google Play, no conflicting app found
- **Domain: `knockd.rodeo`**, registered for the GoDaddy Registry domain prize. The API is at `api.knockd.rodeo`

## Market

Validated market (D2D software is a real category) but the lightweight peer-coordination niche is unserved. Target users: summer sales crews, painting companies, fundraising canvassers, political canvassing teams, small field sales teams. All informal, price-sensitive, coordination-heavy.

**Pricing:** the mobile app (live sessions) is free. Teams, team maps and the web app are paid. No paywall for the hackathon.

## Hackathon

**Prizes we're targeting:**

- 1st/2nd/3rd Overall
- Most Adventurous ("discover the unknown"): the map shows where the crew hasn't been yet
- Best Use of Tiger Data: hypertables for GPS pings, PostGIS for streets and blocks, continuous aggregates for stats
- Best Use of Vultr: hosts the API server (Coolify), realtime sockets and map tiles
- Best Use of Auth0: accounts and team invites
- Best Domain Name from GoDaddy Registry
- Best Use of Entire: use Sessions and Graph while building
- Best Use of Gemini: only if the "ask your data" add-on gets built

Check how many prize tracks one project can enter.

**Who does what:**

| Person  | Owns                                                                                      |
| ------- | ----------------------------------------------------------------------------------------- |
| Jasmine | Mobile app, UI and design                                                                 |
| Tristan | Server, database, Vultr deployment, map matching, map tiles, data scripts, simulated crew |
| Both    | Shared types package, then split the web app                                              |

**Priorities:**

1. Mobile: sessions, area picker, live map, worked vs passed-by streets, blocks, A/B/C leads, planning mode, simulated crew mode, offline
2. Server and database on Vultr + Tiger Data, with uploads to teams
3. Web: team map with paths and lead-rate colours, time slider, stats
4. Everything else in the web section

**Demo (about 3 minutes):**

1. Show the web team map with weeks of seeded Byron history (`pnpm --filter @knockd/server seed:demo`: 12 sessions, 93 leads, lead-rate colours)
2. On the phone, create a session, pick an area, tap Suggest
3. Start simulated crew mode, and the map fills in live
4. Mark an A lead and watch the alert appear for everyone
5. End the session, upload it to the team, and see it on the web map

**Before the event:**

- Basic Expo dev build with background location and MapLibre running on both an iPhone and an Android
- Vultr VM and Tiger Data instance created, domain registered and pointed at the VM
- Agree on the shared types (`packages/shared`) so both sides can build against a mock server
- Map tiles prepared for London (block, street and house data is already imported)

**Demo location:** Byron, centred on **42.9550, -81.3425** (the densest residential spot: ~520 houses within 400 m)

**Biggest risks:**

- Background location on iOS and Android
- Offline map downloads working with Expo
- Battery drain on a long walk (batch pings every 15–30 seconds)
