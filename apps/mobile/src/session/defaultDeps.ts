/** The lifecycle bound to the real runtime (native modules). Not unit tested: it only glues. */
import { stopTracking } from "../location";
import { getRuntime } from "../realtime/runtime";
import { useChatStore } from "../realtime/stores/chatStore";
import { useCrewStore } from "../realtime/stores/crewStore";
import { useLeadsStore } from "../realtime/stores/leadsStore";
import { useOvertakeStore } from "../realtime/stores/overtakeStore";
import { usePinsStore } from "../realtime/stores/pinsStore";
import { usePlanStore } from "../realtime/stores/planStore";
import { useSessionStore } from "../realtime/stores/sessionStore";
import { usePlanEditor } from "../plan/planEditor";
import { useSuggestStore } from "../suggest/suggestStore";
import { useTrailsStore } from "../trails/trailsStore";
import { useSessionUi } from "./uiStore";
import { createSessionLifecycle } from "./lifecycle";

export function resetLiveStores(): void {
  useCrewStore.getState().reset();
  useTrailsStore.getState().reset();
  useLeadsStore.getState().reset();
  usePinsStore.getState().reset();
  usePlanStore.getState().reset();
  usePlanEditor.getState().reset();
  useSuggestStore.getState().reset();
  useChatStore.getState().reset();
  useOvertakeStore.getState().reset();
  useSessionStore.getState().reset();
  useSessionUi.getState().setSessionLive(false);
}

export const sessionLifecycle = createSessionLifecycle({
  getApi: async () => (await getRuntime()).api,
  stopTracking,
  resetStores: resetLiveStores,
});
