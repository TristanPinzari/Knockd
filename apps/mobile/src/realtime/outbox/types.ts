import type { PatchLeadBody, Ping, PostLeadBody, PostMessageBody, PostPinBody } from "@knockd/shared";

/** Everything the phone can create offline. Each carries a client UUID so the server can dedupe retries. */
export type OutboxPayload =
  | { kind: "ping"; body: Ping }
  | { kind: "lead"; body: PostLeadBody }
  | { kind: "leadPatch"; leadClientId: string; body: PatchLeadBody }
  | { kind: "leadDelete"; leadClientId: string }
  | { kind: "message"; body: PostMessageBody }
  | { kind: "pin"; body: PostPinBody }
  | { kind: "pinDelete"; pinClientId: string };

export type OutboxKind = OutboxPayload["kind"];

export const OUTBOX_KINDS: readonly OutboxKind[] = [
  "ping",
  "lead",
  "leadPatch",
  "leadDelete",
  "message",
  "pin",
  "pinDelete",
];

export interface OutboxItem {
  /** The clientId for ping/lead/message/pin; a fresh UUID for patch/delete ops. */
  id: string;
  sessionId: string;
  /** ms since epoch when it was queued (keeps order). */
  createdAt: number;
  attempts: number;
  /** Not retried before this time (ms since epoch). */
  nextAttemptAt: number;
  payload: OutboxPayload;
}

export interface Reschedule {
  id: string;
  attempts: number;
  nextAttemptAt: number;
}

/** Persistence behind the outbox. SQLite on the phone, in memory in tests. */
export interface OutboxStore {
  /** Insert items; an id that already exists is ignored (idempotent). */
  enqueue(items: readonly OutboxItem[]): Promise<void>;
  /** Items ready to send (nextAttemptAt <= now), oldest first. */
  due(sessionId: string, now: number, limit: number): Promise<OutboxItem[]>;
  remove(ids: readonly string[]): Promise<void>;
  reschedule(updates: readonly Reschedule[]): Promise<void>;
  /** Items waiting to be acknowledged, for one session or all. */
  count(sessionId?: string): Promise<number>;
  clearSession(sessionId: string): Promise<void>;
}
