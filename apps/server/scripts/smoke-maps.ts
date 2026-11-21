/**
 * Smoke test for team maps, the plan library and loading team data into a session.
 * Walks a real Byron street in one session, uploads it, then queries it back every way the
 * web map and sessions do. Logs in as the Auth0 smoke test app (see smoke-accounts.ts).
 * Usage: pnpm --filter @knockd/server smoke:maps [baseUrl]
 */
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { io } from "socket.io-client";
import { cellsAround, type LatLng, type Ping, type SessionAccessRes } from "@knockd/shared";

if (existsSync(".env")) process.loadEnvFile(".env");
const BASE = process.argv[2] ?? "http://localhost:3000";
const { AUTH0_DOMAIN, AUTH0_AUDIENCE, AUTH0_TEST_CLIENT_ID, AUTH0_TEST_CLIENT_SECRET } = process.env;
const CENTRE = { lat: 42.955, lng: -81.3425 }; // Byron demo location
const BYRON_BBOX = "-81.36,42.945,-81.325,42.965";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `  (${detail})` : ""}`);
}
async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
const metres = (a: LatLng, b: LatLng) =>
  Math.hypot((b.lat - a.lat) * 111_320, (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));
function along(line: LatLng[], stepM: number): LatLng[] {
  const out: LatLng[] = [line[0]!];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const seg = metres(a, b);
    let d = stepM - carry;
    while (d <= seg) {
      out.push({ lat: a.lat + ((b.lat - a.lat) * d) / seg, lng: a.lng + ((b.lng - a.lng) * d) / seg });
      d += stepM;
    }
    carry = seg - (d - stepM);
  }
  return out;
}

// ---------- log in, team, maps ----------
const login = (await (
  await fetch(`https://${AUTH0_DOMAIN!.replace(/^https?:\/\//, "")}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: AUTH0_TEST_CLIENT_ID,
      client_secret: AUTH0_TEST_CLIENT_SECRET,
      audience: AUTH0_AUDIENCE,
    }),
  })
).json()) as { access_token: string };
const token = login.access_token;
const teamId: string = (await call("POST", "/v1/teams", { name: "Smoke Maps" }, token)).json.team.id;

const world = await call("POST", `/v1/teams/${teamId}/maps`, { name: "World Map" }, token);
const byronBoundary = {
  type: "Polygon",
  coordinates: [
    [
      [-81.37, 42.94],
      [-81.31, 42.94],
      [-81.31, 42.97],
      [-81.37, 42.97],
      [-81.37, 42.94],
    ],
  ],
};
const byron = await call("POST", `/v1/teams/${teamId}/maps`, { name: "Byron", boundary: byronBoundary }, token);
const downtownBoundary = {
  type: "Polygon",
  coordinates: [
    [
      [-81.26, 42.98],
      [-81.23, 42.98],
      [-81.23, 43.0],
      [-81.26, 43.0],
      [-81.26, 42.98],
    ],
  ],
};
const downtown = await call(
  "POST",
  `/v1/teams/${teamId}/maps`,
  { name: "Downtown", boundary: downtownBoundary },
  token,
);
check(
  "create maps: World (no boundary), Byron, Downtown",
  world.status === 201 && byron.json?.map?.boundary?.type === "MultiPolygon" && downtown.status === 201,
);
const W = `/v1/maps/${world.json.map.id}`;

// ---------- one session: walk a street door to door, mark a lead, upload ----------
const area = { kind: "circle", center: CENTRE, radiusM: 400 };
const s1 = (await call("POST", "/v1/sessions", { displayName: "Mapper", location: CENTRE, area }, token))
  .json as SessionAccessRes;
const S1 = `/v1/sessions/${s1.session.id}`;
const areaRes = await call("GET", `${S1}/area?cells=${cellsAround(CENTRE).join(",")}`, undefined, s1.token);
type StreetF = { properties: { streetId: number; lengthM: number }; geometry: { coordinates: [number, number][] } };
const houseStreets = new Map<number, number[]>();
let streetA: StreetF | undefined;
for (const cell of areaRes.json.cells)
  for (const h of cell.houses.features as { properties: { houseId: number; streetId: number } }[])
    houseStreets.set(h.properties.streetId, [...(houseStreets.get(h.properties.streetId) ?? []), h.properties.houseId]);
for (const cell of areaRes.json.cells)
  for (const f of cell.streets.features as StreetF[])
    if (!streetA && f.properties.lengthM > 100 && (houseStreets.get(f.properties.streetId)?.length ?? 0) >= 15)
      streetA = f;
check("found a street with 15+ houses", !!streetA);
const pings: Ping[] = [];
let t = Date.now() - 20 * 60_000;
for (const p of along(
  streetA!.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
  2,
)) {
  pings.push({ clientId: randomUUID(), t: new Date(t).toISOString(), ...p, accuracy: 5 });
  t += 5000;
}
await call("POST", `${S1}/pings`, { pings }, s1.token);
const leadHouse = houseStreets.get(streetA!.properties.streetId)![0]!;
await call(
  "POST",
  `${S1}/leads`,
  { clientId: randomUUID(), t: new Date(t).toISOString(), houseId: leadHouse, grade: "A", note: "loved our work" },
  s1.token,
);
const socket = io(BASE, { auth: { token: s1.token }, transports: ["websocket"] });
await new Promise((r) => socket.on("connect", () => r(null)));
const processed = new Promise((r) => socket.on("session:processed", () => r(true)));
await call("POST", `${S1}/end`, undefined, s1.token);
await Promise.race([processed, new Promise((r) => setTimeout(r, 60_000))]);
socket.close();
const up = await call("POST", `/v1/teams/${teamId}/sessions`, { sessionId: s1.session.id }, token);
check("walk a street, mark a lead, end, upload", up.json?.uploaded === true);

const replay = await call("GET", `/v1/teams/${teamId}/sessions/${s1.session.id}`, undefined, token);
check(
  "session replay: path, worked street, lead with note, final stats",
  replay.json?.paths?.features?.length === 1 &&
    replay.json?.coverage?.features?.some(
      (f: { properties: { classification: string } }) => f.properties.classification === "worked",
    ) &&
    replay.json?.leads?.[0]?.note === "loved our work" &&
    replay.json?.stats?.final === true,
  `${replay.json?.paths?.features?.[0]?.properties?.distanceM} m walked`,
);
check(
  "replay of a session not on the team → 404",
  (await call("GET", `/v1/teams/${teamId}/sessions/${randomUUID()}`, undefined, token)).status === 404,
);

// ---------- map queries ----------
const paths = await call("GET", `${W}/paths?bbox=${BYRON_BBOX}`, undefined, token);
const worked = paths.json?.features?.filter(
  (f: { properties: { classification: string } }) => f.properties.classification === "worked",
);
check(
  "paths: the walked street, worked, with duration",
  worked?.length >= 1 && worked[0].properties.durationS > 0,
  `${paths.json?.features?.length} segments`,
);
const before = new Date(Date.now() - 60 * 60_000).toISOString();
const old = await call("GET", `${W}/paths?bbox=${BYRON_BBOX}&asOf=${before}`, undefined, token);
check("time slider: asOf before the session → nothing", old.json?.features?.length === 0);

const blocks = await call("GET", `${W}/blocks?bbox=${BYRON_BBOX}`, undefined, token);
const leadBlock = blocks.json?.blocks?.find((b: { leads: { A: number } }) => b.leads.A === 1);
check(
  "blocks: the lead's block has a lead rate (15+ houses worked)",
  !!leadBlock && leadBlock.rate > 0 && leadBlock.rate <= 1,
  leadBlock ? `rate ${leadBlock.rate.toFixed(3)}, ${leadBlock.housesWorked} houses` : "",
);

const leads = await call("GET", `${W}/leads?bbox=${BYRON_BBOX}`, undefined, token);
check(
  "leads: the A lead with its note and position",
  leads.json?.leads?.[0]?.note === "loved our work" && typeof leads.json.leads[0].lat === "number",
);
const onlyC = await call("GET", `${W}/leads?bbox=${BYRON_BBOX}&grades=C`, undefined, token);
check("leads filtered to C → none", onlyC.json?.leads?.length === 0);

const stats = await call("GET", `${W}/stats`, undefined, token);
check(
  "stats: 1 session, houses worked, 1 A lead, lead rate",
  stats.json?.sessions === 1 &&
    stats.json?.housesWorked >= 15 &&
    stats.json?.leads?.A === 1 &&
    stats.json?.leadRate > 0,
  `${stats.json?.housesWorked} houses, ${stats.json?.streetsWorked} streets, ${stats.json?.distanceM} m`,
);
const inByron = await call("GET", `/v1/maps/${byron.json.map.id}/stats`, undefined, token);
const inDowntown = await call(
  "GET",
  `/v1/maps/${downtown.json.map.id}/paths?bbox=-81.4,42.9,-81.2,43.05`,
  undefined,
  token,
);
check(
  "boundaries: Byron map includes it, Downtown map doesn't",
  inByron.json?.leads?.A === 1 && inDowntown.json?.features?.length === 0,
);

const next = await call("GET", `${W}/where-next?near=${CENTRE.lat},${CENTRE.lng}&limit=10`, undefined, token);
const sugg = next.json?.suggestions ?? [];
check(
  "where next: 10 suggestions, never-worked first, the worked block not on top",
  sugg.length === 10 && sugg[0].daysSinceWorked === null && sugg[0].blockId !== leadBlock?.blockId,
  `top: block ${sugg[0]?.blockId}, income $${sugg[0]?.medianIncome}`,
);

// ---------- plan library ----------
const geo = await call("GET", `/v1/geo/blocks?bbox=${BYRON_BBOX}`, undefined, token);
const blockIds: number[] = geo.json.features
  .slice(0, 4)
  .map((f: { properties: { blockId: number } }) => f.properties.blockId);
check("geo blocks for the plan builder", blockIds.length === 4, `${geo.json.features.length} blocks in Byron`);
const plan = await call(
  "POST",
  `/v1/teams/${teamId}/plans`,
  {
    name: "Tuesday: Byron north",
    mapId: byron.json.map.id,
    groups: [
      { label: "Pair 1", blockIds: blockIds.slice(0, 2) },
      { label: "Pair 2", blockIds: blockIds.slice(2) },
    ],
  },
  token,
);
const planId: string = plan.json?.plan?.id;
check("create a plan", plan.status === 201 && plan.json.plan.groups.length === 2);
check(
  "plan list (unused) has it",
  (await call("GET", `/v1/teams/${teamId}/plans?used=false`, undefined, token)).json?.plans?.length === 1,
);

// ---------- a new session with team data loaded ----------
const s2 = await call(
  "POST",
  "/v1/sessions",
  {
    displayName: "Mapper",
    location: CENTRE,
    area,
    loadMap: { mapId: world.json.map.id, layers: ["leads", "coverage", "leadRate"] },
  },
  token,
);
check(
  "create a session with the World map loaded",
  s2.status === 201 && s2.json?.session?.loadedMap?.name === "World Map",
);
const S2 = `/v1/sessions/${s2.json.session.id}`;
const layers = await call("GET", `${S2}/layers?cells=${cellsAround(CENTRE).join(",")}`, undefined, s2.json.token);
check(
  "layers: previous lead (with note), past coverage, lead-rate colours",
  layers.json?.leads?.[0]?.note === "loved our work" &&
    layers.json?.coverage?.features?.length >= 1 &&
    layers.json?.leadRate?.length >= 1,
);
const loaded = await call("POST", `${S2}/plan/load`, { planId }, s2.json.token);
check("load the plan into the session's draft", loaded.json?.draft?.groups?.[1]?.label === "Pair 2");
check(
  "plan is now marked used",
  (await call("GET", `/v1/teams/${teamId}/plans?used=true`, undefined, token)).json?.plans?.length === 1,
);

const guest = (await call("POST", "/v1/sessions", { displayName: "Guest", location: CENTRE, area }))
  .json as SessionAccessRes;
const G = `/v1/sessions/${guest.session.id}`;
check(
  "guest session: no team layers",
  JSON.stringify((await call("GET", `${G}/layers?cells=${cellsAround(CENTRE)[0]}`, undefined, guest.token)).json) ===
    "{}",
);
check(
  "guest can't load a team plan → 401",
  (await call("POST", `${G}/plan/load`, { planId }, guest.token)).status === 401,
);
check(
  "loading a map you can't see → 404",
  (
    await call(
      "POST",
      "/v1/sessions",
      { displayName: "X", location: CENTRE, area, loadMap: { mapId: randomUUID(), layers: ["leads"] } },
      token,
    )
  ).status === 404,
);

// ---------- cleanup ----------
for (const s of [S2, G]) await call("POST", `${s}/end`, undefined, s === G ? guest.token : s2.json.token);
check(
  "delete the team (maps, plans, uploads go with it)",
  (await call("DELETE", `/v1/teams/${teamId}`, undefined, token)).status === 204,
);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
