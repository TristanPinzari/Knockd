import { toMapMembers } from "../liveMapData";
import type { LiveCrewMember } from "../types";

const member = (id: string, position: LiveCrewMember["position"]): LiveCrewMember => ({
  id,
  name: id,
  colour: "#E4572E",
  initials: id.slice(0, 1).toUpperCase(),
  position,
  speedKmh: null,
});

describe("toMapMembers", () => {
  const myFix = { lat: 42.96, lng: -81.34 };

  test("draws me from my own GPS when the server hasn't sent my position", () => {
    const crew = { me: member("me", null), sam: member("sam", { lat: 42.95, lng: -81.33 }) };
    const pins = toMapMembers(crew, "me", myFix);
    expect(pins.find((p) => p.memberId === "me")).toMatchObject({ isMe: true, lat: 42.96, lng: -81.34 });
    expect(pins).toHaveLength(2);
  });

  test("prefers my own GPS over the server's copy of my position", () => {
    const crew = { me: member("me", { lat: 1, lng: 1 }) };
    expect(toMapMembers(crew, "me", myFix)[0]).toMatchObject({ lat: 42.96, lng: -81.34 });
  });

  test("leaves teammates on their server positions and skips anyone without one", () => {
    const crew = { sam: member("sam", { lat: 42.95, lng: -81.33 }), al: member("al", null) };
    expect(toMapMembers(crew, "me", myFix)).toEqual([
      expect.objectContaining({ memberId: "sam", lat: 42.95, isMe: false }),
    ]);
  });
});
