import { describe, expect, it } from "vitest";
import { classifyTrail, trailToGeoJSON, type TrailPoint } from "./trail";

/** A straight walk east from Byron at `speed` m/s, one point every `everyS` seconds. */
function walk(speed: number, seconds: number, everyS = 5, start: TrailPoint = { t: 0, lat: 42.955, lng: -81.3425 }) {
  const metresPerDegLng = 111_320 * Math.cos((start.lat * Math.PI) / 180);
  const points: TrailPoint[] = [];
  for (let s = 0; s <= seconds; s += everyS)
    points.push({ t: start.t + s * 1000, lat: start.lat, lng: start.lng + (speed * s) / metresPerDegLng });
  return points;
}

describe("classifyTrail", () => {
  it("door to door (0.4 m/s) is knocking", () => {
    expect(new Set(classifyTrail(walk(0.4, 300)))).toEqual(new Set(["knocking"]));
  });

  it("walking past (1.4 m/s) is walking", () => {
    expect(new Set(classifyTrail(walk(1.4, 300)))).toEqual(new Set(["walking"]));
  });

  it("driving (12 m/s) is driving", () => {
    expect(new Set(classifyTrail(walk(12, 120, 2)))).toEqual(new Set(["driving"]));
  });

  it("stop-start knocking (walk a few seconds, stand at the door) stays knocking", () => {
    const points: TrailPoint[] = [];
    let t = 0;
    let lng = -81.3425;
    for (let door = 0; door < 10; door++) {
      for (let s = 0; s < 10; s += 5) points.push({ t: (t += 5000), lat: 42.955, lng }); // at the door
      lng += 12 / 81_600; // walk 12 m to the next door
      points.push({ t: (t += 9000), lat: 42.955, lng });
    }
    const modes = classifyTrail(points);
    expect(modes.filter((m) => m === "knocking").length / modes.length).toBeGreaterThan(0.9);
  });

  it("a long gap breaks the trail", () => {
    const first = walk(0.4, 60);
    const later = walk(0.4, 60, 5, { t: 10 * 60_000, lat: 42.956, lng: -81.3425 });
    const modes = classifyTrail([...first, ...later]);
    expect(modes[first.length - 1]).toBeNull();
  });
});

describe("trailToGeoJSON", () => {
  it("splits the trail into one line per mode", () => {
    const knocking = walk(0.4, 300);
    const last = knocking[knocking.length - 1]!;
    const driving = walk(12, 120, 2, { ...last, t: last.t + 2000 }).slice(1);
    const fc = trailToGeoJSON("m1", [...knocking, ...driving]);
    const modes = fc.features.map((f) => f.properties?.mode);
    expect(fc.features[0]!.properties).toMatchObject({ memberId: "m1", mode: "knocking" });
    expect(modes.at(-1)).toBe("driving");
    // Each feature is a separate run: no two neighbours share a mode.
    modes.slice(1).forEach((m, i) => expect(m).not.toBe(modes[i]));
  });
});
