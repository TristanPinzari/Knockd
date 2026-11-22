import type { SessionAccessRes } from "@knockd/shared";
import type { ApiClient } from "../../realtime/api";
import { useCrewStore } from "../../realtime/stores/crewStore";
import { setActiveSessionStorage, useActiveSession } from "../activeSessionStore";
import { createSessionLifecycle, toActiveSession } from "../lifecycle";

const SID = "00000000-0000-4000-8000-000000000001";
const ME = "00000000-0000-4000-8000-000000000002";
const SAM = "00000000-0000-4000-8000-000000000003";

const access = {
  session: { id: SID, joinCode: "KNK482", createdByMemberId: ME },
  member: { id: ME, displayName: "Tristan" },
  token: "session-token",
} as unknown as SessionAccessRes;

beforeEach(() => {
  setActiveSessionStorage(null);
  useActiveSession.setState({ active: toActiveSession(access), hydrated: true });
  useCrewStore.getState().reset();
});

it("the admin removes someone through the API", async () => {
  const removeMember = jest.fn(async () => undefined);
  const lifecycle = createSessionLifecycle({
    getApi: async () => ({ removeMember }) as unknown as ApiClient,
    stopTracking: async () => undefined,
    resetStores: () => undefined,
  });
  await lifecycle.removeMember(SAM);
  expect(removeMember).toHaveBeenCalledWith(SID, "session-token", SAM);
});

it("a phone notices when its own member is removed, not when someone else is", () => {
  useCrewStore.getState().setMe(ME);
  useCrewStore.getState().memberLeft(SAM);
  expect(useCrewStore.getState().removedMe).toBe(false);
  useCrewStore.getState().memberLeft(ME);
  expect(useCrewStore.getState().removedMe).toBe(true);
  useCrewStore.getState().reset();
  expect(useCrewStore.getState().removedMe).toBe(false);
});
