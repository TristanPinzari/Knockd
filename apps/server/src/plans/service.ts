/**
 * Plan library: plans made ahead of time (usually on the web) that a crew loads into a session's
 * planning draft. Everyone on the team can make plans; creators, owners and admins can delete them.
 */
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { CreatePlanBody, LibraryPlan, PatchPlanBody, PlanContent } from "@knockd/shared";
import { db } from "../db/client";
import { maps, plans, sessionMembers } from "../db/schema";
import { forbidden, HttpError, notFound } from "../http/errors";
import { replaceDraft } from "../sessions/planning";
import { requireMember } from "../teams/service";

const toPlan = (p: typeof plans.$inferSelect): LibraryPlan => ({
  id: p.id,
  teamId: p.teamId,
  mapId: p.mapId,
  name: p.name,
  groups: p.groups,
  usedInSessionId: p.usedInSessionId,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

async function checkMapOnTeam(mapId: string | null | undefined, teamId: string) {
  if (!mapId) return;
  const [m] = await db.select({ teamId: maps.teamId }).from(maps).where(eq(maps.id, mapId));
  if (!m || m.teamId !== teamId) throw new HttpError(400, "invalid_request", "That map isn't on this team");
}

/** Loads a plan the user can see. 404 if it doesn't exist or isn't on one of their teams. */
async function getPlanRow(planId: string, userId: string) {
  const [p] = await db.select().from(plans).where(eq(plans.id, planId));
  if (!p) throw notFound("Plan not found");
  const role = await requireMember(p.teamId, userId).catch(() => {
    throw notFound("Plan not found");
  });
  return { plan: p, role };
}

export async function listPlans(teamId: string, userId: string, used?: boolean): Promise<LibraryPlan[]> {
  await requireMember(teamId, userId);
  const rows = await db
    .select()
    .from(plans)
    .where(
      and(
        eq(plans.teamId, teamId),
        used === undefined ? undefined : used ? isNotNull(plans.usedInSessionId) : isNull(plans.usedInSessionId),
      ),
    )
    .orderBy(desc(plans.updatedAt));
  return rows.map(toPlan);
}

export async function createPlan(teamId: string, userId: string, body: CreatePlanBody): Promise<LibraryPlan> {
  await requireMember(teamId, userId);
  await checkMapOnTeam(body.mapId, teamId);
  const [p] = await db
    .insert(plans)
    .values({ teamId, mapId: body.mapId ?? null, name: body.name, groups: body.groups, createdBy: userId })
    .returning();
  return toPlan(p!);
}

export async function getPlan(planId: string, userId: string): Promise<LibraryPlan> {
  return toPlan((await getPlanRow(planId, userId)).plan);
}

export async function updatePlan(planId: string, userId: string, body: PatchPlanBody): Promise<LibraryPlan> {
  const { plan } = await getPlanRow(planId, userId);
  await checkMapOnTeam(body.mapId, plan.teamId);
  const [p] = await db
    .update(plans)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.mapId !== undefined && { mapId: body.mapId }),
      ...(body.groups !== undefined && { groups: body.groups }),
      updatedAt: new Date(),
    })
    .where(eq(plans.id, planId))
    .returning();
  return toPlan(p!);
}

export async function deletePlan(planId: string, userId: string): Promise<void> {
  const { plan, role } = await getPlanRow(planId, userId);
  if (plan.createdBy !== userId && role === "member")
    throw forbidden("Only the plan's creator or a team owner/admin can delete it");
  await db.delete(plans).where(eq(plans.id, planId));
}

/**
 * Loads a library plan into a session's planning draft (people are assigned in the session).
 * The session member must have joined while logged in, with an account on the plan's team.
 */
export async function loadPlanIntoSession(sessionId: string, memberId: string, planId: string): Promise<PlanContent> {
  const [member] = await db
    .select({ userId: sessionMembers.userId })
    .from(sessionMembers)
    .where(eq(sessionMembers.id, memberId));
  if (!member?.userId) throw new HttpError(401, "unauthorized", "Join the session while logged in to load team plans");
  const { plan } = await getPlanRow(planId, member.userId);

  const draft: PlanContent = {
    groups: plan.groups.map((g) => ({ label: g.label, memberIds: [], blockIds: g.blockIds })),
    drawings: [],
    notes: [],
  };
  const result = await replaceDraft(sessionId, memberId, draft);
  await db.update(plans).set({ usedInSessionId: sessionId }).where(eq(plans.id, planId));
  return result;
}
