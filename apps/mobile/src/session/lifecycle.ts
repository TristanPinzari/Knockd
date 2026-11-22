/**
 * Create / join / end / leave, as plain async functions over injected dependencies so the flow is
 * unit-testable. The app uses `sessionLifecycle` (bound to the real runtime, see defaultDeps.ts).
 */
import type { JoinSessionBody, SessionAccessRes, SessionAreaInput, LatLng } from "@knockd/shared";
import type { ApiClient } from "../realtime/api";
import { logger } from "../realtime/logger";
import { useActiveSession, type ActiveSession } from "./activeSessionStore";
import { isSessionGone } from "./errorMessages";

export interface LifecycleDeps {
  getApi(): Promise<ApiClient>;
  stopTracking(): Promise<void>;
  /** Clears the live stores (crew, trails, leads, chat...) after a session ends or is left. */
  resetStores(): void;
}

export interface CreateInput {
  displayName: string;
  location: LatLng;
  area: SessionAreaInput;
}

export function toActiveSession(res: SessionAccessRes): ActiveSession {
  return {
    sessionId: res.session.id,
    token: res.token,
    memberId: res.member.id,
    joinCode: res.session.joinCode,
    isAdmin: res.session.createdByMemberId === res.member.id,
    displayName: res.member.displayName,
  };
}

export interface SessionLifecycle {
  create(input: CreateInput): Promise<ActiveSession>;
  join(body: JoinSessionBody): Promise<ActiveSession>;
  /** Admin: ends the session for everyone. */
  end(): Promise<void>;
  leave(): Promise<void>;
  /** Local clean-up only (e.g. the socket said the session ended). */
  teardown(): Promise<void>;
  startSim(bots: number): Promise<number>;
}

export const SIM_PACE = "demo" as const;

export function createSessionLifecycle(deps: LifecycleDeps): SessionLifecycle {
  const activate = (res: SessionAccessRes): ActiveSession => {
    const active = toActiveSession(res);
    useActiveSession.getState().setActive(active);
    return active;
  };

  const teardown = async (): Promise<void> => {
    try {
      await deps.stopTracking();
    } catch (error) {
      logger.warn("session: could not stop tracking", error);
    }
    deps.resetStores();
    useActiveSession.getState().clear();
  };

  /** Calls the server, then clears local state. A session the server no longer knows is cleared too. */
  const exit = async (call: (api: ApiClient, active: ActiveSession) => Promise<void>): Promise<void> => {
    const active = useActiveSession.getState().active;
    if (!active) return;
    try {
      await call(await deps.getApi(), active);
    } catch (error) {
      if (!isSessionGone(error)) throw error;
    }
    await teardown();
  };

  const requireActive = (): ActiveSession => {
    const active = useActiveSession.getState().active;
    if (!active) throw new Error("No active session");
    return active;
  };

  return {
    create: async (input) => activate(await (await deps.getApi()).createSession(input)),
    join: async (body) => activate(await (await deps.getApi()).joinSession(body)),
    end: () => exit((api, a) => api.endSession(a.sessionId, a.token)),
    leave: () => exit((api, a) => api.leaveSession(a.sessionId, a.token)),
    teardown,
    startSim: async (bots) => {
      const active = requireActive();
      const res = await (await deps.getApi()).startSim(active.sessionId, active.token, bots, SIM_PACE);
      return res.botMemberIds.length;
    },
  };
}
