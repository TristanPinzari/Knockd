import { Router } from "express";
import {
  CellsQuery,
  CreateSessionBody,
  GetMessagesQuery,
  JoinSessionBody,
  PatchLeadBody,
  PostLeadBody,
  PostMessageBody,
  PostPinBody,
  PostPingsBody,
  StartSimBody,
  TrailsQuery,
  Uuid,
} from "@knockd/shared";
import { maybeAccountUser, optionalAccount } from "../../auth/account";
import { sessionLayers } from "../../maps/service";
import * as planning from "../../sessions/planning";
import * as sessions from "../../sessions/service";
import { getStats } from "../../sessions/stats";
import * as sim from "../../sim/runner";
import * as writes from "../../sessions/writes";
import { HttpError, parse } from "../errors";
import { requireSession, sessionCtx } from "../session-auth";

export const sessionsRouter = Router();

// ============================== Open (🔓) ==============================

// 👤 optional: send an Auth0 token to link the session to your account (needed to upload it later).
sessionsRouter.post("/", optionalAccount, async (req, res) => {
  const body = parse(CreateSessionBody, req.body);
  res.status(201).json(await sessions.createSession(body, maybeAccountUser(res)?.id));
});

sessionsRouter.post("/join", optionalAccount, async (req, res) => {
  const body = parse(JoinSessionBody, req.body);
  res.json(await sessions.joinSession(body, maybeAccountUser(res)?.id));
});

// Everything below needs a session token for :id (🎟️).
sessionsRouter.use("/:id", requireSession);

// ============================== Session ==============================

sessionsRouter.get("/:id", async (_req, res) => {
  res.json(await sessions.getSnapshot(sessionCtx(res).sessionId));
});

sessionsRouter.get("/:id/area", async (req, res) => {
  const { cells } = parse(CellsQuery, req.query);
  res.json(await sessions.getArea(sessionCtx(res).sessionId, cells));
});

// Team data the creator loaded (previous leads, past coverage, lead-rate colours) for these cells.
sessionsRouter.get("/:id/layers", async (req, res) => {
  const { cells } = parse(CellsQuery, req.query);
  res.json(await sessionLayers(sessionCtx(res).sessionId, cells));
});

sessionsRouter.get("/:id/stats", async (_req, res) => {
  res.json(await getStats(sessionCtx(res).sessionId));
});

sessionsRouter.post("/:id/end", async (_req, res) => {
  const { sessionId, memberId } = sessionCtx(res);
  await sessions.endSession(sessionId, memberId);
  res.status(204).end();
});

sessionsRouter.post("/:id/leave", async (_req, res) => {
  const { sessionId, memberId } = sessionCtx(res);
  await sessions.leaveSession(sessionId, memberId);
  res.status(204).end();
});

sessionsRouter.delete("/:id/members/:memberId", async (req, res) => {
  const { sessionId, memberId } = sessionCtx(res);
  await sessions.removeMember(sessionId, memberId, parse(Uuid, req.params.memberId));
  res.status(204).end();
});

// ============================== In-session writes ==============================

sessionsRouter.post("/:id/pings", async (req, res) => {
  const { sessionId, memberId } = sessionCtx(res);
  const accepted = await writes.addPings(sessionId, memberId, parse(PostPingsBody, req.body));
  res.json({ accepted });
});

sessionsRouter.post("/:id/leads", async (req, res) => {
  const { sessionId, memberId } = sessionCtx(res);
  res.json({ lead: await writes.addLead(sessionId, memberId, parse(PostLeadBody, req.body)) });
});

sessionsRouter.patch("/:id/leads/:clientId", async (req, res) => {
  const { sessionId } = sessionCtx(res);
  const lead = await writes.updateLead(sessionId, parse(Uuid, req.params.clientId), parse(PatchLeadBody, req.body));
  res.json({ lead });
});

sessionsRouter.delete("/:id/leads/:clientId", async (req, res) => {
  await writes.removeLead(sessionCtx(res).sessionId, parse(Uuid, req.params.clientId));
  res.status(204).end();
});

sessionsRouter.post("/:id/pins", async (req, res) => {
  const { sessionId, memberId } = sessionCtx(res);
  res.json({ pin: await writes.addPin(sessionId, memberId, parse(PostPinBody, req.body)) });
});

sessionsRouter.delete("/:id/pins/:clientId", async (req, res) => {
  await writes.removePin(sessionCtx(res).sessionId, parse(Uuid, req.params.clientId));
  res.status(204).end();
});

sessionsRouter.post("/:id/messages", async (req, res) => {
  const { sessionId, memberId } = sessionCtx(res);
  res.json({ message: await writes.addMessage(sessionId, memberId, parse(PostMessageBody, req.body)) });
});

// Everyone's trail so far (on open / reconnect). ?since= for only newer points.
sessionsRouter.get("/:id/trails", async (req, res) => {
  const { since } = parse(TrailsQuery, req.query);
  res.json(await writes.getTrails(sessionCtx(res).sessionId, since));
});

sessionsRouter.get("/:id/messages", async (req, res) => {
  const { after } = parse(GetMessagesQuery, req.query);
  res.json({ messages: await writes.getMessages(sessionCtx(res).sessionId, after) });
});

// ============================== Planning ==============================

sessionsRouter.get("/:id/plan", async (_req, res) => {
  res.json(await planning.getPlan(sessionCtx(res).sessionId));
});

sessionsRouter.get("/:id/knock-rate", async (_req, res) => {
  res.json(await planning.getKnockRate(sessionCtx(res).sessionId));
});

// ============================== Simulated crew ==============================

// Session admin only. Bots join as members and walk the session's area (or their blocks in the applied plan).
sessionsRouter.post("/:id/sim", async (req, res) => {
  const { sessionId, memberId } = sessionCtx(res);
  const { status } = await sessions.requireAdmin(sessionId, memberId);
  if (status !== "live") throw new HttpError(410, "session_ended", "This session has ended");
  const { bots, pace } = parse(StartSimBody, req.body ?? {});
  res.status(201).json({ botMemberIds: await sim.startSim(sessionId, bots, pace) });
});

// Stops the bots and removes them from the session.
sessionsRouter.delete("/:id/sim", async (_req, res) => {
  const { sessionId, memberId } = sessionCtx(res);
  await sessions.requireAdmin(sessionId, memberId);
  await sim.stopSim(sessionId, { leave: true });
  res.status(204).end();
});
