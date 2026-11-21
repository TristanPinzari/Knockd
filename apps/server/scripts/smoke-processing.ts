/**
 * Smoke test for end-of-session processing, with known answers:
 *   street A walked door to door (0.4 m/s) → worked
 *   street B walked straight past (1.4 m/s) → passed by
 *   street C driven (12 m/s)               → ignored
 * Needs the server running and DATABASE_URL in .env (results are checked in the database).
 * Usage: pnpm --filter @knockd/server smoke:processing [baseUrl]
 */
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { io } from "socket.io-client";
import { cellsAround, type LatLng, type Ping, type SessionAccessRes } from "@knockd/shared";

if (existsSync(".env")) process.loadEnvFile(".env");
const BASE = process.argv[2] ?? "http://localhost:3000";
const CENTRE = { lat: 42.955, lng: -81.3425 }; // Byron demo location
const pg = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });

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

/** Points along a polyline every `stepM` metres. */
function along(line: LatLng[], stepM: number): LatLng[] {
  const out: LatLng[] = [line[0]!];
  let carry = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const seg = metres(a, b);
    let d = stepM - carry;
    while (d <= seg) {
      const f = d / seg;
      out.push({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });
      d += stepM;
    }
    carry = seg - (d - stepM);
  }
  out.push(line[line.length - 1]!);
  return out;
}

// ---------- set up ----------
const area = { kind: "circle", center: CENTRE, radiusM: 400 };
const a = (await call("POST", "/v1/sessions", { displayName: "Walker", location: CENTRE, area }))
  .json as SessionAccessRes;
const S = `/v1/sessions/${a.session.id}`;
const areaRes = await call("GET", `${S}/area?cells=${cellsAround(CENTRE).join(",")}`, undefined, a.token);

type StreetF = { properties: { streetId: number; lengthM: number }; geometry: { coordinates: [number, number][] } };
type HouseF = { properties: { houseId: number; streetId: number | null } };
const streets = new Map<number, StreetF>();
const housesByStreet = new Map<number, number[]>();
for (const cell of areaRes.json.cells) {
  for (const f of cell.streets.features as StreetF[]) streets.set(f.properties.streetId, f);
  for (const f of cell.houses.features as HouseF[])
    if (f.properties.streetId) {
      const list = housesByStreet.get(f.properties.streetId) ?? [];
      list.push(f.properties.houseId);
      housesByStreet.set(f.properties.streetId, list);
    }
}
const candidates = [...streets.values()]
  .filter((s) => s.properties.lengthM >= 80 && s.properties.lengthM <= 200)
  .filter((s) => (housesByStreet.get(s.properties.streetId)?.length ?? 0) >= 4);
check("found 3 suitable streets near the demo spot", candidates.length >= 3, `${candidates.length} candidates`);
const [A, B, C] = candidates as [StreetF, StreetF, StreetF];
const line = (s: StreetF) => s.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));

// ---------- pings with known speeds ----------
const pings: Ping[] = [];
let t = Date.now() - 30 * 60_000;
function walk(points: LatLng[], speedMs: number, everyS: number) {
  for (const p of along(points, speedMs * everyS)) {
    pings.push({ clientId: randomUUID(), t: new Date(t).toISOString(), lat: p.lat, lng: p.lng, accuracy: 5 });
    t += everyS * 1000;
  }
  t += 120_000; // a pause before the next street
}
walk(line(A), 0.4, 5); // door to door
walk(line(B), 1.4, 5); // straight past
walk(line(C), 12, 2); // driving
for (let i = 0; i < pings.length; i += 500)
  await call("POST", `${S}/pings`, { pings: pings.slice(i, i + 500) }, a.token);
const leadHouse = housesByStreet.get(A.properties.streetId)![0]!;
await call(
  "POST",
  `${S}/leads`,
  { clientId: randomUUID(), t: new Date(t).toISOString(), houseId: leadHouse, grade: "A" },
  a.token,
);
console.log(
  `  street A ${Math.round(A.properties.lengthM)} m, B ${Math.round(B.properties.lengthM)} m, C ${Math.round(C.properties.lengthM)} m; ${pings.length} pings`,
);

// ---------- end → processed ----------
const socket = io(BASE, { auth: { token: a.token }, transports: ["websocket"] });
await new Promise((r) => socket.on("connect", () => r(null)));
const processed = new Promise<boolean>((resolve) => {
  socket.on("session:processed", () => resolve(true));
  setTimeout(() => resolve(false), 60_000);
});
const started = Date.now();
await call("POST", `${S}/end`, undefined, a.token);
check("ending the session → session:processed broadcast", await processed, `${Date.now() - started} ms`);

// ---------- results ----------
const coverage = await pg<{ street_id: number; classification: string; duration_s: number; houses: number }[]>`
  SELECT street_id, classification, duration_s, houses FROM session_street_coverage WHERE session_id = ${a.session.id}`;
// street_id is a bigint column, which postgres.js returns as a string.
const row = (s: StreetF) => coverage.find((c) => Number(c.street_id) === s.properties.streetId);
check("street A (door to door) → worked", row(A)?.classification === "worked", `${row(A)?.duration_s} s`);
check("street B (walked past) → passed", row(B)?.classification === "passed", `${row(B)?.duration_s} s`);
check("street C (driven) → ignored", !row(C), row(C) ? `${row(C)!.classification}, ${row(C)!.duration_s} s` : "");
check("worked street counts its houses", (row(A)?.houses ?? 0) >= 4, `${row(A)?.houses} houses`);

const [path] = await pg<{ distance_m: number; points: number }[]>`
  SELECT distance_m, ST_NPoints(path) AS points FROM session_paths WHERE session_id = ${a.session.id}`;
const walked = A.properties.lengthM + B.properties.lengthM;
check(
  "path distance ≈ streets A + B, driving excluded",
  !!path && path.distance_m > walked * 0.8 && path.distance_m < walked * 1.3,
  `${Math.round(path?.distance_m ?? 0)} m vs ${Math.round(walked)} m walked`,
);

const [block] = await pg<{ houses_worked: number; leads_a: number }[]>`
  SELECT s.houses_worked, s.leads_a FROM session_block_stats s
  JOIN houses h ON h.block_id = s.block_id WHERE s.session_id = ${a.session.id} AND h.id = ${leadHouse}`;
check("block stats: lead counted on the right block", block?.leads_a === 1, `${block?.houses_worked} houses worked`);

const stats = await call("GET", `${S}/stats`, undefined, a.token);
check(
  "stats are final, with worked/passed streets",
  stats.json?.final === true && stats.json?.crew?.streetsWorked >= 1 && stats.json?.crew?.streetsPassed >= 1,
  `${stats.json?.crew?.streetsWorked} worked, ${stats.json?.crew?.streetsPassed} passed, ${stats.json?.crew?.housesCovered} houses`,
);
const late = await call("POST", `${S}/pings`, { pings: pings.slice(0, 1) }, a.token);
check("writes after processing → 410", late.status === 410);

socket.close();
await pg.end();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
