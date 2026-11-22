/**
 * OutboxStore on expo-sqlite. Kept thin on purpose (SQL only) and typed against a minimal slice of
 * the expo-sqlite database so it can be driven by a fake. Needs a device/simulator to verify for real.
 */
import { logger } from "../logger";
import { OUTBOX_KINDS, type OutboxItem, type OutboxPayload, type OutboxStore } from "./types";

/** The subset of expo-sqlite's SQLiteDatabase this store uses. */
export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: readonly (string | number)[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: readonly (string | number)[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: readonly (string | number)[]): Promise<T | null>;
}

interface Row {
  id: string;
  session_id: string;
  kind: string;
  payload: string;
  created_at: number;
  attempts: number;
  next_attempt_at: number;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS outbox (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS outbox_due ON outbox (session_id, next_attempt_at, created_at);
`;

const placeholders = (n: number): string => Array.from({ length: n }, () => "?").join(",");
const CHUNK = 400; // stays under SQLite's 999-variable limit

export function rowToItem(row: Row): OutboxItem | null {
  try {
    const payload = JSON.parse(row.payload) as OutboxPayload;
    if (!OUTBOX_KINDS.includes(payload.kind) || payload.kind !== row.kind) return null;
    return {
      id: row.id,
      sessionId: row.session_id,
      createdAt: row.created_at,
      attempts: row.attempts,
      nextAttemptAt: row.next_attempt_at,
      payload,
    };
  } catch {
    return null;
  }
}

export async function createSqliteOutboxStore(db: SqlDb): Promise<OutboxStore> {
  await db.execAsync(SCHEMA);

  const removeChunked = async (ids: readonly string[]): Promise<void> => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      await db.runAsync(`DELETE FROM outbox WHERE id IN (${placeholders(slice.length)})`, slice);
    }
  };

  return {
    enqueue: async (items) => {
      for (const item of items) {
        await db.runAsync(
          `INSERT OR IGNORE INTO outbox (id, session_id, kind, payload, created_at, attempts, next_attempt_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.sessionId,
            item.payload.kind,
            JSON.stringify(item.payload),
            item.createdAt,
            item.attempts,
            item.nextAttemptAt,
          ],
        );
      }
    },
    due: async (sessionId, now, limit) => {
      const rows = await db.getAllAsync<Row>(
        `SELECT * FROM outbox WHERE session_id = ? AND next_attempt_at <= ? ORDER BY created_at, seq LIMIT ?`,
        [sessionId, now, limit],
      );
      const items: OutboxItem[] = [];
      const corrupt: string[] = [];
      for (const row of rows) {
        const item = rowToItem(row);
        if (item) items.push(item);
        else corrupt.push(row.id);
      }
      if (corrupt.length > 0) {
        logger.warn(`outbox: dropping ${corrupt.length} unreadable row(s)`);
        await removeChunked(corrupt);
      }
      return items;
    },
    remove: removeChunked,
    reschedule: async (updates) => {
      for (const u of updates) {
        await db.runAsync(`UPDATE outbox SET attempts = ?, next_attempt_at = ? WHERE id = ?`, [
          u.attempts,
          u.nextAttemptAt,
          u.id,
        ]);
      }
    },
    count: async (sessionId) => {
      const row =
        sessionId === undefined
          ? await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox`, [])
          : await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM outbox WHERE session_id = ?`, [sessionId]);
      return row?.n ?? 0;
    },
    clearSession: async (sessionId) => {
      await db.runAsync(`DELETE FROM outbox WHERE session_id = ?`, [sessionId]);
    },
  };
}
