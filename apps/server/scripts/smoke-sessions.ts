/**
 * End-to-end smoke test for the session endpoints and socket broadcasts.
 * Needs the server running (pnpm dev). Usage: pnpm --filter @knockd/server smoke [baseUrl]
 */
import { io, type Socket } from "socket.io-client";
import { cellsAround, type ServerToClientEvents, type SessionAccessRes } from "@knockd/shared";

const BASE = process.argv[2] ?? "http://localhost:3000";
const BYRON = { lat: 42.9655, lng: -81.3375 };
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

function connect(token: string) {
  const events: { event: string; payload: unknown }[] = [];
  const socket: Socket<ServerToClientEvents> = io(BASE, { auth: { token }, transports: ["websocket"] });
  socket.onAny((event, payload) => events.push({ event, payload }));
  return new Promise<{ socket: typeof socket; events: typeof events }>((resolve, reject) => {
    socket.on("connect", () => resolve({ socket, events }));
    socket.on("connect_error", reject);
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- create ----------
const created = await call("POST", "/v1/sessions", {
  displayName: "Tristan",
  location: BYRON,
  area: { kind: "circle", center: BYRON, radiusM: 500 },
});
check("create session → 201", created.status === 201, `code ${created.json?.session?.joinCode}`);
const a = created.json as SessionAccessRes;
check("creator is session admin", a.session.createdByMemberId === a.member.id);
check("planned area is a polygon", a.session.plannedArea?.type === "Polygon");

const sockA = await connect(a.token);
check("socket A connects", sockA.socket.connected);

// ---------- join ----------
const joined = await call("POST", "/v1/sessions/join", { code: a.session.joinCode.toLowerCase(), displayName: "Jas" });
check("join with lowercase code → 200", joined.status === 200);
const b = joined.json as SessionAccessRes;
check("joiner gets a different colour", b.member.colour !== a.member.colour, b.member.colour);
await wait(300);
check(
  "A receives member:joined",
  sockA.events.some((e) => e.event === "member:joined"),
);

const sockB = await connect(b.token);
await wait(300);
check(
  "A sees B come online",
  sockA.events.some((e) => e.event === "member:status" && (e.payload as { online: boolean }).online),
);

// ---------- snapshot ----------
const snap = await call("GET", `/v1/sessions/${a.session.id}`, undefined, a.token);
check("snapshot → 200", snap.status === 200, `${snap.json?.members?.length} members`);
check("snapshot shows B online", snap.json?.members?.find((m: { id: string }) => m.id === b.member.id)?.online);

// ---------- area ----------
const cells = cellsAround(BYRON);
const area = await call("GET", `/v1/sessions/${a.session.id}/area?cells=${cells.join(",")}`, undefined, b.token);
const totals = (area.json?.cells ?? []).reduce(
  (t: Record<string, number>, c: Record<string, { features: unknown[] }>) => ({
    streets: t.streets! + c.streets!.features.length,
    blocks: t.blocks! + c.blocks!.features.length,
    houses: t.houses! + c.houses!.features.length,
  }),
  { streets: 0, blocks: 0, houses: 0 },
);
check(
  `area for ${cells.length} cells → 200`,
  area.status === 200 && totals.houses > 0,
  `${totals.streets} streets, ${totals.blocks} blocks, ${totals.houses} houses, ${(JSON.stringify(area.json).length / 1024).toFixed(0)} KB`,
);

// ---------- errors ----------
const bad = await call("POST", "/v1/sessions", { displayName: "" });
check("invalid body → 400 invalid_request", bad.status === 400 && bad.json?.error?.code === "invalid_request");
const noToken = await call("GET", `/v1/sessions/${a.session.id}`);
check("no token → 401", noToken.status === 401);
const wrongCode = await call("POST", "/v1/sessions/join", { code: "ZZZZZZ", displayName: "X" });
check("unknown code → 404 session_not_found", wrongCode.json?.error?.code === "session_not_found");
const notAdmin = await call("POST", `/v1/sessions/${a.session.id}/end`, undefined, b.token);
check("non-admin can't end → 403", notAdmin.status === 403);

// ---------- remove ----------
const removed = await call("DELETE", `/v1/sessions/${a.session.id}/members/${b.member.id}`, undefined, a.token);
check("admin removes B → 204", removed.status === 204);
await wait(300);
check("B's socket is disconnected", !sockB.socket.connected);
const bAfter = await call("GET", `/v1/sessions/${a.session.id}`, undefined, b.token);
check("removed B is locked out → 403", bAfter.status === 403);

// ---------- end ----------
const ended = await call("POST", `/v1/sessions/${a.session.id}/end`, undefined, a.token);
check("admin ends session → 204", ended.status === 204);
await wait(300);
check(
  "A receives session:ended",
  sockA.events.some((e) => e.event === "session:ended"),
);
const lateJoin = await call("POST", "/v1/sessions/join", { code: a.session.joinCode, displayName: "Late" });
check("joining an ended session → 410", lateJoin.status === 410);

sockA.socket.close();
sockB.socket.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
