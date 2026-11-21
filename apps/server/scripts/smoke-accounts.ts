/**
 * Smoke test for account endpoints: /me, teams, invites, uploads.
 * Logs in as the "Knockd Smoke Test" machine-to-machine app (client credentials), so no phone is needed.
 * Needs AUTH0_DOMAIN, AUTH0_AUDIENCE, AUTH0_TEST_CLIENT_ID, AUTH0_TEST_CLIENT_SECRET in .env
 * and the server running. Usage: pnpm --filter @knockd/server smoke:accounts [baseUrl]
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const BASE = process.argv[2] ?? "http://localhost:3000";
const { AUTH0_DOMAIN, AUTH0_AUDIENCE, AUTH0_TEST_CLIENT_ID, AUTH0_TEST_CLIENT_SECRET } = process.env;
for (const [k, v] of Object.entries({ AUTH0_DOMAIN, AUTH0_AUDIENCE, AUTH0_TEST_CLIENT_ID, AUTH0_TEST_CLIENT_SECRET }))
  if (!v) throw new Error(`${k} is not set in .env`);

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

// ---------- log in ----------
const domain = AUTH0_DOMAIN!.replace(/^https?:\/\//, "").replace(/\/+$/, "");
const tokenRes = await fetch(`https://${domain}/oauth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    grant_type: "client_credentials",
    client_id: AUTH0_TEST_CLIENT_ID,
    client_secret: AUTH0_TEST_CLIENT_SECRET,
    audience: AUTH0_AUDIENCE,
  }),
});
const login = (await tokenRes.json()) as { access_token?: string; error_description?: string };
check("Auth0 issues a token for the smoke test app", !!login.access_token, login.error_description ?? "");
if (!login.access_token) process.exit(1);
const token = login.access_token;

// ---------- auth ----------
check("/me without a token → 401", (await call("GET", "/v1/me")).status === 401);
check("/me with a garbage token → 401", (await call("GET", "/v1/me", undefined, "not-a-token")).status === 401);
const me = await call("GET", "/v1/me", undefined, token);
check("/me creates the user on first login", me.status === 200 && !!me.json?.user?.id, me.json?.user?.displayName);
const renamed = await call("PATCH", "/v1/me", { displayName: "Smoke Bot" }, token);
check("rename yourself", renamed.json?.user?.displayName === "Smoke Bot");

// ---------- teams ----------
const created = await call("POST", "/v1/teams", { name: "Smoke Test Painters" }, token);
const teamId: string = created.json?.team?.id;
check("create team → 201", created.status === 201 && !!teamId);
const meAfter = await call("GET", "/v1/me", undefined, token);
check(
  "/me lists the team with role owner",
  meAfter.json?.teams?.some((t: { id: string; role: string }) => t.id === teamId && t.role === "owner"),
);
const patched = await call("PATCH", `/v1/teams/${teamId}`, { name: "Smoke Painters", fadeDays: 90 }, token);
check(
  "rename team + set fade time",
  patched.json?.team?.name === "Smoke Painters" && patched.json?.team?.fadeDays === 90,
);
const members = await call("GET", `/v1/teams/${teamId}/members`, undefined, token);
check("members → just the owner", members.json?.members?.length === 1 && members.json.members[0].role === "owner");
const myId: string = me.json.user.id;
check(
  "owner can't demote themselves → 403",
  (await call("PATCH", `/v1/teams/${teamId}/members/${myId}`, { role: "viewer" }, token)).status === 403,
);
check(
  "owner can't leave → 403",
  (await call("DELETE", `/v1/teams/${teamId}/members/${myId}`, undefined, token)).status === 403,
);
check(
  "someone else's team → 404",
  (await call("GET", "/v1/teams/00000000-0000-0000-0000-000000000000", undefined, token)).status === 404,
);

// ---------- invites ----------
const invite = await call("POST", `/v1/teams/${teamId}/invites`, undefined, token);
check("create invite link", invite.status === 201 && invite.json?.url?.includes(invite.json?.token), invite.json?.url);
const accepted = await call("POST", `/v1/invites/${invite.json.token}/accept`, undefined, token);
check("accepting an invite to a team you're on is harmless", accepted.json?.team?.id === teamId);
check(
  "unknown invite → 404",
  (await call("POST", "/v1/invites/doesnotexist123/accept", undefined, token)).status === 404,
);

// ---------- sessions & uploads ----------
const area = { kind: "circle", center: BYRON, radiusM: 300 };
const s = await call("POST", "/v1/sessions", { displayName: "Smoke", location: BYRON, area }, token);
check("create a session while logged in → linked to account", s.status === 201 && s.json?.member?.isGuest === false);
const rejoin = await call("POST", "/v1/sessions/join", { code: s.json.session.joinCode, displayName: "Smoke" }, token);
check("joining your own session again → same member, no duplicate", rejoin.json?.member?.id === s.json.member.id);
const early = await call("POST", `/v1/teams/${teamId}/sessions`, { sessionId: s.json.session.id }, token);
check("upload a live session → 409", early.status === 409);
await call("POST", `/v1/sessions/${s.json.session.id}/end`, undefined, s.json.token);
const up1 = await call("POST", `/v1/teams/${teamId}/sessions`, { sessionId: s.json.session.id }, token);
const up2 = await call("POST", `/v1/teams/${teamId}/sessions`, { sessionId: s.json.session.id }, token);
check("upload → uploaded", up1.json?.uploaded === true && up1.json?.alreadyUploaded === false);
check("upload again → alreadyUploaded, no duplicate", up2.json?.alreadyUploaded === true);
const guest = await call("POST", "/v1/sessions", { displayName: "Guest", location: BYRON, area });
await call("POST", `/v1/sessions/${guest.json.session.id}/end`, undefined, guest.json.token);
const guestUp = await call("POST", `/v1/teams/${teamId}/sessions`, { sessionId: guest.json.session.id }, token);
check("can't upload a session you weren't in → 404", guestUp.status === 404);
const mine = await call("GET", "/v1/me/sessions", undefined, token);
check(
  "/me/sessions shows it uploaded to the team",
  mine.json?.sessions?.find((x: { id: string }) => x.id === s.json.session.id)?.uploadedTo?.includes(teamId),
);
const history = await call("GET", `/v1/teams/${teamId}/sessions`, undefined, token);
check(
  "team session history",
  history.json?.sessions?.length === 1,
  history.json?.sessions?.[0]?.memberNames?.join(", "),
);
check(
  "remove a session from the team",
  (await call("DELETE", `/v1/teams/${teamId}/sessions/${s.json.session.id}`, undefined, token)).status === 204,
);

// ---------- cleanup ----------
check("delete team", (await call("DELETE", `/v1/teams/${teamId}`, undefined, token)).status === 204);
check("deleted team → 404", (await call("GET", `/v1/teams/${teamId}`, undefined, token)).status === 404);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
