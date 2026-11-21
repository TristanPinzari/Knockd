/** 👤 Account endpoints: /me, /teams, /invites. All need an Auth0 login token. */
import { Router } from "express";
import {
  CreateTeamBody,
  DateRangeQuery,
  PatchMeBody,
  PatchTeamBody,
  PatchTeamMemberBody,
  UploadSessionBody,
  Uuid,
} from "@knockd/shared";
import { z } from "zod";
import { accountUser, forgetUser, requireAccount } from "../../auth/account";
import * as teams from "../../teams/service";
import { parse } from "../errors";

export const accountRouter = Router();
// Only these paths need a login, so unknown /v1 routes still 404 instead of 401.
accountRouter.use(["/me", "/teams", "/invites"], requireAccount);

const uid = (res: Parameters<typeof accountUser>[0]) => accountUser(res).id;

// ============================== Me ==============================

accountRouter.get("/me", async (_req, res) => {
  res.json(await teams.getMe(uid(res)));
});

accountRouter.patch("/me", async (req, res) => {
  const { displayName } = parse(PatchMeBody, req.body);
  const result = await teams.renameMe(uid(res), displayName);
  forgetUser(accountUser(res).auth0Sub);
  res.json(result);
});

accountRouter.get("/me/sessions", async (_req, res) => {
  res.json(await teams.getMySessions(uid(res)));
});

// ============================== Teams ==============================

accountRouter.post("/teams", async (req, res) => {
  const { name } = parse(CreateTeamBody, req.body);
  res.status(201).json({ team: await teams.createTeam(uid(res), name) });
});

accountRouter.get("/teams/:teamId", async (req, res) => {
  res.json({ team: await teams.getTeam(parse(Uuid, req.params.teamId), uid(res)) });
});

accountRouter.patch("/teams/:teamId", async (req, res) => {
  const body = parse(PatchTeamBody, req.body);
  res.json({ team: await teams.updateTeam(parse(Uuid, req.params.teamId), uid(res), body) });
});

accountRouter.delete("/teams/:teamId", async (req, res) => {
  await teams.deleteTeam(parse(Uuid, req.params.teamId), uid(res));
  res.status(204).end();
});

// ---------- members ----------

accountRouter.get("/teams/:teamId/members", async (req, res) => {
  res.json({ members: await teams.listMembers(parse(Uuid, req.params.teamId), uid(res)) });
});

accountRouter.patch("/teams/:teamId/members/:userId", async (req, res) => {
  const { role } = parse(PatchTeamMemberBody, req.body);
  await teams.setMemberRole(parse(Uuid, req.params.teamId), uid(res), parse(Uuid, req.params.userId), role);
  res.status(204).end();
});

accountRouter.delete("/teams/:teamId/members/:userId", async (req, res) => {
  await teams.removeMember(parse(Uuid, req.params.teamId), uid(res), parse(Uuid, req.params.userId));
  res.status(204).end();
});

// ---------- invites ----------

accountRouter.post("/teams/:teamId/invites", async (req, res) => {
  res.status(201).json(await teams.createInvite(parse(Uuid, req.params.teamId), uid(res)));
});

accountRouter.post("/invites/:token/accept", async (req, res) => {
  const token = parse(z.string().min(10).max(64), req.params.token);
  res.json({ team: await teams.acceptInvite(token, uid(res)) });
});

// ---------- sessions ----------

accountRouter.post("/teams/:teamId/sessions", async (req, res) => {
  const { sessionId } = parse(UploadSessionBody, req.body);
  res.json(await teams.uploadSession(parse(Uuid, req.params.teamId), uid(res), sessionId));
});

accountRouter.get("/teams/:teamId/sessions", async (req, res) => {
  const range = parse(DateRangeQuery, req.query);
  res.json({ sessions: await teams.listTeamSessions(parse(Uuid, req.params.teamId), uid(res), range) });
});

accountRouter.delete("/teams/:teamId/sessions/:sessionId", async (req, res) => {
  await teams.removeTeamSession(parse(Uuid, req.params.teamId), uid(res), parse(Uuid, req.params.sessionId));
  res.status(204).end();
});
