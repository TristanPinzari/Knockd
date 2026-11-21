import { Router } from "express";
import { CellsQuery, CreateSessionBody, JoinSessionBody, Uuid } from "@knockd/shared";
import * as sessions from "../../sessions/service";
import { parse } from "../errors";
import { requireSession, sessionCtx } from "../session-auth";

export const sessionsRouter = Router();

// 🔓 Create a session (guests allowed).
sessionsRouter.post("/", async (req, res) => {
  const body = parse(CreateSessionBody, req.body);
  res.status(201).json(await sessions.createSession(body));
});

// 🔓 Join with a code.
sessionsRouter.post("/join", async (req, res) => {
  const body = parse(JoinSessionBody, req.body);
  res.json(await sessions.joinSession(body));
});

// Everything below needs a session token for :id.
sessionsRouter.use("/:id", requireSession);

sessionsRouter.get("/:id", async (_req, res) => {
  res.json(await sessions.getSnapshot(sessionCtx(res).sessionId));
});

sessionsRouter.get("/:id/area", async (req, res) => {
  const { cells } = parse(CellsQuery, req.query);
  res.json(await sessions.getArea(sessionCtx(res).sessionId, cells));
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
