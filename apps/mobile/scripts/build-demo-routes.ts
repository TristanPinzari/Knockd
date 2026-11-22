/**
 * Builds the Live map demo (src/ui/liveMap/demoRoutes.json): real Byron houses and streets from
 * docs/suggest-viewer.html, with routes planned by the real Suggest for the four demo crew.
 *
 * Run from apps/mobile: ../server/node_modules/.bin/tsx scripts/build-demo-routes.ts
 * Rebuild after `pnpm rebuild:suggest-viewer` or a Suggest change.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { distanceM, suggestRoutes, type LatLng, type SuggestMode } from "@knockd/shared";
import { measure, project } from "../src/routes/polyline";

const here = dirname(fileURLToPath(import.meta.url));
const VIEWER = resolve(here, "../../../docs/suggest-viewer.html");
const OUT = resolve(here, "../src/ui/liveMap/demoRoutes.json");

const CENTRE: LatLng = { lat: 42.955, lng: -81.3425 };
/** Houses within this of the centre are planned. */
const SELECT_M = Number(process.env.SELECT_M ?? 130);
/** Houses within this are drawn (planned or not), for context around the plan. */
const DRAW_M = Number(process.env.DRAW_M ?? 320);
/** The car, before Suggest snaps it onto the nearest street (metres east/north of the centre). */
const CAR_M: [number, number] = [Number(process.env.CAR_X ?? -60), Number(process.env.CAR_Y ?? -150)];
const MODE = (process.env.MODE ?? "solo") as SuggestMode;
const CREW = ["m-jas", "m-sam", "m-ava", "m-leo"];

interface ViewerData {
  streets: { id: number; coordinates: [number, number][] }[];
  houses: {
    id: number;
    streetId: number | null;
    blockId: number | null;
    lat: number;
    lng: number;
    ring: [number, number][];
  }[];
}

function readViewerData(): ViewerData {
  const html = readFileSync(VIEWER, "utf8");
  const start = html.indexOf("const DATA = ");
  if (start < 0) throw new Error(`No DATA in ${VIEWER}`);
  const json = html.slice(start + "const DATA = ".length, html.indexOf("\n", start)).replace(/;\s*$/, "");
  return JSON.parse(json) as ViewerData;
}

const offset = ([x, y]: [number, number]): LatLng => ({
  lat: CENTRE.lat + y / 111_320,
  lng: CENTRE.lng + x / (111_320 * Math.cos((CENTRE.lat * Math.PI) / 180)),
});
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Deterministic random so the demo is the same on every rebuild. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
}

const data = readViewerData();
const selected = data.houses.filter((h) => distanceM(h, CENTRE) <= SELECT_M);
const result = suggestRoutes({
  streets: data.streets,
  houses: selected.map((h) => ({ id: h.id, lat: h.lat, lng: h.lng, streetId: h.streetId, blockId: h.blockId })),
  memberIds: CREW,
  start: offset(CAR_M),
  random: seeded(7),
});
const option = result.options.find((o) => o.mode === MODE) ?? result.options[0];
if (!option) throw new Error("Suggest returned no options");

const groups = option.groups.map((g) => {
  const route = [...g.route, ...g.toMeet.slice(1)].map((p) => ({ lat: round(p.lat), lng: round(p.lng) }));
  const line = measure(route);
  // Where the route passes each door, searching forward so U-turns keep their order.
  let fromM = 0;
  const knocks = g.knocks.map((k) => {
    const h = selected.find((x) => x.id === k.houseId)!;
    const alongM = Math.round(project(line, h, fromM)?.alongM ?? fromM);
    fromM = Math.max(0, alongM - 30);
    return { houseId: String(k.houseId), memberId: k.memberId, alongM };
  });
  return { memberIds: g.memberIds, route, knocks };
});

const houses = data.houses
  .filter((h) => distanceM(h, CENTRE) <= DRAW_M)
  .map((h) => ({ houseId: String(h.id), ring: h.ring.map(([x, y]) => [round(x), round(y)]) }));

writeFileSync(
  OUT,
  `${JSON.stringify({ start: result.start, mode: option.mode, label: option.label, togetherS: Math.round(option.togetherS), groups, houses })}\n`,
);
console.log(
  `${OUT}\n${option.label}: ${selected.length} doors, ${houses.length} houses drawn, together in ${Math.round(option.togetherS / 60)} min`,
);
for (const g of groups)
  console.log(`  ${g.memberIds.join("+")}: ${g.knocks.length} doors, ${g.route.length} route points`);
