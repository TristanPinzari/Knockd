import { Router } from "express";
import {
  CellsQuery,
  CreateSessionBody,
  GetMessagesQuery,
  JoinSessionBody,
  LoadPlanBody,
  PatchLeadBody,
  PostLeadBody,
  PostMessageBody,
  PostPinBody,
  PostPingsBody,
  Uuid,
} from "@knockd/shared";
import * as planning from "../../sessions/planning";
import * as sessions from "../../sessions/service";
import { getStats } from "../../sessions/stats";
import * as writes from "../../sessions/writes";
import { HttpError, parse } from "../errors";
import { requireSession, sessionCtx } from "../session-auth";

export const sessionsRouter = Router();

// ============================== Open (🔓) ==============================

sessionsRouter.post("/", async (req, res) => {
  const body = parse(CreateSessionBody, req.body);
  res.status(201).json(await sessions.createSession(body));
});

sessionsRouter.post("/join", async (req, res) => {
  const body = parse(JoinSessionBody, req.body);
  res.json(await sessions.joinSession(body));
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

sessionsRouter.get("/:id/messages", async (req, res) => {
  const { after } = parse(GetMessagesQuery, req.query);
  res.json({ messages: await writes.getMessages(sessionCtx(res).sessionId, after) });
});

// ============================== Planning ==============================

sessionsRouter.get("/:id/plan", async (_req, res) => {
  res.json(await planning.getPlan(sessionCtx(res).sessionId));
});

sessionsRouter.post("/:id/plan/apply", async (_req, res) => {
  res.json({ applied: await planning.applyDraft(sessionCtx(res).sessionId) });
});

sessionsRouter.post("/:id/plan/load", async (req, _res) => {
  parse(LoadPlanBody, req.body);
  throw new HttpError(401, "unauthorized", "Loading a saved plan needs an account (coming soon)");
});

sessionsRouter.get("/:id/knock-rate", async (_req, res) => {
  res.json(await planning.getKnockRate(sessionCtx(res).sessionId));
});
