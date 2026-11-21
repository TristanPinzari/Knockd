# Knockd — Door-to-Door Team Coordination App
*Idea captured June 2026*

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
9. If the creator has an account, the session is saved to the team's history for the web app

## Mobile App (Phase 1)

The mobile app is only about **today**: the live session, the plan, and the stats. Anything about history and how long since an area was knocked belongs in the web app.

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

### End-of-day stats
Plain stats, per person and for the crew: streets worked vs passed, blocks completed, houses covered, sales, distance, active time.

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

Post-session analysis and area planning, built once mobile is done. *Still being scoped.* Ideas so far:

- **Territory Map:** every street the team has worked, coloured by how long ago:
  - 🟢 Green: this week
  - 🟡 Yellow: 1–4 weeks ago
  - 🟠 Orange: 1–3 months ago
  - ⚪ Grey: 3+ months ago, or never worked
- **Time slider:** replay how the territory filled in ("show coverage as of 3 weeks ago")
- **Filters:** by date range, neighbourhood or crew
- **Stats:** "42% of Byron covered in the last 30 days", streets worked per week, distance, sales
- **Where next?:** areas that haven't been worked for the longest time
- **Previous paths:** replay any past session and see which streets each person walked
- **Demographics:** overlay census data (household income, homeownership, home age, density) to judge which areas are worth knocking
- Team and session history

## Accounts & Data

- Joining a live session: no account needed, just a code and a name
- Saving history and viewing it outside a session: account required
- A session is saved to the team of the logged-in person who created it. Sessions created without an account aren't saved
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
- **Auth0** for accounts (shared by mobile and the Phase 2 web app)
- Phase 2 web app: Next.js using the same server API and Google Maps. Demographics come from census data loaded into PostGIS (e.g. Statistics Canada dissemination areas)
- **Gemini:** no role on mobile. Possibly a role in the web app, to be decided

```
Phones  <--websockets-->  Vultr VM                    -->  Tiger Data
                          ├─ Node/Socket.io server         (Postgres + PostGIS)
                          └─ OSRM map matching
```

Later, Firebase could take over the live layer (offline queueing, auto-reconnect) while Tiger Data keeps the permanent history. Not needed for the MVP.

## Name & Domain

- Working name: **Knockd** — checked on App Store and Google Play, no conflicting app found
- knockd.com is available for purchase (check Namecheap/GoDaddy for price)
- knockdd.com is registered but abandoned (error page)
- getknockd.com or knockdapp.com are cheap fallback options
- Domain matters less than the app store presence for this type of product

## Market

Validated market (D2D software is a real category) but the lightweight peer-coordination niche is unserved. Target users: summer sales crews, painting companies, fundraising canvassers, political canvassing teams, small field sales teams. All informal, price-sensitive, coordination-heavy.

## Why I'm Shelving It (For Now)

- Notify takes priority — further along, real pitch lined up
- No mobile experience yet, need to get Expo basics first
- Door-to-door season is summer; want to be able to dogfood it myself
- Come back to this September/October, build over winter, ready for next summer

## Next Steps When Returning

- Spend a weekend getting comfortable with Expo
- Build the live location sharing piece as a standalone proof of concept
- Find a painting crew or sales team willing to beta test
- Consider the name — "painting the map" is literally what the app does and what the users do for work
