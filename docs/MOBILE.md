# Knockd Mobile

How to build the phone app (Expo, React Native). What the app should do is in the [README](../README.md#mobile-app-phase-1). Every endpoint and socket event is in [API.md](API.md). This page covers how to put it together: setup, build order, and what each screen calls.

The server is live at `https://api.knockd.rodeo` and everything below already works against it. Nothing on the backend needs to change for the app to be built.

---

## 1. Setup

### Create the app inside the monorepo

```powershell
cd apps
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
```

Add the shared package to `apps/mobile/package.json`, then run `pnpm install` from the repo root:

```json
"dependencies": {
  "@knockd/shared": "workspace:*"
}
```

`@knockd/shared` ships TypeScript source (no build step), so Metro compiles it like your own files. Recent Expo versions set up Metro for monorepos automatically. If Metro says it can't find `@knockd/shared` or a package inside it (e.g. `zod`), add `node-linker=hoisted` to a `.npmrc` at the repo root, reinstall, and tell Tristan.

### Libraries

| Need                               | Library                                                      |
| ---------------------------------- | ------------------------------------------------------------ |
| Map                                | `@maplibre/maplibre-react-native`                            |
| Login                              | `react-native-auth0`                                         |
| GPS, including with the screen off | `expo-location` + `expo-task-manager`                        |
| Live updates                       | `socket.io-client`                                           |
| IDs for offline writes             | `expo-crypto` (`Crypto.randomUUID()`)                        |
| Saving the queue and cached data   | `@react-native-async-storage/async-storage` or `expo-sqlite` |
| Screens                            | `expo-router`                                                |

MapLibre and Auth0 have native code, so **Expo Go won't run the app**. Use a development build (`npx expo run:android` / `npx expo run:ios`, or EAS Build) from day one.

### Environment

`apps/mobile/.env` (Expo exposes `EXPO_PUBLIC_*` variables to the app):

```
EXPO_PUBLIC_API_URL=https://api.knockd.rodeo
EXPO_PUBLIC_AUTH0_DOMAIN=dev-38gdunm50atj1prl.us.auth0.com
EXPO_PUBLIC_AUTH0_CLIENT_ID=27uxMSEwhyQwXQnTuRoBmrJlYUhZVGgr
EXPO_PUBLIC_AUTH0_AUDIENCE=https://api.knockd.rodeo
```

None of these are secret (they ship inside the app), but keep `.env` out of git anyway.

- **Bundle ID / package name:** `rodeo.knockd.app` (set `ios.bundleIdentifier` and `android.package` in `app.json`). The Auth0 callback URLs are registered for it: `rodeo.knockd.app.auth0://dev-38gdunm50atj1prl.us.auth0.com/ios/rodeo.knockd.app/callback`, and the same with `/android/`. If you change the ID, tell Tristan so he updates Auth0
- **Login:** request scope `openid profile email offline_access` and the audience above. The audience makes the token work with the API; `offline_access` gives a refresh token so people stay logged in
- **Running the server locally** is optional. If you do, a phone can't reach `localhost`: use your computer's LAN IP in `EXPO_PUBLIC_API_URL`

---

## 2. Build order

Each step gives you something you can demo. Don't start one until the one before works on a real phone.

1. **Map on screen:** MapLibre with the style URL, centred on Byron (`42.955, -81.3425`)
2. **Join and see people:** create or join a session as a guest, connect the socket, show members as coloured dots. Use the simulated crew (`POST /sim`) so dots move indoors
3. **Send your own GPS:** background location → ping queue → `POST /pings`. Check that your dot moves on a second phone
4. **Trails:** load `/trails`, append `positions`, draw with `trailToGeoJSON`
5. **Houses and leads:** load `/area` cells, draw houses, long-press → A/B/C → `POST /leads`, lead alerts
6. **Planning:** claim blocks, route, freehand, note, eraser, undo/redo, clear mine
7. **Suggest:** select houses with the brush → Suggest → pick an option
8. **End of day:** end the session, stats, upload to a team
9. **Accounts and team data:** Auth0 login, `/me`, loading a team map into a session
10. **Offline and battery polish:** offline tile packs, queue persistence, a real one-hour test walk

The order matters: steps 2–5 are the demo. Planning and Suggest come after because they're useless without the live map.

---

## 3. The pieces everything else uses

Build these once, early.

### API client

One function, like the web's [api.ts](../apps/web/src/api.ts):

```ts
async function api<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok)
    throw Object.assign(new Error(body?.error?.message ?? res.statusText), {
      status: res.status,
      code: body?.error?.code,
    });
  return body as T;
}
```

Response types come from `@knockd/shared`: `api<SessionSnapshotRes>(...)`, `api<SessionAreaRes>(...)`, and so on. Show `error.message` to the user: the server writes it for people.

### Two tokens

|                | Account token (Auth0)                        | Session token                                           |
| -------------- | -------------------------------------------- | ------------------------------------------------------- |
| Where from     | `react-native-auth0` login                   | the response of `POST /v1/sessions` or `/sessions/join` |
| Used for       | `/v1/me`, `/v1/teams/...`, `/v1/invites/...` | everything under `/v1/sessions/:id/...`, and the socket |
| Guests have it | no                                           | yes                                                     |
| Lasts          | refreshed by the SDK (`getCredentials()`)    | 8 days                                                  |

- When a logged-in user creates or joins a session, **send the account token on that create/join call**. That links the session to their account, which is required to upload it to a team later. All the session's other calls use the session token
- Save the active session (`session.id`, `member.id`, `token`) on the phone, so reopening the app goes straight back into it

### Socket

```ts
import { io, Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@knockd/shared";

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(API_URL, {
  auth: { token: sessionToken },
  transports: ["websocket"],
});
```

- **The socket only receives.** The one thing you send on it is `plan:edit`. Pings, leads, pins and messages all go over REST (it keeps working in the background and makes the offline queue simple)
- **On every connect (the first one and reconnects):** fetch `GET /v1/sessions/:id` (the snapshot), `GET /trails?since=<newest point you have>`, and `GET /messages?after=<last message id>`, then replace your state. Anything you missed while disconnected comes back this way
- When the app comes back to the foreground, check `socket.connected`; reconnect if needed

### Session state

Keep one store (React context + `useReducer`, or Zustand) for the session, filled from the snapshot and updated by socket events:

| State             | Starts from (snapshot) | Updated by                                                   |
| ----------------- | ---------------------- | ------------------------------------------------------------ |
| `members`         | `members`              | `member:joined`, `member:left`, `member:status`              |
| trails            | `GET /trails`          | `positions` (append; the newest point is the person's dot)   |
| `leads`           | `leads`                | `lead:new`, `lead:updated`, `lead:removed` (key: `clientId`) |
| `pins`            | `pins`                 | `pin:new`, `pin:removed` (key: `clientId`)                   |
| `messages`        | `messages`             | `message:new`                                                |
| `plan`, `version` | `plan`, `planVersion`  | `plan:updated` (see Planning below)                          |
| `status`          | `session.status`       | `session:ended`, `session:processed`                         |

The server broadcasts your own writes back to you too. Make every handler safe to run twice (upsert by `clientId` or `id`), so an item you added optimistically isn't duplicated.

### Offline queue

Every write a phone makes in the field (pings, leads, lead edits and deletes, pins, messages) goes through one queue:

1. Give the item a `clientId` from `Crypto.randomUUID()` **when it's created**, and show it on screen right away
2. Add the request (method, path, body) to a list **saved on the phone**
3. A loop sends the list in order. On success, remove the item. On a network error or a 5xx, stop and retry later (every ~15 s, and as soon as the connection comes back). On a 4xx other than 401/408/429, drop the item and tell the user, since retrying won't help
4. Sending the same `clientId` twice is safe: the server returns the existing item, so retrying after a timeout never makes duplicates

Planning edits are **not** queued (they need a connection; see Planning).

---

## 4. Screens

The pages, in the order a user meets them:

| #   | Page                                        | Purpose                                                                                                                                                                     |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Welcome**                                 | Log in, or join a session with a code and just a name (no account)                                                                                                          |
| 2   | **Home**                                    | Your teams, get back into an active session, start or join one. Logged-in users also see recent sessions not uploaded yet                                                   |
| 3   | **Create session**                          | Your name, then Create. No area to pick (see "The session area"). Logged in: optionally load a team map's data (past leads, coverage, lead-rate colours, highlights, notes) |
| 4   | **Join**                                    | Enter the 6-character code and your name. Clear errors for a wrong code, a full session or an ended one                                                                     |
| 5   | **Lobby**                                   | The join code to share, and who's in, each in their colour. The creator (session admin) can remove people or add the simulated crew                                         |
| 6   | **Live map** (the main screen)              | Everyone's dots and trails, houses and blocks, leads, pins, the plan, lead alerts. Chat (a panel) and dropping pins happen here                                             |
| 7   | **Plan** (a mode of the live map)           | Plan together: colour picker, claim blocks, route, freehand, note, eraser, undo/redo, clear mine, plus the house brush and Suggest                                          |
| 8   | **House sheet** (pops up from a long-press) | Grade a lead A/B/C with undo, add a short note, see past lead info ("A lead · 8 months ago")                                                                                |
| 9   | **Team progress**                           | In-session leaderboard (leads per person by grade) and coverage so far                                                                                                      |
| 10  | **End of day**                              | Stats per person and for the crew, and "Add to team?" for logged-in users                                                                                                   |
| 11  | **Settings**                                | Download the area's map for offline use, and battery-saving mode                                                                                                            |

For each page below: what it shows, and the calls it makes.

### Welcome

- **Log in** (Auth0) or **Join with a code** (no account: just a name)
- After login, call `GET /v1/me` once. It creates the user on first call and returns their teams

### Home

- Teams (from `/v1/me`), the active session if one is saved, a **Start a session** button and a **Join** button
- Logged-in users: `GET /v1/me/sessions` lists recent sessions, including ended ones not uploaded yet (kept 7 days), for "Add to team" later

### Create session

1. Name (prefilled from the account)
2. **No area step.** The app sends a 400 m circle around where the host is standing (see "The session area"). Without a location fix, say location is needed and don't create the session
3. Logged in, optional: pick a team map, and which layers to load (`leads` on by default; `coverage`, `leadRate`, `highlights`, `notes`)
4. `POST /v1/sessions` with `{ displayName, location, area: { kind: "circle", center: location, radiusM: 400 }, loadMap? }`, plus the account token if logged in
5. Save `{ session, member, token }` from the response → Lobby

**Accounts, built** (step 9):

- **Login is optional**, top right of Welcome ("Log in", or your name: tap to log out). Auth0 with the scope and audience above; the refresh token keeps you logged in. Without the `EXPO_PUBLIC_AUTH0_*` settings the app runs guest-only
- After login, `GET /v1/me` gives your name (filled into the name fields) and teams (listed on Welcome)
- **Create and join send the account token when logged in**, so the session is linked (`linked` on the saved session). Only linked sessions can be added to a team
- **Create session, logged in:** "Show previous leads from a team map" lists every map on your teams. Picking one sends `loadMap` with the `leads` layer. Previous leads draw as hollow rings (today's are solid), and the house sheet says "Previous lead: A · 8 months ago". Coverage, lead-rate colours, highlights and notes aren't drawn on the phone yet, so they aren't offered
- **End of day:** "Add to your team's map" with one button per team (`POST /v1/teams/:id/sessions`), or a short note saying why not (logged out, joined as a guest, or no team yet)
- Code: `src/account/` (`AccountProvider.tsx`: Auth0 and loading your teams; `accountStore.ts`: what screens read, plus `getAccountToken()`; `AccountBar`, `useTeamMaps`, `AddToTeam`)
- **Needs a new development build** (Auth0 is native code). The callback URLs for `rodeo.knockd.app` are already set in Auth0

### Join

- Code (6 characters: digits and capital letters, no 0/O/1/I/L) and a name → `POST /v1/sessions/join` (with the account token if logged in)
- Show these errors plainly: `404` "No session with that code", `409 session_full` "That session is full (8 people)", `410` "That session has ended"

### Lobby

- The join code (big, and with a share button) and members in their colours, live from `member:joined`
- The creator (`member.id === session.createdByMemberId`) is the session admin: only they see **End session**, **Remove** on members, and **Add simulated crew** (`POST /sim` with `{ bots: 3, pace: "demo" }`)

### Live map (the main screen)

Layers, bottom to top:

1. **Basemap:** `${API_URL}/tiles/style.json`
2. **Team data** (only if a map was loaded): `GET /layers?cells=...` with the same cells as the area. Each person toggles each layer on their own phone
3. **Blocks and houses** from `/area` (see "Loading the map data" below). Blocks fill with the claimer's colour
4. **Plan:** claims, routes (dashed, arrow tip), freehand, notes
5. **Trails:** one `trailToGeoJSON` collection per member, coloured by member, line width by `mode`
6. **Leads:** houses with A/B/C badges
7. **Pins** and **member dots**

Also on this screen: the leaderboard button, chat, drop a pin, the planning toolbar, and the lead alert banner.

**Trails, exactly:**

```ts
// GET /trails gives tuples; trailToGeoJSON wants objects.
const points = trail.points.map(([t, lat, lng]) => ({ t, lat, lng }));
// positions events give ISO times: convert as you append.
points.push({ t: Date.parse(p.t), lat: p.lat, lng: p.lng });
const geojson = trailToGeoJSON(memberId, points);
```

Style the line on `["get", "mode"]`: `knocking` thick and solid, `walking` thin, `driving` faint. Only recompute a member's trail when their points change, not on every render.

**Lead alert:** on `lead:new` from someone else, show a banner ("Jas just got an A lead on Oak St!", using `memberName`), make a short vibration, and flash the house on the map.

### House sheet (long-press a house)

Don't use double-tap: that zooms the map.

- **A / B / C** buttons → `POST /leads` with `{ clientId, t: new Date().toISOString(), houseId, grade }` through the queue
- **Undo** for a few seconds → `DELETE /leads/:clientId`
- Optional note (max 140 characters) → `PATCH /leads/:clientId` with `{ note }`. Changing the grade uses the same call
- If team leads are loaded: "A lead · 8 months ago" from the `/layers` lead's `at`

### Team progress

`GET /v1/sessions/:id/stats`: leads per person by grade (the leaderboard), plus streets worked, blocks completed and houses covered. Refresh when the screen opens and after each `lead:new`. Distances are estimates until the session is processed.

### End of day

1. The admin taps **End session** → `POST /end`. Everyone gets `session:ended`: stop GPS tracking, flush the queue, show "Wrapping up…"
2. Wait for `session:processed` (usually seconds), then show `GET /stats` per person and for the crew
3. **Add to team:** for logged-in users who were in the session while logged in, list their teams: "Add to High Five Painting?" → `POST /v1/teams/:teamId/sessions` with `{ sessionId }` (account token). Uploading twice is harmless
4. Clear the saved active session

**Built** (step 8, except Add to team, which needs login from step 9):

- **Ending:** the admin's End session first sends whatever is still queued (pings, leads), then calls `POST /end`. Other phones get `session:ended` and also send their queue. Sending gives up after 8 s, so no signal never blocks the screen. The session is then kept as the "finished session" (`src/session/finishedSessionStore.ts`, in memory) so the End of day screen can still use its token
- **End of day** (`app/end.tsx`): "Wrapping up…" while it polls `GET /stats` every 3 s until `final` (up to a minute, then shows the estimates with a note). Then six crew tiles (houses covered, leads by grade, streets worked and passed, blocks completed, distance, active time) and one row per person, best leads first, with "(you)" highlighted. People who left show as "A teammate"
- Code: `src/session/endOfDay.ts` (rows and labels, tested), `useEndOfDay.ts` (loading), the ending order in `lifecycle.ts` (tested)

### Settings

Offline map download for the session area, and a battery-saving option (record less often).

**Built** (step 10) as an "In the field" card in the Live map's menu, not a separate screen:

- **Battery saver** switch: GPS mode `saver` (balanced accuracy, every ~25 m, sent every 30 s) instead of `standard` (every ~10 m, every 15 s). Switching restarts tracking cleanly
- **Offline map:** the status of the automatic download ("Downloading the area: 42%", "Saved", or "Couldn't download")
- The outbox (pings, leads, pins, messages) was already saved on the phone in SQLite, so it survives no signal and an app restart

---

## 5. How-tos

### The session area

Users never pick, see or think about the area. It's only how the app decides which houses to load and which houses Suggest plans over.

- **Start:** a circle of `MIN_AREA_RADIUS_M` (400 m) around the host when they create the session. That's what `POST /v1/sessions` stores as `plannedArea`; its centre is the session centre
- **Padding:** the area always reaches `AREA_PADDING_M` (250 m) past the furthest point anyone has been (live positions and every trail point)
- **Grows:** when someone walks into the padding, the radius grows to `distance from centre + padding`. It never shrinks
- **Each phone works it out itself** from the positions and trails it already has, so the server API doesn't change and nothing is shown. Phones that join late get the same result once `/trails` loads
- Code: `apps/mobile/src/area/workingArea.ts` (`startingArea`, `growRadiusM`), stored as `areaRadiusM` in the area store

### Loading the map data (`/area`)

The map is divided into cells about 1 km across. `@knockd/shared` has the helpers:

```ts
import { cellIdFor, cellsAround } from "@knockd/shared";
const ids = cellsAround(myLocation); // cells within 500 m
```

- On session start, load the cells covering the working area (`cellsAround(centre, areaRadiusM)`, see "The session area") plus `cellsAround` each member. Load more each time the area grows
- As anyone moves, check `cellsAround(theirPosition)` and fetch cells you don't have yet: `GET /v1/sessions/:id/area?cells=a,b,c` (up to 25 per request)
- **Dedupe:** a street or block crossing a cell edge appears in both cells. Merge by `streetId` and `blockId`; houses never repeat
- **Cache every cell on the phone.** Area data doesn't change during a day, and it's what makes the map work without signal
- Keep the raw cell responses: Suggest takes them as they are (see below)

### Recording GPS (with the screen off)

```ts
Location.startLocationUpdatesAsync(TASK, {
  accuracy: Location.Accuracy.High,
  distanceInterval: 10, // only after moving ~10 m
  deferredUpdatesInterval: 15_000, // batch delivery
  pausesUpdatesAutomatically: true, // iOS: let GPS rest when standing still
  showsBackgroundLocationIndicator: true,
  foregroundService: { notificationTitle: "Knockd", notificationBody: "Sharing your location with your crew" },
});
```

- In the task, turn each location into a ping `{ clientId, t, lat, lng, accuracy }`, **save it to the queue first**, then send queued pings as one `POST /pings` (max 500 per request) every 15–30 s
- The background task can't read your React state: save the session ID and token where the task can read them (storage), and read them inside the task
- Ask for "Allow all the time" on Android and "Always" on iOS, after explaining why. Background location needs a development build, and the right permission text in `app.json`
- Start tracking when the session starts; stop it on `session:ended`, leave, or removal
- Do a one-hour test walk early, with the battery percentage noted before and after

### Planning

The plan is one object per session, shared by everyone. Edit it by sending ops over the socket, and draw whatever the server sends back.

```ts
import { applyPlanEdit, type PlanEditOp } from "@knockd/shared";

function edit(op: PlanEditOp) {
  setPlan((p) => applyPlanEdit(p, op, myMemberId)); // instant, the same code the server runs
  socket.emit("plan:edit", op, (res) => {
    if (!res.ok) {
      showToast(res.error);
      refetchPlan();
    } // e.g. not connected, session ended
  });
}

socket.on("plan:updated", ({ plan, version }) => {
  if (version <= myVersion) return; // old news
  if (version > myVersion + 1) return refetchPlan(); // missed one: GET /plan
  setPlan(plan);
  setMyVersion(version);
});
```

- **Tools:** claim (tap a block → `claim`; tap again → `unclaim`), route and freehand (`draw`, with an `id` from `randomUUID()` and the drawn points), note (`note`), eraser (drag; send `erase` for each drawing the finger touches), clear mine (`clearMine`)
- **Colour picker:** members' colours first, then "More colours" for `utilityColours(memberColours)`. A member colour sets `memberId`; a utility colour sets `colour`. Exactly one of them must be set
- **Undo/redo** are your own ops reversed: undo `claim` → `unclaim`, `draw` → `erase`, `note` → `removeNote`. Keep the stroke or note so redo can send it again
- Planning edits need a connection. If the ack fails, say "Didn't save: no connection", don't queue it

**Built** (step 6). The pencil button on the Live map opens planning mode; Done closes it:

- **Tools:** Move (the map moves as usual), Claim (tap blocks), Route, Draw, Note (tap the map; tap a note to edit or delete it), Eraser (drag over lines and notes; tap a claimed block to unclaim everyone on it). Route, Draw and Eraser take over one-finger drags, so switch to Move to pan
- While planning, every loaded block shows a dashed outline. Claimed blocks fill in the claimer's colour, and a pair's block is outlined in the second person's colour. Every route gets an arrow tip
- Colours: you first, then the crew, then "More colours" for utility ones. Claims need a person
- Undo/redo cover only your own actions, including undoing an erase of a teammate's line
- Code: `src/plan/planOps.ts` (ops per tool, the eraser, undo; pure and tested), `planEditor.ts` (tool, colour, undo stacks, sending), `planGeo.ts` (plan → map GeoJSON), `usePlanning.ts` (taps and strokes → ops); UI in `src/ui/plan/`; map layers in `src/map/layers/PlanLayers.tsx`

### Suggest (runs on the phone)

To see what it should look like, open [suggest-viewer.html](suggest-viewer.html) in a browser (or run `pnpm open:suggest`). It runs the same `suggestRoutes`, and shows routes, two-colour dashes for groups, numbered houses, U-turn badges and the walk to the meeting point.

1. **Select houses** with a circle brush (and an unselect brush). Keep the selection as a `Set<number>` of house IDs
2. Optional: the user drops a **regroup pin**
3. On the **Suggest** button (show a spinner: it takes about 100–400 ms for 500 houses):

   ```ts
   import { suggestInputFromArea, suggestRoutes } from "@knockd/shared";

   const { secondsPerDoor } = await api<DoorTimeRes>(`/v1/sessions/${id}/door-time`, {}, token);
   const result = suggestRoutes({
     ...suggestInputFromArea(cachedCells, selectedHouseIds), // the raw /area cells
     memberIds: members.map((m) => m.id), // bots too: simulated crew walk their claimed blocks
     start: carOrMyLocation,
     regroup: regroupPin ?? undefined,
     secondsPerDoor,
   });
   ```

4. **Show `result.options`** (already sorted best first): the `label`, and `togetherS` as a time ("done ~7:35 pm"). For the selected option draw each group's `route` as a dashed line in its members' colours (two colours alternating for a pair), and `toMeet` (the walk to the meeting point) fainter
5. **Who knocks what:** colour each house by its `knocks[].memberId`, and number it by its position in **that person's own** list
6. **U-turns:** put a clear badge wherever a route turns back on itself (dead ends, or one side of a street then back up the other). Always show these
7. Move the car and pin markers to `result.start` and `result.regroup` (Suggest snaps them onto the nearest street). If `unroutedHouseIds` isn't empty, warn that those houses have no known street
8. **Swapping people:** swap `memberIds` between groups, and the `memberId`s in their `knocks`
9. **Picking an option:** send each op from `suggestionToPlanOps(option, plan, () => Crypto.randomUUID())` with `plan:edit`, **in order**. The routes and claims become normal plan items anyone can edit

**Built** (step 7). In planning mode, tap **Suggest**:

- **Select / Unselect** brush houses (a circle about 28 px across, the same on screen at any zoom). **Car** and **Meet pin** are one tap on the map. Without a car, routes start at this phone's location (or the session centre)
- **Suggest** fetches the door time, then plans every crew split for everyone in the session, bots included (the simulated crew walk the blocks claimed for them)
- **Pick a plan:** options best first, each with "back together ~7:35 pm" and how much longer than the best. The chosen one previews on the map with the normal route layers (dashed routes in group colours, houses coloured and numbered per person) plus the walk to the meeting point, dotted and fainter. Tap a person, then someone in another group, to swap them
- **Use this plan** sends the ops through the plan editor, so it can be undone like any edit. **Change houses** goes back to the selection
- **U-turns:** every drawn route, previewed or saved, gets a "U" badge wherever it turns back on itself (`src/routes/uTurns.ts`)
- Code: `src/suggest/` (`suggestView.ts`: brush, preview, swaps, labels; `suggestStore.ts`: the flow; `useSuggestMap.ts`: map data and brush), panel in `src/ui/plan/SuggestPanel.tsx`, map layers in `src/map/layers/SuggestLayers.tsx`
- Known gap: once saved, door numbers come from the shared plan (`src/routes/fromSharedPlan.ts`, which works them out again from the routes and claims), so they can differ slightly from the preview's

### Pins and chat

- Pin: `POST /pins` with `{ clientId, lat, lng, label? }` (label max 80). Remove: `DELETE /pins/:clientId`
- Chat: `POST /messages` with `{ clientId, body }`. Both go through the queue

### Offline map tiles

The tiles are standard XYZ (`/tiles/{z}/{x}/{y}.mvt`), so MapLibre's offline manager can download a pack. Download the working area's bounds at zooms 12–16 on session start, while there's signal, and the new ring when the area grows.

**Built** (`src/map/useOfflineArea.ts`, `planSessionPack` / `ensureSessionPack` in `src/map/offline.ts`, tested): 5 s after the session centre is known or the area grows, the phone downloads the area plus 300 m as one pack named after the session and radius. Packs from older sessions, and this session's smaller one, are deleted, so only today's area is kept.

---

## 6. Testing without a crew

- **Simulated crew:** as the session admin, `POST /v1/sessions/:id/sim` with `{ bots: 3, pace: "demo" }`. Bots join with their own colours, walk real streets, send pings and mark the odd lead, exactly like phones. `DELETE /sim` stops them
- **Two phones** (or a phone and an emulator) in one session is the best test for live updates, the plan sync and lead alerts
- **Offline:** turn on airplane mode, mark leads and walk, turn it off, and check everything arrives once
- **The website** (`pnpm --filter @knockd/web dev`) shows uploaded sessions on a team's map, so you can check an upload end to end

---

## 7. Gotchas

- **Coordinates:** the API uses `{ lat, lng }`. GeoJSON and MapLibre use `[lng, lat]`. Mixing them up puts everything in Antarctica
- **Times:** the API sends ISO strings. `/trails` points use milliseconds (`tMs`). Convert before mixing them
- **House IDs and block IDs are numbers**; member, session, lead and pin IDs are UUID strings
- **Max 8 people** per session, simulated bots included
- **Sessions end automatically after 12 hours.** Handle `session:ended` arriving at any time
- **`410 session_ended`** on any session call means it's over: stop tracking and go to End of day
- **`401`** on a session call means the token was revoked (removed by the admin) or expired: leave the session screen
- Don't refetch the whole session on every socket event. The events carry what changed
- **Questions about the API:** ask Tristan. Request and response shapes in `@knockd/shared` are the truth if this page and the code ever disagree
