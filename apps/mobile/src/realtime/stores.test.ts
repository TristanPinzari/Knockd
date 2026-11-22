import { beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "./stores/chatStore";
import { initialsOf, speedKmhBetween, useCrewStore } from "./stores/crewStore";
import { useLeadsStore } from "./stores/leadsStore";
import { usePinsStore } from "./stores/pinsStore";
import { useSessionStore } from "./stores/sessionStore";
import { lead, member, uuid } from "./testUtils";

const ME = uuid(1);
const SAM = uuid(2);

describe("crew store", () => {
  beforeEach(() => useCrewStore.getState().reset());

  it("initials and speed helpers", () => {
    expect(initialsOf("sam  jones kim")).toBe("SJ");
    expect(initialsOf("")).toBe("");
    const a = { lat: 42.955, lng: -81.3425, t: 0 };
    expect(speedKmhBetween(a, { ...a, lng: a.lng + 5 / 81_600, t: 5000 })).toBeCloseTo(3.6, 0);
    expect(speedKmhBetween(a, { ...a, t: 0 })).toBeNull();
    expect(speedKmhBetween(a, { ...a, t: 999_999 })).toBeNull();
  });

  it("seeds, tracks positions with speed and last seen, ignores stale and unknown", () => {
    const s = useCrewStore.getState();
    s.setMe(ME);
    s.seed([
      member(ME, "Me"),
      member(SAM, "Sam", { lastPosition: { lat: 42.955, lng: -81.3425, t: "1970-01-01T00:00:10.000Z" } }),
    ]);
    expect(useCrewStore.getState().members[SAM]?.position?.t).toBe(10_000);
    s.applyPositions([
      { memberId: SAM, lat: 42.955, lng: -81.3425 + 5 / 81_600, t: 15_000 },
      { memberId: SAM, lat: 42.955, lng: -81.3425, t: 5_000 }, // stale
      { memberId: uuid(77), lat: 0, lng: 0, t: 1 }, // unknown member
    ]);
    const sam = useCrewStore.getState().members[SAM]!;
    expect(sam.speedKmh).toBeCloseTo(3.6, 0);
    expect(sam.lastSeenMs).toBe(15_000);
    const same = useCrewStore.getState().members;
    s.applyPositions([{ memberId: SAM, lat: 1, lng: 1, t: 15_000 }]);
    expect(useCrewStore.getState().members).toBe(same);
  });

  it("re-seed keeps newer live positions; join/leave/status work", () => {
    const s = useCrewStore.getState();
    s.seed([member(SAM, "Sam")]);
    s.applyPositions([{ memberId: SAM, lat: 1, lng: 1, t: 50 }]);
    s.seed([member(SAM, "Sam", { lastPosition: { lat: 0, lng: 0, t: "1970-01-01T00:00:00.010Z" } })]);
    expect(useCrewStore.getState().members[SAM]?.position?.t).toBe(50);
    s.memberJoined(member(ME, "Me"));
    s.setOnline(ME, false, 100);
    expect(useCrewStore.getState().members[ME]?.online).toBe(false);
    s.setOnline(ME, true, 200);
    expect(useCrewStore.getState().members[ME]?.lastSeenMs).toBe(200);
    s.setOnline(uuid(88), true, 1);
    s.memberLeft(ME);
    expect(Object.keys(useCrewStore.getState().members)).toEqual([SAM]);
  });
});

describe("leads / pins / session stores", () => {
  it("leads upsert, remove, alert", () => {
    const s = useLeadsStore.getState();
    s.reset();
    s.seed([lead(uuid(10), SAM)]);
    s.upsert(lead(uuid(11), ME, "B"));
    s.remove(uuid(10));
    s.showAlert({ lead: lead(uuid(11), ME), memberName: "Me" });
    expect(Object.keys(useLeadsStore.getState().leads)).toEqual([uuid(11)]);
    s.dismissAlert();
    expect(useLeadsStore.getState().alert).toBeNull();
  });
  it("pins", () => {
    const s = usePinsStore.getState();
    const pin = {
      clientId: uuid(20),
      memberId: ME,
      lat: 1,
      lng: 2,
      label: null,
      createdAt: "2026-11-21T15:00:00.000Z",
    };
    s.seed([]);
    s.upsert(pin);
    expect(usePinsStore.getState().pins[pin.clientId]).toEqual(pin);
    s.remove(pin.clientId);
    s.upsert(pin);
    s.reset();
    expect(usePinsStore.getState().pins).toEqual({});
  });
  it("session", () => {
    const s = useSessionStore.getState();
    s.setConnection("online");
    s.setSynced(true);
    s.setSyncError("x");
    s.setStatus("ended");
    expect(useSessionStore.getState()).toMatchObject({
      connection: "online",
      synced: true,
      syncError: "x",
      status: "ended",
    });
    s.reset();
    expect(useSessionStore.getState()).toMatchObject({ connection: "connecting", synced: false, status: "live" });
  });
});

describe("chat store", () => {
  const msg = (n: number, memberId: string, at = n) => ({
    clientId: uuid(100 + n),
    memberId,
    body: `m${n}`,
    createdAt: new Date(at * 1000).toISOString(),
  });
  beforeEach(() => useChatStore.getState().reset());

  it("counts unread from others, not own messages or duplicates, and clears when opened", () => {
    const s = useChatStore.getState();
    s.receive(msg(1, SAM), ME);
    s.receive(msg(1, SAM), ME);
    s.receive(msg(2, ME), ME);
    expect(useChatStore.getState().unread).toBe(1);
    s.setChatOpen(true);
    s.receive(msg(3, SAM), ME);
    expect(useChatStore.getState().unread).toBe(0);
    s.setChatOpen(false);
    expect(useChatStore.getState().messages.map((m) => m.body)).toEqual(["m1", "m2", "m3"]);
  });

  it("first seed is read; later seeds count missed messages as unread and keep order", () => {
    const s = useChatStore.getState();
    s.seed([msg(2, SAM), msg(1, SAM)], ME);
    expect(useChatStore.getState().unread).toBe(0);
    s.seed([msg(1, SAM), msg(2, SAM), msg(3, SAM, 0)], ME);
    expect(useChatStore.getState().unread).toBe(1);
    expect(useChatStore.getState().messages.map((m) => m.body)).toEqual(["m3", "m1", "m2"]);
  });
});
