/**
 * Create / join / end / leave, as plain async functions over injected dependencies so the flow is
 * unit-testable. The app uses `sessionLifecycle` (bound to the real runtime, see defaultDeps.ts).
 */
import type { CreateSessionBody, JoinSessionBody, SessionAccessRes, SessionAreaInput, LatLng } from "@knockd/shared";
import type { ApiClient } from "../realtime/api";
import { logger } from "../realtime/logger";
import { useActiveSession, type ActiveSession } from "./activeSessionStore";
import { useFinishedSession } from "./finishedSessionStore";
import { isSessionGone } from "./errorMessages";

export interface LifecycleDeps {
  getApi(): Promise<ApiClient>;
  stopTracking(): Promise<void>;
  /** Clears the live stores (crew, trails, leads, chat...) after a session ends or is left. */
  resetStores(): void;
  /** Sends whatever is still queued (pings, leads...) for the session. Optional in tests. */
  flush?(active: ActiveSession): Promise<unknown>;
}

/** Longest we wait for the queue to send when a session ends (no signal shouldn't block the screen). */
export const END_FLUSH_TIMEOUT_MS = 8000;

export interface CreateInput {
  displayName: string;
  location: LatLng;
  area: SessionAreaInput;
  /** Account only: a team map whose data (e.g. previous leads) loads into the session. */
  loadMap?: CreateSessionBody["loadMap"];
}

export function toActiveSession(res: SessionAccessRes, linked = false): ActiveSession {
  return {
    ...(linked ? { linked } : {}),
    sessionId: res.session.id,
    token: res.token,
    memberId: res.member.id,
    joinCode: res.session.joinCode,
    isAdmin: res.session.createdByMemberId === res.member.id,
    displayName: res.member.displayName,
  };
}

export interface SessionLifecycle {
  /** `accountToken`: when logged in, links the session (and your member) to your account. */
  create(input: CreateInput, accountToken?: string | null): Promise<ActiveSession>;
  join(body: JoinSessionBody, accountToken?: string | null): Promise<ActiveSession>;
  /** Admin: ends the session for everyone. */
  end(): Promise<void>;
  leave(): Promise<void>;
  /**
   * Local clean-up only (e.g. the socket said the session ended). With `ended`, the queue is sent
   * first and the session is kept as the finished session for the End of day screen.
   */
  teardown(options?: { ended?: boolean }): Promise<void>;
  startSim(bots: number): Promise<number>;
  /** Admin: removes someone from the session (their phone leaves it). */
  removeMember(memberId: string): Promise<void>;
}

export const SIM_PACE = "demo" as const;

export function createSessionLifecycle(deps: LifecycleDeps): SessionLifecycle {
  const activate = (res: SessionAccessRes, linked: boolean): ActiveSession => {
    const active = toActiveSession(res, linked);
    useActiveSession.getState().setActive(active);
    return active;
  };

  /** Sends what's queued, giving up quietly after END_FLUSH_TIMEOUT_MS. */
  const flushQuietly = async (active: ActiveSession): Promise<void> => {
    if (!deps.flush) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        deps.flush(active),
        new Promise((resolve) => (timer = setTimeout(resolve, END_FLUSH_TIMEOUT_MS))),
      ]);
    } catch (error) {
      logger.warn("session: could not send the queue before ending", error);
    } finally {
      clearTimeout(timer);
    }
  };

  const teardown = async (options: { ended?: boolean } = {}): Promise<void> => {
    const active = useActiveSession.getState().active;
    try {
      await deps.stopTracking();
    } catch (error) {
      logger.warn("session: could not stop tracking", error);
    }
    if (options.ended && active) {
      await flushQuietly(active);
      useFinishedSession.getState().setFinished(active);
    }
    deps.resetStores();
    useActiveSession.getState().clear();
  };

  /** Calls the server, then clears local state. A session the server no longer knows is cleared too. */
  const exit = async (call: (api: ApiClient, active: ActiveSession) => Promise<void>, ended = false): Promise<void> => {
    const active = useActiveSession.getState().active;
    if (!active) return;
    // Ending: send the last pings and leads first, while the session still takes them.
    if (ended) await flushQuietly(active);
    try {
      await call(await deps.getApi(), active);
    } catch (error) {
      if (!isSessionGone(error)) throw error;
    }
    await teardown({ ended });
  };

  const requireActive = (): ActiveSession => {
    const active = useActiveSession.getState().active;
    if (!active) throw new Error("No active session");
    return active;
  };

  return {
    create: async (input, accountToken) =>
      activate(await (await deps.getApi()).createSession(input, accountToken), !!accountToken),
    join: async (body, accountToken) =>
      activate(await (await deps.getApi()).joinSession(body, accountToken), !!accountToken),
    end: () => exit((api, a) => api.endSession(a.sessionId, a.token), true),
    leave: () => exit((api, a) => api.leaveSession(a.sessionId, a.token)),
    teardown,
    removeMember: async (memberId) => {
      const active = requireActive();
      await (await deps.getApi()).removeMember(active.sessionId, active.token, memberId);
    },
    startSim: async (bots) => {
      const active = requireActive();
      const res = await (await deps.getApi()).startSim(active.sessionId, active.token, bots, SIM_PACE);
      return res.botMemberIds.length;
    },
  };
}
