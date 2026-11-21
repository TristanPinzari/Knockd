/** 👤 Account endpoints: /me, /teams, /invites. All need an Auth0 login token. */
import { Router } from "express";
import {
  CreateMapBody,
  CreatePlanBody,
  CreateTeamBody,
  GeoBlocksQuery,
  GetPlansQuery,
  MapLeadsQuery,
  MapQuery,
  PatchMapBody,
  PatchPlanBody,
  WhereNextQuery,
  DateRangeQuery,
  PatchMeBody,
  PatchTeamBody,
  PatchTeamMemberBody,
  UploadSessionBody,
  Uuid,
} from "@knockd/shared";
import { z } from "zod";
import { accountUser, forgetUser, requireAccount } from "../../auth/account";
import * as maps from "../../maps/service";
import * as plans from "../../plans/service";
import { getTeamSession } from "../../teams/replay";
import * as teams from "../../teams/service";
import { parse } from "../errors";

export const accountRouter = Router();
// Only these paths need a login, so unknown /v1 routes still 404 instead of 401.
accountRouter.use(["/me", "/teams", "/invites", "/maps", "/plans", "/geo"], requireAccount);

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

// Session replay: one uploaded session's paths, coverage, leads and stats.
accountRouter.get("/teams/:teamId/sessions/:sessionId", async (req, res) => {
  res.json(await getTeamSession(parse(Uuid, req.params.teamId), uid(res), parse(Uuid, req.params.sessionId)));
});

accountRouter.delete("/teams/:teamId/sessions/:sessionId", async (req, res) => {
  await teams.removeTeamSession(parse(Uuid, req.params.teamId), uid(res), parse(Uuid, req.params.sessionId));
  res.status(204).end();
});

// ============================== Maps ==============================

accountRouter.get("/teams/:teamId/maps", async (req, res) => {
  res.json({ maps: await maps.listMaps(parse(Uuid, req.params.teamId), uid(res)) });
});

accountRouter.post("/teams/:teamId/maps", async (req, res) => {
  const body = parse(CreateMapBody, req.body);
  res.status(201).json({ map: await maps.createMap(parse(Uuid, req.params.teamId), uid(res), body) });
});

accountRouter.patch("/maps/:mapId", async (req, res) => {
  const body = parse(PatchMapBody, req.body);
  res.json({ map: await maps.updateMap(parse(Uuid, req.params.mapId), uid(res), body) });
});

accountRouter.delete("/maps/:mapId", async (req, res) => {
  await maps.deleteMap(parse(Uuid, req.params.mapId), uid(res));
  res.status(204).end();
});

/** Loads the map (checking team access) for the query endpoints below. */
const mapFor = (req: { params: { mapId?: string } }, res: Parameters<typeof uid>[0]) =>
  maps.getMap(parse(Uuid, req.params.mapId), uid(res));

accountRouter.get("/maps/:mapId/paths", async (req, res) => {
  const { bbox, asOf } = parse(MapQuery, req.query);
  res.json(await maps.mapPaths(await mapFor(req, res), bbox, asOf));
});

accountRouter.get("/maps/:mapId/blocks", async (req, res) => {
  const { bbox, asOf } = parse(MapQuery, req.query);
  res.json(await maps.mapBlocks(await mapFor(req, res), bbox, asOf));
});

accountRouter.get("/maps/:mapId/leads", async (req, res) => {
  const { bbox, asOf, grades } = parse(MapLeadsQuery, req.query);
  res.json(await maps.mapLeads(await mapFor(req, res), bbox, grades, asOf));
});

accountRouter.get("/maps/:mapId/stats", async (req, res) => {
  const range = parse(DateRangeQuery, req.query);
  res.json(await maps.mapStats(await mapFor(req, res), range));
});

accountRouter.get("/maps/:mapId/where-next", async (req, res) => {
  const { near, limit } = parse(WhereNextQuery, req.query);
  res.json(await maps.whereNext(await mapFor(req, res), near, limit));
});

accountRouter.get("/geo/blocks", async (req, res) => {
  const { bbox } = parse(GeoBlocksQuery, req.query);
  res.json(await maps.geoBlocks(bbox));
});

// ============================== Plans ==============================

accountRouter.get("/teams/:teamId/plans", async (req, res) => {
  const { used } = parse(GetPlansQuery, req.query);
  res.json({ plans: await plans.listPlans(parse(Uuid, req.params.teamId), uid(res), used) });
});

accountRouter.post("/teams/:teamId/plans", async (req, res) => {
  const body = parse(CreatePlanBody, req.body);
  res.status(201).json({ plan: await plans.createPlan(parse(Uuid, req.params.teamId), uid(res), body) });
});

accountRouter.get("/plans/:planId", async (req, res) => {
  res.json({ plan: await plans.getPlan(parse(Uuid, req.params.planId), uid(res)) });
});

accountRouter.patch("/plans/:planId", async (req, res) => {
  const body = parse(PatchPlanBody, req.body);
  res.json({ plan: await plans.updatePlan(parse(Uuid, req.params.planId), uid(res), body) });
});

accountRouter.delete("/plans/:planId", async (req, res) => {
  await plans.deletePlan(parse(Uuid, req.params.planId), uid(res));
  res.status(204).end();
});
