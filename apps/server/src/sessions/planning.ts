/**
 * Planning mode. The draft is edited live over the socket (`plan:edit`); Apply makes it the
 * plan everyone works from. Edits use applyPlanEdit from @knockd/shared, the same code the
 * apps run, so their instant local update always matches the server's result.
 */
import { eq } from "drizzle-orm";
import {
  applyPlanEdit,
  DEFAULT_HOUSES_PER_HOUR_PER_GROUP,
  EMPTY_PLAN,
  PlanEditError,
  type GetSessionPlanRes,
  type KnockRateRes,
  type PlanContent,
  type PlanEditOp,
} from "@knockd/shared";
import { db } from "../db/client";
import { sessionPlans, sessions } from "../db/schema";
import { HttpError } from "../http/errors";
import { emitToSession } from "../realtime/io";

export async function getPlan(sessionId: string): Promise<GetSessionPlanRes> {
  const [row] = await db.select().from(sessionPlans).where(eq(sessionPlans.sessionId, sessionId));
  return { draft: row?.draft ?? EMPTY_PLAN, applied: row?.applied ?? null };
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

export function editDraft(sessionId: string, memberId: string, op: PlanEditOp): Promise<PlanContent> {
  return serialised(sessionId, async () => {
    await assertLive(sessionId);
    const { draft } = await getPlan(sessionId);
    let updated: PlanContent;
    try {
      updated = applyPlanEdit(draft, op);
    } catch (err) {
      if (err instanceof PlanEditError) throw new HttpError(400, "invalid_request", err.message);
      throw err;
    }
    await db
      .insert(sessionPlans)
      .values({ sessionId, draft: updated })
      .onConflictDoUpdate({ target: sessionPlans.sessionId, set: { draft: updated, updatedAt: new Date() } });
    emitToSession(sessionId, "plan:draft", { draft: updated, editedBy: memberId });
    return updated;
  });
}

export function applyDraft(sessionId: string): Promise<PlanContent> {
  return serialised(sessionId, async () => {
    await assertLive(sessionId);
    const { draft } = await getPlan(sessionId);
    await db
      .update(sessionPlans)
      .set({ applied: draft, updatedAt: new Date() })
      .where(eq(sessionPlans.sessionId, sessionId));
    emitToSession(sessionId, "plan:applied", { plan: draft });
    return draft;
  });
}

/**
 * Houses per hour per person or pair, for on-device suggestions.
 * TODO: once accounts and teams exist, use the team's history from knock_rate_hourly.
 */
export async function getKnockRate(_sessionId: string): Promise<KnockRateRes> {
  return { housesPerHourPerGroup: DEFAULT_HOUSES_PER_HOUR_PER_GROUP, source: "default" };
}

async function assertLive(sessionId: string) {
  const [s] = await db.select({ status: sessions.status }).from(sessions).where(eq(sessions.id, sessionId));
  if (!s) throw new HttpError(404, "session_not_found", "Session not found");
  if (s.status !== "live") throw new HttpError(410, "session_ended", "Planning is closed: the session has ended");
}
