import { describe, expect, it, vi } from "vitest";
import { createSqliteOutboxStore, rowToItem, type SqlDb } from "./sqliteStore";

const row = (over = {}) => ({
  id: "a",
  session_id: "s",
  kind: "pinDelete",
  payload: JSON.stringify({ kind: "pinDelete", pinClientId: "a" }),
  created_at: 1,
  attempts: 0,
  next_attempt_at: 0,
  ...over,
});

function fakeDb(rows: unknown[] = [], count = 3) {
  const runs: { sql: string; params: readonly unknown[] }[] = [];
  const db: SqlDb = {
    execAsync: vi.fn(async () => undefined),
    runAsync: vi.fn(async (sql, params) => void runs.push({ sql, params })),
    getAllAsync: vi.fn(async () => rows as never),
    getFirstAsync: vi.fn(async () => ({ n: count }) as never),
  };
  return { db, runs };
}

describe("sqlite outbox store (SQL glue, fake db)", () => {
  it("rowToItem rejects bad or mismatched payloads", () => {
    expect(rowToItem(row())?.payload.kind).toBe("pinDelete");
    expect(rowToItem(row({ payload: "{" }))).toBeNull();
    expect(rowToItem(row({ kind: "ping" }))).toBeNull();
  });

  it("creates the schema, inserts idempotently, reschedules, counts and clears", async () => {
    const { db, runs } = fakeDb();
    const store = await createSqliteOutboxStore(db);
    expect(db.execAsync).toHaveBeenCalled();
    await store.enqueue([
      {
        id: "a",
        sessionId: "s",
        createdAt: 1,
        attempts: 0,
        nextAttemptAt: 0,
        payload: { kind: "pinDelete", pinClientId: "a" },
      },
    ]);
    expect(runs[0]?.sql).toContain("INSERT OR IGNORE");
    await store.reschedule([{ id: "a", attempts: 1, nextAttemptAt: 9 }]);
    await store.remove(["a", "b"]);
    await store.clearSession("s");
    expect(await store.count("s")).toBe(3);
    expect(await store.count()).toBe(3);
  });

  it("due() removes unreadable rows and returns the rest", async () => {
    const { db, runs } = fakeDb([row(), row({ id: "bad", payload: "{" })]);
    const store = await createSqliteOutboxStore(db);
    const items = await store.due("s", 0, 10);
    expect(items.map((i) => i.id)).toEqual(["a"]);
    expect(runs.some((r) => r.sql.startsWith("DELETE") && r.params.includes("bad"))).toBe(true);
  });
});
