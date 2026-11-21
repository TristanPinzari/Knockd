/**
 * End-to-end smoke test for the session endpoints and socket broadcasts.
 * Needs the server running (pnpm dev). Usage: pnpm --filter @knockd/server smoke [baseUrl]
 */
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import {
  cellsAround,
  type ClientToServerEvents,
  type PlanEditOp,
  type ServerToClientEvents,
  type SessionAccessRes,
} from "@knockd/shared";

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
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(BASE, {
    auth: { token },
    transports: ["websocket"],
  });
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

// ---------- live: pings ----------
const S = `/v1/sessions/${a.session.id}`;
const firstCell = (area.json?.cells ?? []).find((c: { houses: { features: unknown[] } }) => c.houses.features.length);
const houseId: number = firstCell.houses.features[0].properties.houseId;
const blockIds: number[] = firstCell.blocks.features
  .slice(0, 2)
  .map((f: { properties: { blockId: number } }) => f.properties.blockId);
const now = Date.now();
const pingBatch = {
  pings: [0, 1, 2].map((i) => ({
    clientId: randomUUID(),
    t: new Date(now - (2 - i) * 20_000).toISOString(),
    lat: BYRON.lat + i * 0.0002,
    lng: BYRON.lng,
    accuracy: 5,
  })),
};
const p1 = await call("POST", `${S}/pings`, pingBatch, b.token);
check("pings batch → 3 accepted", p1.json?.accepted === 3);
const p2 = await call("POST", `${S}/pings`, pingBatch, b.token);
check("same batch again (offline retry) → 0 accepted", p2.json?.accepted === 0);
await wait(300);
check(
  "A receives B's position",
  sockA.events.some((e) => e.event === "positions"),
);

// ---------- live: leads ----------
const leadBody = {
  clientId: randomUUID(),
  t: new Date().toISOString(),
  houseId,
  grade: "A",
  note: "peeling paint, loved our work",
};
const l1 = await call("POST", `${S}/leads`, leadBody, b.token);
check("B marks an A lead with a note", l1.json?.lead?.grade === "A" && l1.json?.lead?.note === leadBody.note);
await wait(300);
const leadEvents = () => sockA.events.filter((e) => e.event === "lead:new");
check("A gets lead:new from Jas", (leadEvents()[0]?.payload as { memberName: string })?.memberName === "Jas");
await call("POST", `${S}/leads`, leadBody, b.token);
await wait(300);
check("resending the same lead → no duplicate broadcast", leadEvents().length === 1);
const patched = await call("PATCH", `${S}/leads/${leadBody.clientId}`, { grade: "B" }, a.token);
check("A edits the lead to B → lead:updated", patched.json?.lead?.grade === "B");
const l2 = { clientId: randomUUID(), t: new Date().toISOString(), houseId, grade: "C" };
await call("POST", `${S}/leads`, l2, b.token);
const del1 = await call("DELETE", `${S}/leads/${l2.clientId}`, undefined, b.token);
const del2 = await call("DELETE", `${S}/leads/${l2.clientId}`, undefined, b.token);
await wait(300);
check("undo a lead → 204, undo again → 204", del1.status === 204 && del2.status === 204);
check("only one lead:removed broadcast", sockA.events.filter((e) => e.event === "lead:removed").length === 1);
const badHouse = await call("POST", `${S}/leads`, { ...l2, clientId: randomUUID(), houseId: 999999999 }, b.token);
check("unknown house → 400", badHouse.status === 400);

// ---------- live: pins & chat ----------
const pinId = randomUUID();
const pin = await call("POST", `${S}/pins`, { clientId: pinId, lat: BYRON.lat, lng: BYRON.lng }, b.token);
await call("DELETE", `${S}/pins/${pinId}`, undefined, b.token);
await wait(300);
check(
  "pin add + remove → pin:new, pin:removed",
  pin.status === 200 && ["pin:new", "pin:removed"].every((ev) => sockA.events.some((e) => e.event === ev)),
);
const m1 = await call("POST", `${S}/messages`, { clientId: randomUUID(), body: "you guys done yet?" }, a.token);
const m2 = await call("POST", `${S}/messages`, { clientId: randomUUID(), body: "2 more blocks" }, b.token);
const after = await call("GET", `${S}/messages?after=${m1.json.message.clientId}`, undefined, a.token);
check(
  "chat: messages after the first → just the second",
  after.json?.messages?.length === 1 && after.json.messages[0].clientId === m2.json.message.clientId,
);

// ---------- live: planning ----------
const edit = (op: unknown) =>
  // Sent unvalidated on purpose: the server must reject bad edits itself.
  new Promise<{ ok: boolean; error?: string }>((resolve) => sockA.socket.emit("plan:edit", op as PlanEditOp, resolve));
const g = await edit({
  op: "setGroups",
  groups: [
    { label: "Tristan", memberIds: [a.member.id], blockIds: [] },
    { label: "Jas", memberIds: [b.member.id], blockIds: [] },
  ],
});
const as1 = await edit({ op: "assign", blockId: blockIds[0], groupIndex: 0 });
const as2 = await edit({ op: "assign", blockId: blockIds[1], groupIndex: 1 });
check("plan edits over socket are acknowledged", g.ok && as1.ok && as2.ok);
const badEdit = await edit({ op: "assign", blockId: blockIds[0], groupIndex: 9 });
check("invalid edit is rejected with a reason", !badEdit.ok && !!badEdit.error, badEdit.error);
await wait(300);
check(
  "B receives plan:draft",
  sockB.events.some((e) => e.event === "plan:draft"),
);
const applied = await call("POST", `${S}/plan/apply`, undefined, b.token);
await wait(300);
check(
  "anyone can apply → plan:applied",
  applied.json?.applied?.groups?.[1]?.blockIds?.[0] === blockIds[1] &&
    sockA.events.some((e) => e.event === "plan:applied"),
);
const kr = await call("GET", `${S}/knock-rate`, undefined, a.token);
check("knock rate → default 25/h", kr.json?.housesPerHourPerGroup === 25 && kr.json?.source === "default");

// ---------- stats ----------
const stats = await call("GET", `${S}/stats`, undefined, a.token);
const jas = stats.json?.members?.find((m: { memberId: string }) => m.memberId === b.member.id);
check(
  "stats: Jas has 1 B lead (edited), undone C excluded",
  jas?.leads?.A === 0 && jas?.leads?.B === 1 && jas?.leads?.C === 0,
);
check(
  "stats: Jas has distance and active time",
  jas?.distanceM > 0 && jas?.activeS > 0,
  `${jas?.distanceM} m, ${jas?.activeS} s`,
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
