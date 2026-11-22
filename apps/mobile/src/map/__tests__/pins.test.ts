import type { Pin } from "@knockd/shared";
import { pinsToGeoJSON } from "../geo/pins";

const pin = (clientId: string, memberId: string, label: string | null): Pin => ({
  clientId,
  memberId,
  lat: 42.955,
  lng: -81.34,
  label,
  createdAt: "2026-11-22T19:00:00Z",
});

describe("pinsToGeoJSON", () => {
  it("colours each pin by who dropped it, with its label (or none)", () => {
    const fc = pinsToGeoJSON({ p1: pin("p1", "a", "Meet here"), p2: pin("p2", "gone", null) }, { a: "#E4572E" });
    expect(fc.features.map((f) => f.properties)).toEqual([
      { clientId: "p1", colour: "#E4572E", label: "Meet here" },
      { clientId: "p2", colour: "#9AA3AD", label: "" },
    ]);
    expect(fc.features[0]!.geometry.coordinates).toEqual([-81.34, 42.955]);
  });
});
