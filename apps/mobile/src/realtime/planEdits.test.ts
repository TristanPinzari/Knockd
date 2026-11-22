import { describe, expect, it, vi } from "vitest";
import type { PlanEditOp } from "@knockd/shared";
import { PlanEditError, sendPlanEdits, type PlanSocket } from "./planEdits";

const op = (blockId: number): PlanEditOp => ({
  op: "claim",
  blockId,
  memberId: "00000000-0000-4000-8000-000000000001",
});

function socket(answers: ({ ok: true } | { ok: false; error?: string } | "silent")[], connected = true) {
  const sent: PlanEditOp[] = [];
  const s: PlanSocket = {
    connected,
    emit: (_event, edit, ack) => {
      sent.push(edit);
      const answer = answers[sent.length - 1] ?? { ok: true };
      if (answer !== "silent") ack(answer);
    },
  };
  return { s, sent };
}

describe("sendPlanEdits", () => {
  it("sends every edit in order", async () => {
    const { s, sent } = socket([]);
    await sendPlanEdits([op(1), op(2), op(3)], s);
    expect(sent.map((e) => (e as { blockId: number }).blockId)).toEqual([1, 2, 3]);
  });

  it("stops at the first rejected edit with the server's message", async () => {
    const { s, sent } = socket([{ ok: true }, { ok: false, error: "That person isn't in this session" }]);
    await expect(sendPlanEdits([op(1), op(2), op(3)], s)).rejects.toThrow("That person isn't in this session");
    expect(sent).toHaveLength(2);
  });

  it("fails when offline or when the server doesn't answer", async () => {
    await expect(sendPlanEdits([op(1)], socket([], false).s)).rejects.toBeInstanceOf(PlanEditError);
    await expect(sendPlanEdits([op(1)], null)).rejects.toBeInstanceOf(PlanEditError);
    vi.useFakeTimers();
    const pending = sendPlanEdits([op(1)], socket(["silent"]).s, 1000);
    const check = expect(pending).rejects.toThrow("didn't answer");
    await vi.advanceTimersByTimeAsync(1000);
    await check;
    vi.useRealTimers();
  });
});
