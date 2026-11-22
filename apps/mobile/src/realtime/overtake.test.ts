import { beforeEach, describe, expect, it } from "vitest";
import { computeLeaderboard } from "./leaderboard";
import { createOvertakeDetector, startOvertakeWatcher } from "./overtake";
import { useCrewStore, memberFromApi } from "./stores/crewStore";
import { useLeadsStore } from "./stores/leadsStore";
import { useOvertakeStore } from "./stores/overtakeStore";
import { useSessionStore } from "./stores/sessionStore";
import { lead, member, uuid } from "./testUtils";

const ME = uuid(1);
const SAM = uuid(2);
const AMY = uuid(3);
const crew = [memberFromApi(member(ME, "Me")), memberFromApi(member(SAM, "Sam")), memberFromApi(member(AMY, "Amy"))];
const rows = (leads: ReturnType<typeof lead>[]) => computeLeaderboard(crew, leads, ME);

describe("computeLeaderboard", () => {
  it("ranks by total, then A, then B, with shared ranks for ties", () => {
    const r = computeLeaderboard(
      crew,
      [lead(uuid(10), SAM, "A"), lead(uuid(11), SAM, "B"), lead(uuid(12), ME, "A"), lead(uuid(13), ME, "B")],
      ME,
    );
    expect(r.map((x) => [x.name, x.rank, x.total])).toEqual([
      ["Me", 1, 2],
      ["Sam", 1, 2],
      ["Amy", 3, 0],
    ]);
    expect(r[0]?.isMe).toBe(true);
    expect(r[0]?.counts).toEqual({ A: 1, B: 1, C: 0 });
  });
  it("more A leads breaks a tie on total", () => {
    const r = computeLeaderboard(crew, [lead(uuid(10), SAM, "A"), lead(uuid(11), ME, "C")], ME);
    expect(r.map((x) => x.name)).toEqual(["Sam", "Me", "Amy"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
  });
});

describe("overtake detector", () => {
  it("seeds a baseline without events, then reports a teammate who passes me", () => {
    const d = createOvertakeDetector(ME);
    expect(d.update(rows([lead(uuid(10), ME)]), 1)).toEqual([]);
    expect(d.update(rows([lead(uuid(10), ME), lead(uuid(11), SAM)]), 2)).toEqual([]); // tie is not a pass
    const events = d.update(rows([lead(uuid(10), ME), lead(uuid(11), SAM), lead(uuid(12), SAM)]), 3);
    expect(events).toEqual([{ memberId: SAM, name: "Sam", theirLeads: 2, myLeads: 1, at: 3 }]);
    expect(d.update(rows([lead(uuid(10), ME), lead(uuid(11), SAM), lead(uuid(12), SAM)]), 4)).toEqual([]); // already ahead
  });
  it("does not fire when I pass them or when I am absent", () => {
    const d = createOvertakeDetector(ME);
    d.update(rows([lead(uuid(11), SAM)]), 1);
    expect(d.update(rows([lead(uuid(11), SAM), lead(uuid(12), ME), lead(uuid(13), ME)]), 2)).toEqual([]);
    expect(d.update([], 3)).toEqual([]);
    d.reset();
    expect(d.update(rows([]), 4)).toEqual([]);
  });
});

describe("overtake watcher", () => {
  beforeEach(() => {
    useCrewStore.getState().reset();
    useLeadsStore.getState().reset();
    useOvertakeStore.getState().reset();
    useSessionStore.getState().reset();
  });
  it("waits for sync, then raises the banner when a teammate passes me", () => {
    const stop = startOvertakeWatcher(() => 42);
    useCrewStore.getState().setMe(ME);
    useCrewStore.getState().seed([member(ME, "Me"), member(SAM, "Sam")]);
    useLeadsStore.getState().seed([lead(uuid(10), ME)]);
    expect(useOvertakeStore.getState().latest).toBeNull();
    useSessionStore.getState().setSynced(true); // baseline: me 1, Sam 0
    useLeadsStore.getState().upsert(lead(uuid(11), SAM));
    useLeadsStore.getState().upsert(lead(uuid(12), SAM));
    expect(useOvertakeStore.getState().latest).toMatchObject({ memberId: SAM, name: "Sam", at: 42 });
    useOvertakeStore.getState().dismiss();
    expect(useOvertakeStore.getState().latest).toBeNull();
    stop();
    useLeadsStore.getState().upsert(lead(uuid(13), SAM));
    expect(useOvertakeStore.getState().latest).toBeNull();
  });
});
