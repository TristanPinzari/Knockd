import { EMPTY_PLAN, type PlanEditOp } from "@knockd/shared";
import { setPlanSocket, type PlanSocket } from "@/realtime/planEdits";
import { usePlanStore } from "@/realtime/stores/planStore";
import { usePlanEditor } from "../planEditor";

const ME = "11111111-1111-4111-8111-111111111111";

/** A socket that acks every edit (or refuses them all) and remembers what was sent. */
function fakeSocket(ok = true): PlanSocket & { sent: PlanEditOp[] } {
  const sent: PlanEditOp[] = [];
  return {
    connected: true,
    sent,
    emit: (_event, op, ack) => {
      sent.push(op);
      ack(ok ? { ok: true } : { ok: false, error: "Session has ended" });
    },
  };
}

beforeEach(() => {
  usePlanEditor.getState().reset();
  usePlanStore.getState().reset();
  usePlanStore.getState().setPlan(EMPTY_PLAN, 0);
});

it("shows an edit straight away, sends it, and can undo and redo it", async () => {
  const socket = fakeSocket();
  setPlanSocket(socket);
  const editor = usePlanEditor.getState();

  expect(await editor.run([{ op: "claim", blockId: 1, memberId: ME }], ME)).toBe(true);
  expect(usePlanStore.getState().plan!.claims).toHaveLength(1);
  expect(socket.sent).toEqual([{ op: "claim", blockId: 1, memberId: ME }]);

  await usePlanEditor.getState().undo(ME);
  expect(socket.sent[1]).toEqual({ op: "unclaim", blockId: 1, memberId: ME });
  expect(usePlanStore.getState().plan!.claims).toHaveLength(0);
  expect(usePlanEditor.getState().redoStack).toHaveLength(1);

  await usePlanEditor.getState().redo(ME);
  expect(socket.sent[2]).toEqual({ op: "claim", blockId: 1, memberId: ME });
  expect(usePlanEditor.getState().undoStack).toHaveLength(1);
});

it("a refused edit shows the reason, asks for a fresh plan, and isn't added to undo", async () => {
  setPlanSocket(fakeSocket(false));
  const ok = await usePlanEditor.getState().run([{ op: "claim", blockId: 1, memberId: ME }], ME);
  expect(ok).toBe(false);
  expect(usePlanEditor.getState().message).toBe("Session has ended");
  expect(usePlanStore.getState().needsRefetch).toBe(true);
  expect(usePlanEditor.getState().undoStack).toHaveLength(0);
});

it("offline: says so and sends nothing", async () => {
  const socket = { ...fakeSocket(), connected: false };
  setPlanSocket(socket);
  await usePlanEditor.getState().run([{ op: "clearMine" }], ME);
  expect(usePlanEditor.getState().message).toMatch(/offline/);
  expect(socket.sent).toEqual([]);
});
