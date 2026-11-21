/**
 * Background jobs, run inside the API server (one instance, so no job queue needed):
 * - process sessions when they end (and catch up on any missed, e.g. after a redeploy)
 * - auto-end sessions left running for 12 hours
 * - delete sessions nobody uploaded once the 7-day grace period is over
 */
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { logger } from "../logger";
import { emitToSession } from "../realtime/io";
import { processSession } from "./process-session";

const AUTO_END_AFTER_HOURS = 12;
const GRACE_DAYS = 7;
const MAINTENANCE_EVERY_MS = 10 * 60_000;

// ---------- processing queue: one session at a time ----------

const queued = new Set<string>();
let chain: Promise<void> = Promise.resolve();

/** Queue a session for processing. Safe to call more than once. */
export function enqueueProcessing(sessionId: string): void {
  if (queued.has(sessionId)) return;
  queued.add(sessionId);
  chain = chain.then(async () => {
    try {
      await processSession(sessionId);
    } catch (err) {
      logger.error({ err, sessionId }, "session processing failed");
    } finally {
      queued.delete(sessionId);
    }
  });
}

/** Resolves once everything queued so far has been processed (used by tests and shutdown). */
export const processingIdle = () => chain;

// ---------- maintenance ----------

async function maintenance() {
  // Sessions still live after 12 hours: end them.
  const autoEnded = await db.execute<{ id: string }>(sql`
    UPDATE sessions SET status = 'ended', ended_at = now()
    WHERE status = 'live' AND started_at < now() - make_interval(hours => ${AUTO_END_AFTER_HOURS})
    RETURNING id`);
  for (const { id } of autoEnded) emitToSession(id, "session:ended");

  // Ended but not processed (auto-ended above, or the server restarted mid-way).
  const pending = await db.execute<{ id: string }>(sql`SELECT id FROM sessions WHERE status = 'ended'`);
  for (const { id } of pending) enqueueProcessing(id);

  // Grace period over and nobody uploaded it: delete. Cascades to members, leads, pins, chat, results.
  const deleted = await db.execute<{ id: string }>(sql`
    DELETE FROM sessions s
    WHERE s.started_at < now() - make_interval(days => ${GRACE_DAYS})
      AND NOT EXISTS (SELECT 1 FROM team_sessions ts WHERE ts.session_id = s.id)
    RETURNING s.id`);

  if (autoEnded.length || pending.length || deleted.length)
    logger.info({ autoEnded: autoEnded.length, queued: pending.length, deleted: deleted.length }, "maintenance");
}

let timer: NodeJS.Timeout | null = null;

export function startJobs(): void {
  const run = () => maintenance().catch((err) => logger.error({ err }, "maintenance failed"));
  void run();
  timer = setInterval(run, MAINTENANCE_EVERY_MS);
}

export async function stopJobs(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  await chain;
}
