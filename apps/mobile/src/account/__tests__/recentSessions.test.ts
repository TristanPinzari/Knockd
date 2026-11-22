import { sessionsToAdd, sessionWhen } from "../RecentSessions";

const s = (id: string, startedAt: string, status: "live" | "ended" | "processed", uploadedTo: string[] = []) => ({
  id,
  startedAt,
  endedAt: null,
  status,
  uploadedTo,
});

describe("sessionsToAdd", () => {
  it("lists ended sessions not yet on every team, newest first, at most 3", () => {
    const list = sessionsToAdd(
      [
        s("live", "2026-11-22T20:00:00Z", "live"),
        s("done", "2026-11-21T20:00:00Z", "processed", ["t1", "t2"]),
        s("half", "2026-11-20T20:00:00Z", "processed", ["t1"]),
        s("a", "2026-11-19T20:00:00Z", "ended"),
        s("b", "2026-11-18T20:00:00Z", "processed"),
        s("c", "2026-11-17T20:00:00Z", "processed"),
      ],
      ["t1", "t2"],
    );
    expect(list.map((x) => x.id)).toEqual(["half", "a", "b"]);
  });
});

describe("sessionWhen", () => {
  it("shows the day and time", () => {
    expect(sessionWhen(new Date(2026, 10, 21, 17, 5).toISOString())).toBe("Sat 5:05 pm");
  });
});
