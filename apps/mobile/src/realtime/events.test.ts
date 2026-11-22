import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTrailsStore } from "../trails/trailsStore";
import { bindSocket, type SocketLike } from "./socketBinding";
import { createStoreHandlers } from "./storeHandlers";
import { useChatStore } from "./stores/chatStore";
import { useCrewStore } from "./stores/crewStore";
import { useLeadsStore } from "./stores/leadsStore";
import { usePinsStore } from "./stores/pinsStore";
import { usePlanStore } from "./stores/planStore";
import { useSessionStore } from "./stores/sessionStore";
import { lead, member, uuid } from "./testUtils";

const ME = uuid(1);
const SAM = uuid(2);

function fakeSocket() {
  const handlers = new Map<string, (...a: never[]) => void>();
  const socket: SocketLike = {
    on: ((event: string, h: (...a: never[]) => void) => void handlers.set(event, h)) as SocketLike["on"],
    disconnect: vi.fn(),
  };
  return {
    socket,
    emit: (e: string, ...a: unknown[]) => (handlers.get(e) as (...x: unknown[]) => void)(...a),
    handlers,
  };
}

beforeEach(() => {
  useCrewStore.getState().reset();
  useTrailsStore.getState().reset();
  useLeadsStore.getState().reset();
  usePinsStore.getState().reset();
  usePlanStore.getState().reset();
  useChatStore.getState().reset();
  useSessionStore.getState().reset();
  useCrewStore.getState().setMe(ME);
  useCrewStore.getState().seed([member(ME, "Me"), member(SAM, "Sam")]);
});

describe("socket handlers -> stores", () => {
  const h = createStoreHandlers(() => 777);

  it("positions update the dot, speed and the trail", () => {
    h.positions({
      positions: [
        { memberId: SAM, lat: 42.955, lng: -81.3425, t: "2026-11-21T15:00:00.000Z" },
        { memberId: SAM, lat: 42.955, lng: -81.3425 + 5 / 81_600, t: "2026-11-21T15:00:05.000Z" },
      ],
    });
    expect(useCrewStore.getState().members[SAM]?.speedKmh).toBeGreaterThan(0);
    expect(useTrailsStore.getState().pointsByMember[SAM]).toHaveLength(2);
    h.positions({ positions: [] });
    h.positions({ positions: "junk" } as never);
    expect(useTrailsStore.getState().pointsByMember[SAM]).toHaveLength(2);
  });

  it("member events", () => {
    h["member:joined"]({ member: member(uuid(3), "Amy") });
    h["member:status"]({ memberId: SAM, online: false });
    expect(useCrewStore.getState().members[uuid(3)]).toBeDefined();
    expect(useCrewStore.getState().members[SAM]?.online).toBe(false);
    h["member:left"]({ memberId: uuid(3) });
    expect(useCrewStore.getState().members[uuid(3)]).toBeUndefined();
    h["member:joined"]({ member: { nope: 1 } } as never);
  });

  it("lead events alert only for teammates' new leads", () => {
    h["lead:new"]({ lead: lead(uuid(10), SAM), memberName: "Sam" });
    expect(useLeadsStore.getState().alert?.memberName).toBe("Sam");
    useLeadsStore.getState().dismissAlert();
    h["lead:new"]({ lead: lead(uuid(10), SAM), memberName: "Sam" }); // duplicate
    h["lead:new"]({ lead: lead(uuid(11), ME), memberName: "Me" }); // mine
    expect(useLeadsStore.getState().alert).toBeNull();
    h["lead:updated"]({ lead: lead(uuid(10), SAM, "C") });
    expect(useLeadsStore.getState().leads[uuid(10)]?.grade).toBe("C");
    h["lead:removed"]({ clientId: uuid(10) });
    expect(useLeadsStore.getState().leads[uuid(10)]).toBeUndefined();
    h["lead:new"]({ lead: { bad: true }, memberName: "x" } as never);
    h["lead:updated"]({ lead: { bad: true } } as never);
  });

  it("pins, messages, plan and session status", () => {
    const pin = {
      clientId: uuid(20),
      memberId: SAM,
      lat: 1,
      lng: 2,
      label: null,
      createdAt: "2026-11-21T15:00:00.000Z",
    };
    h["pin:new"]({ pin });
    expect(usePinsStore.getState().pins[pin.clientId]).toBeDefined();
    h["pin:removed"]({ clientId: pin.clientId });
    h["pin:new"]({ pin: {} } as never);
    h["message:new"]({
      message: { clientId: uuid(30), memberId: SAM, body: "yo", createdAt: "2026-11-21T15:00:00.000Z" },
    });
    expect(useChatStore.getState().unread).toBe(1);
    h["message:new"]({ message: {} } as never);
    const updated = { claims: [], drawings: [], notes: [] };
    h["plan:updated"]({ plan: updated, version: 1, editedBy: SAM });
    expect(usePlanStore.getState()).toMatchObject({ plan: updated, editedBy: SAM });
    h["plan:updated"]({ plan: 1, version: 2, editedBy: "x" } as never); // malformed: ignored
    h["plan:updated"]({ plan: updated, editedBy: "x" } as never); // no version: ignored
    expect(usePlanStore.getState().plan).toEqual(updated);
    h["session:ended"]();
    expect(useSessionStore.getState().status).toBe("ended");
    h["session:processed"]();
    expect(useSessionStore.getState().status).toBe("processed");
  });
});

describe("bindSocket", () => {
  it("registers every server event and flags reconnects", () => {
    const { socket, emit, handlers } = fakeSocket();
    const conn = { onConnect: vi.fn(), onDisconnect: vi.fn(), onConnectError: vi.fn() };
    bindSocket(socket, createStoreHandlers(), conn);
    for (const e of [
      "member:joined",
      "positions",
      "lead:new",
      "message:new",
      "plan:updated",
      "session:processed",
      "connect",
      "disconnect",
      "connect_error",
    ]) {
      expect(handlers.has(e)).toBe(true);
    }
    emit("connect");
    emit("disconnect", "transport close");
    emit("connect_error", new Error("x"));
    emit("connect");
    expect(conn.onConnect.mock.calls).toEqual([[false], [true]]);
    expect(conn.onDisconnect).toHaveBeenCalledWith("transport close");
    expect(conn.onConnectError).toHaveBeenCalled();
  });
});
