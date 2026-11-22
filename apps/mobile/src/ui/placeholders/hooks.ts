import { crew, type MockMember } from "@/mock";

export interface LocationStatus {
  offline: boolean;
  pendingCount: number;
}

/** Placeholder for `useCrewStore` from src/realtime. */
export function useMockCrew(): readonly MockMember[] {
  return crew;
}

/** Placeholder for `pendingOutboxCount()` + connectivity from src/location and src/realtime. */
export function useMockLocationStatus(offline = false): LocationStatus {
  return { offline, pendingCount: offline ? 3 : 0 };
}
