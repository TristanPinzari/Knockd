/**
 * The session this device is part of (token + ids), persisted to the OS keychain/keystore so the app
 * reopens straight into the live session. `hydrated` turns true once the stored value has been read
 * (or reading failed), so screens can wait before deciding between "demo" and "live".
 */
import { create } from "zustand";
import { z } from "zod";
import { logger } from "../realtime/logger";

export interface ActiveSession {
  sessionId: string;
  token: string;
  memberId: string;
  joinCode: string;
  isAdmin: boolean;
  displayName: string;
  /** Created or joined while logged in, so it can be added to a team afterwards. */
  linked?: boolean;
}

export interface ActiveSessionState {
  active: ActiveSession | null;
  hydrated: boolean;
  setActive(a: ActiveSession): void;
  clear(): void;
}

/** Minimal key/value storage (SecureStore in the app, an in-memory map in tests). */
export interface KeyValueStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const ACTIVE_SESSION_KEY = "knockd.activeSession";

const StoredSession = z.object({
  sessionId: z.string().min(1),
  token: z.string().min(1),
  memberId: z.string().min(1),
  joinCode: z.string(),
  isAdmin: z.boolean(),
  displayName: z.string(),
  linked: z.boolean().optional(),
});

export function parseStoredSession(raw: string | null): ActiveSession | null {
  if (!raw) return null;
  try {
    const parsed = StoredSession.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

let storage: KeyValueStorage | null = null;

/** Wires the persistence backend. Called once from `hydrateActiveSession`; tests inject a fake. */
export function setActiveSessionStorage(next: KeyValueStorage | null): void {
  storage = next;
}

function persist(session: ActiveSession | null): void {
  if (!storage) return;
  const write = session
    ? storage.setItemAsync(ACTIVE_SESSION_KEY, JSON.stringify(session))
    : storage.deleteItemAsync(ACTIVE_SESSION_KEY);
  write.catch((error: unknown) => logger.warn("active session: could not persist", error));
}

export const useActiveSession = create<ActiveSessionState>()((set) => ({
  active: null,
  hydrated: false,
  setActive: (a) => {
    set({ active: { ...a } });
    persist(a);
  },
  clear: () => {
    set({ active: null });
    persist(null);
  },
}));

/**
 * Reads the stored session into the store. Never throws: a broken or unreadable value just means
 * "no session" (the demo). A session set while hydration was in flight wins over the stored one.
 */
export async function hydrateActiveSession(backend: KeyValueStorage): Promise<void> {
  setActiveSessionStorage(backend);
  let restored: ActiveSession | null = null;
  try {
    restored = parseStoredSession(await backend.getItemAsync(ACTIVE_SESSION_KEY));
  } catch (error) {
    logger.warn("active session: could not read stored session", error);
  }
  useActiveSession.setState((state) => ({ hydrated: true, active: state.active ?? restored }));
}
