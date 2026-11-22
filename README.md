# Knockd

A shared live map for door-to-door crews. Plan the area together, see where everyone is, and watch the map fill in as the team works.

Not a CRM and not a manager dashboard. Teammates see each other, and the history is the crew's shared memory.

This README covers the project scope. Technical docs:

- [Backend](docs/BACKEND.md): stack, architecture, data model, deployment
- [API](docs/API.md): REST endpoints and socket events
- [Mobile](docs/MOBILE.md): mobile app (Jasmine)
- [Web](docs/WEB.md): web app

---

## What Inspired Us

I (Tristan) used to sell door to door, and I lived every pain point in this README myself: losing track of teammates, knocking doors someone already did, texting "where are you?", and planning the day by drawing on a screenshot of Google Maps. I'm also a software engineer, which puts me in an unusual spot: I know exactly what the customer wants because I was the customer, and I'm also the one building it.

## How We Built It

We went step by step, and took our time at each one so nothing would go wrong later:

1. **Idea → scope:** what the app does, and just as importantly what it doesn't (no CRM, no manager dashboard)
2. **Scope → structure:** three apps sharing one package of types and logic: `apps/mobile` (the crew's phone app), `apps/web` (the team map), `apps/server` (the API), and `packages/shared`
3. **Structure → stack:** Expo and React Native for the phone, MapLibre for maps on both phone and web, Tiger Data (Postgres with TimescaleDB and PostGIS) for GPS points and map data, Auth0 for accounts, Socket.io for live updates, all hosted on Vultr
4. **Stack → code**

## Challenges

**1. Planning routes people actually want to walk.** A key feature of the phone app is Suggest: select an area and it works out the best way for the crew to knock it. The hard part isn't raw speed. The routes also have to be simple and intuitive for a person to follow, and that changes what "best" looks like. On top of that come real door-to-door tactics: leapfrogging (two people on one side of the street taking turns, house by house) to get more done, and the fact that crossing the road takes time, so the planner penalises every crossing. Balancing all of that took many rounds of comparing its routes with ones we drew by hand.

**2. Turning rough GPS into a polished experience.** GPS is at the core of the app, and it's naturally noisy: points jump around, drift, and drop out. We turn it into clean trails, streets marked as worked or just walked past, and blocks that fill in as the crew covers them. Tiger Data made this possible: TimescaleDB stores and summarises the stream of GPS points, and PostGIS matches the points to real streets and blocks.

## What We Learned

For me (Tristan), it was my first time building a mobile app, and my first time working with maps and location data. Jasmine gained a lot more experience with backend development.

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
4. The crew plans together in **planning mode**, live on everyone's phone: claim blocks, sketch routes and drop notes, or select houses and tap Suggest for ranked routes
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

> **Backend built** (claims, routes, freehand, notes, clear-mine; see "Planning" in [docs/API.md](docs/API.md)). **Suggest is built and tested** in `@knockd/shared` (`suggestRoutes`), ready for the phone UI.

Replaces the screenshot-and-draw huddle at the car. **One shared plan per session**, edited live by anyone, with everyone seeing changes instantly. **No groups to set up and no draft/Apply step.** It supports however a crew likes to plan: people claiming their own areas, an organiser assigning others, pairs, or just sketching routes.

**Colours**

- A **12-colour palette**. Each person gets one as they join (max 8 per session) and keeps it everywhere: their dot, their trail, blocks claimed for them, and anything drawn for them
- The unused colours (always at least 4) are **utility colours**, for instructions not aimed at anyone in particular
- The picker shows teammates' colours first, with a **"More colours"** button for the utility ones, so the toolbar stays small

**Tools** (pick a colour, then use a tool)

- **Claim blocks:** tap blocks to claim them in the selected colour (yours by default). An organiser picks a teammate's colour to claim for them. Two colours on one block = a pair
- **Route:** a dashed line with an arrow tip ("Jasmine, go this way"). Works house by house, without blocks
- **Freehand:** a solid line, for circling or marking boundaries
- **Note:** short text on the map
- **Eraser:** drag over the map, and any drawing it touches is removed whole, **whoever drew it**. Anyone can also unclaim any block or remove any note. No need to ask someone to delete their own
- **Undo / redo:** only your own actions, never a teammate's
- **Clear:** removes only **your own** drawings, notes and claims. Every item records who made it, separately from who it's for

**Suggest** (routes for a set of houses, run on the phone)

1. **Select houses** with a circle brush: every house inside a circle is included and **must be visited**. A circle in deselect mode removes houses (e.g. a corner store or a house to skip)
2. Optionally drop a **regroup pin** for where everyone should end up. Without one, anywhere is fine
3. Tap **Suggest**. The phone plans routes for each way of splitting the crew (taken from the session):
   - **Solo**, **pairs**, **half the crew** and **everyone together** (for 8 people: solo, pairs, quads, all together). Odd numbers form one trio or a solo
4. **Options are ranked by effectiveness**: the most doors in the least time, and everyone ending up close together:
   - **Score = when the last group finishes + time for everyone to regroup** (at the pin, or wherever groups end closest)
   - Every door counts the same. Time = walking (~1.3 m/s) + a fixed ~1 minute per door + ~15 s per road crossing, with doors shared within a group while walking isn't
   - **Crossing the road costs time.** A group walks a street once with one person per side. A solo on a street with houses on both sides goes down one side and back up the other (zigzagging only when that's cheaper, e.g. very few doors). That's why pairs often win on dense two-sided streets
   - Shown like _"Pairs: done ~7:35 pm · regroup near Oakridge & Elm"_
5. **Picking an option** draws a dashed **route per group** in its members' colours and claims their blocks. It replaces the current plan for those houses (and the crew's old dashed routes). Group members are assigned randomly and are easy to swap
6. **Everyone can edit the result:** the routes and claims are ordinary plan items, so anyone in the session can erase, redraw, claim or unclaim them, like any other drawing. Only "clear mine" and undo are limited to whoever applied the suggestion

How it plans:

- Builds a **street network** from the streets the phone already has (segments meet at intersections). Selected houses mark which streets must be walked, and **how far along**: a street the circle only clips, or a dead end, is walked out to the last selected door and back instead of end to end
- For each option, splits the streets into groups **radiating out from the car** like pizza slices, so everyone starts knocking right away, balanced by **estimated time** (walking + doors ÷ group size). Several slice angles are tried per option, keeping the best
- Each group takes its streets nearest first, then the order and direction are improved to cut wasted walking, ending near the regroup pin or the spot that gets everyone together soonest
- It also plans every option a second way, **grow then balance**, and keeps whichever gets everyone back together sooner. Everyone leaves the car towards their own area and takes the next nearest unclaimed door, carrying on the way they're going on the side they're on (a solo only crosses when their side runs out, so two solos can share a busy road one side each). Once someone starts working one side of a street, others leave it to them. Groups then even out by handing the door at the end of a line to a neighbour. Solos don't trade doors (that would send people onto other blocks): they keep their own line and help their buddy when done, and their times count that helping
- **Buddies (solo plans):** each person is paired with the one whose line ends nearest theirs (one trio if the crew is odd). If someone gets held up in a long conversation, the rule needs no phone: when you're done, go to your buddy's last house and work back towards them
- Each group also gets its **knock order**: who knocks which door, in order, from three simple rules. On a two-sided street each person keeps their side (left or right) for the whole route, with no crossing mid-street. On a one-sided street the next door goes to whoever has knocked the fewest so far (a pair leapfrogs A, B, A, B). The houses round the turning circle of a dead end are split into two unbroken runs, one from each side, so totals even out. People aren't tied together: whoever has fewer doors gets ahead, and a group finishes when its busiest person does
- Examples it gets right (they're unit tests): with the car at the bottom of a 2×2 square of blocks (houses on both sides), nobody is sent to the far squares first: **pairs** start knocking right at the car, one per side, and both finish together at the top. With the car in the middle, **solos** each take a quadrant and loop back to the car
- Good heuristics, not a perfect solution (multi-person street routing is a hard problem). Fast on a phone: about 100 to 400 ms for 500 houses on real London streets
- **Try it:** open [docs/suggest-viewer.html](docs/suggest-viewer.html) in a browser. It runs the real Suggest on London streets around the demo spot: paint houses, move the car and regroup pin, and see each option's routes, who knocks which door, and U-turns. To show what it should have done instead, import the viewer's Copy data into [docs/suggest-ideal.html](docs/suggest-ideal.html) and fix it by hand. Open both with `pnpm open:suggest`, and rebuild them after changing Suggest with `pnpm rebuild:suggest-viewer`

**Team layers:** when the session loads team data, the web's **highlights** and **team notes** appear as **read-only** layers that each person can toggle on or off.

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

### Loading team data into a session

Crews use previous leads nearby as references ("we just did a quote for the place down the street"). So a session can show data from a team map:

- When creating a session, a creator with an account can pick one of their team maps (e.g. London D2D) and choose which data to load:
  - **Previous leads:** houses graded in past sessions, with grade and how long ago. On by default, filterable by grade (e.g. A only)
  - **Past coverage:** "hit X time ago" paths, with the same fading as the web map
  - **Lead-rate colours:** blocks coloured green to red
  - **Highlights** and **team notes** made on the web (read-only on the phone)
- Only data inside the session's area is loaded, and it's downloaded when the session starts so it works offline
- Previous leads show a small grade badge on the house. Tap it to see "A lead · 8 months ago"
- The app doesn't know which leads became jobs (that's in the company's CRM), so references are shown as leads, not confirmed customers
- **Everyone in the session sees loaded data**, including guests
- Each person can toggle each layer on or off on their own phone, so the map doesn't get cluttered
- Off by default, so the live map stays focused on today unless the creator loads something

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
5. Plan (colour picker, claim blocks, route, freehand, note, eraser, undo/redo, select houses + Suggest)
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
- **Team roles:**
  - **Owner:** everything, plus inviting people, changing roles, removing people and deleting the team
  - **Editor:** can also create and delete highlights and notes, approve "where next?" suggestions, and remove sessions
  - **Viewer:** sees everything and can upload sessions

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
- **Filters:** date range, map (area)
- **Stats:** the team's **combined** results for an area: coverage, houses worked, distance, leads by grade, and **lead rate** = (A + B leads) ÷ houses worked. Per-person stats and leaderboards exist only inside a single session (and its replay), never across sessions. Keeping per-agent history would turn Knockd into a CRM
- **"Hit X time ago"** for any street or block
- **Previous paths and session history:** replay any past session and see which streets each person walked

### Marking where to go: highlights and notes

> **Backend built** (highlights, notes, session layers; see "Highlights & notes" in [docs/API.md](docs/API.md)). **The "where next?" preview/approve flow and the Gemini note are designed but not built yet.**

Bosses used to send screenshots of Google Maps with highlighter marks on the areas and roads to do. The web does the same, and nothing more: planning blocks or routes ahead of time doesn't work, because time and crew size aren't known until the crew is at the car. Planning happens on the phone.

- **Highlights:** highlighter strokes along roads, or loops around areas, in one of **6 preset colours**. No built-in meaning: the team decides its own convention (e.g. one colour for "great area", another for "avoid"). No text
- **Notes:** short text pinned on the map, for anything that needs explaining
- Shown on the web team map and, when a session loads team data, on phones as **read-only** layers each person can toggle
- **Created and deleted only on the web**, manually, by owners and editors. Highlights look like highlighter strokes (thick, translucent), so they don't blend into the lead-rate block colours

**Where next? → highlight**

- A list of suggested blocks, ranked by how wealthy the area is (census median household income) × how long since it was last hit
- **Preview** a suggestion: the map shows a proposed highlight over the area and a draft note explaining why, e.g. "Not knocked in 4 months · median income $112k · 2 A leads nearby last spring · 38 houses"
- **Approve** to add the highlight and note to the team map (owners and editors), or dismiss it
- **Gemini writes the note** from facts the backend has already worked out, so it explains and doesn't decide anything. If Gemini isn't available, the note falls back to a simple template

### Nice to have

- Demographics overlay (income, homeownership, home age, density) and demographics compared with lead rate
- Smarter "where next?" that also uses past lead rate
- Best time to knock, by hour (5–8pm is already the established default)
- **Gemini "ask your data":** questions like "which neighbourhoods sold best in October?", answered from the team's data
- CSV export

### Screens

1. Landing page
2. Team dashboard
3. Team map (lead-rate colours, path fade, time slider)
4. Session replay
5. Highlights and notes (draw, "where next?" previews), members

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

This is peer-to-peer. Teammates see each other, not a manager seeing subordinates. The target user is a 3–4 person painting or roofing crew, not a 50-rep enterprise sales org. Free or near-free pricing.

**Zero data entry.** Other tools depend on someone marking doors and drawing territories after a long day, which crews don't do. In Knockd the team's history is a by-product of working: GPS trails become worked/passed streets automatically, and the only tap is when there's a lead.

## Platform Requirement

**Must work on both iOS and Android.** This is non-negotiable. Door-to-door crews are mixed — some people have iPhones, some have Androids. An iOS-only or Android-only app kills the "whole crew joins a session" concept on day one. Every technical decision should be made with cross-platform in mind from the start, not bolted on later.

## Name & Domain

- Working name: **Knockd** — checked on App Store and Google Play, no conflicting app found
- **Domain: `knockd.rodeo`**, registered for the GoDaddy Registry domain prize. The API is at `api.knockd.rodeo`

## Market

Validated market (D2D software is a real category) but the lightweight peer-coordination niche is unserved.

**Subscription vs project businesses.** Door-to-door looks different depending on what's being sold:

- **Subscription businesses** (internet, TV, home security, e.g. Rogers): once a house signs up it stays a customer for years, and the company knows exactly who its customers are from billing. Door-to-door is about individual households: knock non-customers, skip customers, win back cancellations. A manager assigns specific houses to reps. This is what SalesRabbit and similar tools are built for
- **Project businesses** (painting, roofing, windows, siding, landscaping, e.g. High Five Painting): a job is done and the relationship ends. The need comes back on its own timeline (paint peels, a storm hits, a house is sold), and no database says which house needs work now. Door-to-door is about **areas over time**: when did we last knock this neighbourhood, what happened, and is it time to go back? Re-knocking every few months is the strategy

Knockd is built for the second kind: trails that fade with age, "hit X time ago", "where next?" ranked by time since last knocked, block lead rates, and previous leads as references. It also explains why marking areas on Google Maps never stuck: what matters is _when_ an area was covered, and a shape on a map doesn't age (and nobody wants to draw them after a long day).

**Target users:** crews in project-based home services (painting, roofing, windows, siding, landscaping), plus canvassing teams (fundraising, political) that also cycle through neighbourhoods. All informal, price-sensitive, coordination-heavy.

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
- Best Use of Gemini: writes the justification note for "where next?" suggestions (and "ask your data" if time allows)

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
2. On the phone, create a session, select houses with the circle brush, tap Suggest and pick the top-ranked option
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
