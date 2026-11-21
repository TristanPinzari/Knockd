/**
 * Smoke test for the simulated crew: bots join, walk real Byron streets, send pings, then stop.
 * Takes about a minute. Needs the server running. Usage: pnpm --filter @knockd/server smoke:sim [baseUrl]
 */
import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents, SessionAccessRes } from "@knockd/shared";

const BASE = process.argv[2] ?? "http://localhost:3000";
// Densest residential spot in Byron (~520 houses within 400 m): the demo location.
const BYRON = { lat: 42.955, lng: -81.3425 };
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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const area = { kind: "circle", center: BYRON, radiusM: 400 };
const a = (await call("POST", "/v1/sessions", { displayName: "Tristan", location: BYRON, area }))
  .json as SessionAccessRes;
const b = (await call("POST", "/v1/sessions/join", { code: a.session.joinCode, displayName: "Jas" }))
  .json as SessionAccessRes;
const S = `/v1/sessions/${a.session.id}`;

const events: { event: string; payload: unknown; at: number }[] = [];
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(BASE, {
  auth: { token: a.token },
  transports: ["websocket"],
});
socket.onAny((event, payload) => events.push({ event, payload, at: Date.now() }));
await new Promise((r) => socket.on("connect", () => r(null)));

// ---------- start ----------
check("non-admin can't start bots → 403", (await call("POST", `${S}/sim`, { bots: 3 }, b.token)).status === 403);
check("too many bots → 400", (await call("POST", `${S}/sim`, { bots: 9 }, a.token)).status === 400);
const started = await call("POST", `${S}/sim`, { bots: 3, pace: "demo" }, a.token);
const botIds: string[] = started.json?.botMemberIds ?? [];
check("admin starts 3 bots → 201", started.status === 201 && botIds.length === 3);
check("starting again → 409", (await call("POST", `${S}/sim`, { bots: 1 }, a.token)).status === 409);
await wait(500);
check("member:joined for each bot", events.filter((e) => e.event === "member:joined").length === 3);
const snap = await call("GET", S, undefined, a.token);
const bots = snap.json.members.filter((m: { isBot: boolean }) => m.isBot);
check(
  "snapshot: 3 bots, online, distinct colours",
  bots.length === 3 &&
    bots.every((m: { online: boolean }) => m.online) &&
    new Set(snap.json.members.map((m: { colour: string }) => m.colour)).size === snap.json.members.length,
  bots.map((m: { displayName: string }) => m.displayName).join(", "),
);

// ---------- walking ----------
console.log("  …letting the bots walk for 35 s");
await wait(35_000);
type Pos = { memberId: string; lat: number; lng: number; t: string };
const positions = events.flatMap((e) => (e.event === "positions" ? (e.payload as { positions: Pos[] }).positions : []));
const movers = new Set(positions.map((p) => p.memberId));
check(
  "all 3 bots broadcast positions",
  botIds.every((id) => movers.has(id)),
  `${positions.length} position updates`,
);
const metres = (p: Pos, q: { lat: number; lng: number }) =>
  Math.hypot((p.lat - q.lat) * 111_320, (p.lng - q.lng) * 111_320 * Math.cos((p.lat * Math.PI) / 180));
check(
  "bots stay in the area",
  positions.every((p) => metres(p, BYRON) < 900),
);
const leads = events.filter((e) => e.event === "lead:new").length;
console.log(`  (bots marked ${leads} lead(s) so far; ~6% chance per door)`);
const stats = await call("GET", `${S}/stats`, undefined, a.token);
const botStats = stats.json.members.filter((m: { memberId: string }) => botIds.includes(m.memberId));
check(
  "stats: bots have distance and active time",
  botStats.every((m: { distanceM: number; activeS: number }) => m.distanceM > 0 && m.activeS > 0),
  botStats.map((m: { distanceM: number }) => `${m.distanceM} m`).join(", "),
);

// ---------- stop ----------
check("non-admin can't stop → 403", (await call("DELETE", `${S}/sim`, undefined, b.token)).status === 403);
check("admin stops bots → 204", (await call("DELETE", `${S}/sim`, undefined, a.token)).status === 204);
await wait(500);
check("member:left for each bot", events.filter((e) => e.event === "member:left").length === 3);
const after = await call("GET", S, undefined, a.token);
check("bots are gone from the session", !after.json.members.some((m: { isBot: boolean }) => m.isBot));
check("stopping again → 404", (await call("DELETE", `${S}/sim`, undefined, a.token)).status === 404);

// ---------- session full / ended ----------
check("2 people + 7 bots → 409 session_full", (await call("POST", `${S}/sim`, { bots: 7 }, a.token)).status === 409);
await call("POST", `${S}/end`, undefined, a.token);
check(
  "can't start bots on an ended session → 410",
  (await call("POST", `${S}/sim`, { bots: 1 }, a.token)).status === 410,
);

socket.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
