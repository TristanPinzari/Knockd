import { beforeEach, describe, expect, it } from "vitest";
import type { PlanContent } from "@knockd/shared";
import { usePlanStore } from "./stores/planStore";

const plan = (n: number): PlanContent => ({
  claims: [
    { blockId: n, memberId: "00000000-0000-4000-8000-000000000001", authorId: "00000000-0000-4000-8000-000000000001" },
  ],
  drawings: [],
  notes: [],
});
const SAM = "00000000-0000-4000-8000-000000000002";

describe("usePlanStore versions", () => {
  beforeEach(() => usePlanStore.getState().reset());

  it("takes the first full plan and newer updates in order", () => {
    usePlanStore.getState().setPlan(plan(1), 3);
    usePlanStore.getState().applyUpdate(plan(2), 4, SAM);
    expect(usePlanStore.getState()).toMatchObject({ plan: plan(2), version: 4, editedBy: SAM, needsRefetch: false });
  });

  it("ignores updates and fetches older than what it has", () => {
    usePlanStore.getState().setPlan(plan(5), 5);
    usePlanStore.getState().applyUpdate(plan(4), 4, SAM);
    usePlanStore.getState().applyUpdate(plan(6), 5, SAM);
    usePlanStore.getState().setPlan(plan(3), 3);
    expect(usePlanStore.getState()).toMatchObject({ plan: plan(5), version: 5 });
  });

  it("asks for a refetch when an update skips a version, and clears it on the next full plan", () => {
    usePlanStore.getState().setPlan(plan(1), 1);
    usePlanStore.getState().applyUpdate(plan(3), 3, SAM);
    expect(usePlanStore.getState()).toMatchObject({ plan: plan(3), version: 3, needsRefetch: true });
    usePlanStore.getState().setPlan(plan(3), 3);
    expect(usePlanStore.getState().needsRefetch).toBe(false);
  });

  it("accepts any update before the first full plan arrives", () => {
    usePlanStore.getState().applyUpdate(plan(9), 9, SAM);
    expect(usePlanStore.getState()).toMatchObject({ version: 9, needsRefetch: false });
  });
});
