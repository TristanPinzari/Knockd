/**
 * Planning mode: one live plan per session (claims, routes/freehand lines, notes), edited over the
 * socket with `plan:edit` and broadcast as `plan:updated`. No draft/apply step.
 *
 * Edits use applyPlanEdit from @knockd/shared, the same code the apps run for instant updates.
 * The author of new items is always the member who sent the edit (so "clearMine" can be trusted).
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  applyPlanEdit,
  DEFAULT_HOUSES_PER_HOUR_PER_GROUP,
  EMPTY_PLAN,
  memberIdsIn,
  PlanEditError,
  type GetSessionPlanRes,
  type KnockRateRes,
  type PlanContent,
  type PlanEditOp,
} from "@knockd/shared";
import { db } from "../db/client";
import { sessionMembers, sessionPlans, sessions } from "../db/schema";
import { HttpError } from "../http/errors";
import { emitToSession } from "../realtime/io";

export async function getPlan(sessionId: string): Promise<GetSessionPlanRes> {
  const [row] = await db
    .select({ plan: sessionPlans.plan, version: sessionPlans.version })
    .from(sessionPlans)
    .where(eq(sessionPlans.sessionId, sessionId));
  return { plan: row?.plan ?? EMPTY_PLAN, version: row?.version ?? 0 };
}

/** One edit at a time per session, so two people editing at once can't overwrite each other's change. */
const queues = new Map<string, Promise<unknown>>();
function serialised<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(sessionId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  queues.set(sessionId, next);
  // Cleanup must handle rejection too: an unhandled rejection here would crash the process.
  const cleanup = () => {
    if (queues.get(sessionId) === next) queues.delete(sessionId);
  };
  next.then(cleanup, cleanup);
  return next;
}

export function editPlan(sessionId: string, authorId: string, op: PlanEditOp): Promise<PlanContent> {
  return serialised(sessionId, async () => {
    await assertLive(sessionId);
    await assertMembers(sessionId, memberIdsIn(op));
    const { plan } = await getPlan(sessionId);
    let updated: PlanContent;
    try {
      updated = applyPlanEdit(plan, op, authorId);
    } catch (err) {
      if (err instanceof PlanEditError) throw new HttpError(400, "invalid_request", err.message);
      throw err;
    }
    // Save and bump the version in one statement.
    const [saved] = await db
      .insert(sessionPlans)
      .values({ sessionId, plan: updated, version: 1 })
      .onConflictDoUpdate({
        target: sessionPlans.sessionId,
        set: { plan: updated, version: sql`${sessionPlans.version} + 1`, updatedAt: new Date() },
      })
      .returning({ version: sessionPlans.version });
    emitToSession(sessionId, "plan:updated", { plan: updated, version: saved!.version, editedBy: authorId });
    return updated;
  });
}

/**
 * Houses per hour per person or pair, for on-device suggestions.
 * TODO: once sessions are uploaded to teams, use the team's history from knock_rate_hourly.
 */
export async function getKnockRate(_sessionId: string): Promise<KnockRateRes> {
  return { housesPerHourPerGroup: DEFAULT_HOUSES_PER_HOUR_PER_GROUP, source: "default" };
}

async function assertLive(sessionId: string) {
  const [s] = await db.select({ status: sessions.status }).from(sessions).where(eq(sessions.id, sessionId));
  if (!s) throw new HttpError(404, "session_not_found", "Session not found");
  if (s.status !== "live") throw new HttpError(410, "session_ended", "Planning is closed: the session has ended");
}

/** Claims, drawings and notes can only be for people actually in the session. */
async function assertMembers(sessionId: string, memberIds: string[]) {
  if (!memberIds.length) return;
  const found = await db
    .select({ id: sessionMembers.id })
    .from(sessionMembers)
    .where(
      and(
        eq(sessionMembers.sessionId, sessionId),
        inArray(sessionMembers.id, memberIds),
        isNull(sessionMembers.removedAt),
      ),
    );
  if (found.length !== new Set(memberIds).size)
    throw new HttpError(400, "invalid_request", "That person isn't in this session");
}
