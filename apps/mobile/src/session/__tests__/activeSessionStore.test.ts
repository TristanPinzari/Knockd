import {
  ACTIVE_SESSION_KEY,
  hydrateActiveSession,
  parseStoredSession,
  setActiveSessionStorage,
  useActiveSession,
  type ActiveSession,
  type KeyValueStorage,
} from "../activeSessionStore";

const session: ActiveSession = {
  sessionId: "s-1",
  token: "tok",
  memberId: "m-1",
  joinCode: "KNK482",
  isAdmin: true,
  displayName: "Jas",
};

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const store = { data: { ...initial } };
  return {
    get data() {
      return store.data;
    },
    getItemAsync: async (key) => store.data[key] ?? null,
    setItemAsync: async (key, value) => {
      store.data = { ...store.data, [key]: value };
    },
    deleteItemAsync: async (key) => {
      const { [key]: _gone, ...rest } = store.data;
      store.data = rest;
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  setActiveSessionStorage(null);
  useActiveSession.setState({ active: null, hydrated: false });
});

describe("parseStoredSession", () => {
  it("returns null for empty, non-JSON or wrongly shaped values", () => {
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession("{oops")).toBeNull();
    expect(parseStoredSession(JSON.stringify({ sessionId: "s" }))).toBeNull();
  });

  it("parses a valid stored session", () => {
    expect(parseStoredSession(JSON.stringify(session))).toEqual(session);
  });
});

describe("hydrateActiveSession", () => {
  it("restores the stored session and marks the store hydrated", async () => {
    await hydrateActiveSession(memoryStorage({ [ACTIVE_SESSION_KEY]: JSON.stringify(session) }));
    expect(useActiveSession.getState()).toMatchObject({ active: session, hydrated: true });
  });

  it("hydrates to null when storage throws", async () => {
    const broken = { ...memoryStorage(), getItemAsync: async () => Promise.reject(new Error("keychain locked")) };
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    await hydrateActiveSession(broken);
    expect(useActiveSession.getState()).toMatchObject({ active: null, hydrated: true });
    warn.mockRestore();
  });

  it("keeps a session set while hydration was in flight", async () => {
    const storage = memoryStorage({ [ACTIVE_SESSION_KEY]: JSON.stringify({ ...session, sessionId: "old" }) });
    const pending = hydrateActiveSession(storage);
    useActiveSession.getState().setActive(session);
    await pending;
    expect(useActiveSession.getState().active?.sessionId).toBe("s-1");
  });
});

describe("setActive / clear", () => {
  it("persists on set and deletes on clear", async () => {
    const storage = memoryStorage();
    await hydrateActiveSession(storage);
    useActiveSession.getState().setActive(session);
    await flush();
    expect(parseStoredSession(storage.data[ACTIVE_SESSION_KEY] ?? null)).toEqual(session);
    useActiveSession.getState().clear();
    await flush();
    expect(storage.data[ACTIVE_SESSION_KEY]).toBeUndefined();
    expect(useActiveSession.getState().active).toBeNull();
  });

  it("stores a copy, not the caller's object", () => {
    const input = { ...session };
    useActiveSession.getState().setActive(input);
    expect(useActiveSession.getState().active).not.toBe(input);
    expect(useActiveSession.getState().active).toEqual(input);
  });
});
