/**
 * Plans walking routes for simulated-crew bots from the real map data.
 * For each block, a bot walks the street segments its houses face (each house is linked to its
 * nearest street), end to end, stopping at points (every ~12 m) with a house nearby, like a rep
 * going door to door. Walking streets rather than block outlines keeps bots on the road, including
 * cul-de-sac blocks whose outline is drawn around the houses.
 */
import { sql } from "drizzle-orm";
import { distanceM, type LatLng, type PlanContent, type SimPace } from "@knockd/shared";
import { db } from "../db/client";
import { HttpError } from "../http/errors";

export type House = {
  id: number;
  lat: number;
  lng: number;
};

export interface Stop extends LatLng {
  /** Seconds to stand here (0 = just walk past). */
  stopS: number;
  /** Houses within reach of this point, nearest first (lead candidates). */
  houseIds: number[];
}

const POINT_SPACING_M = 12;
/** House centres sit ~15–35 m from the street's centre line. */
const HOUSE_REACH_M = 40;
const MAX_BLOCKS = 80;

/** Seconds spent at a door, by pace. */
const STOP_RANGE: Record<SimPace, [number, number]> = { demo: [6, 14], realistic: [40, 90] };

type BlockRow = {
  id: number;
  lat: number;
  lng: number;
};

/** A street segment a block's houses face, as points every ~12 m. */
type StreetLine = LatLng[];

export async function planRoutes(
  sessionId: string,
  botIds: string[],
  pace: SimPace,
  plan: PlanContent | null,
): Promise<Map<string, Stop[]>> {
  // Blocks claimed for bots in the session plan, plus blocks in the planned area.
  const assigned = new Map<string, number[]>();
  for (const c of plan?.claims ?? [])
    if (botIds.includes(c.memberId)) assigned.set(c.memberId, [...(assigned.get(c.memberId) ?? []), c.blockId]);
  const assignedIds = [...assigned.values()].flat();

  const [centre] = await db.execute<{ lat: number; lng: number }>(sql`
    SELECT ST_Y(ST_Centroid(planned_area)) AS lat, ST_X(ST_Centroid(planned_area)) AS lng
    FROM sessions WHERE id = ${sessionId}`);
  const blocks = await db.execute<BlockRow>(sql`
    SELECT b.id, ST_Y(ST_Centroid(b.geom)) AS lat, ST_X(ST_Centroid(b.geom)) AS lng
    FROM blocks b, sessions s
    WHERE s.id = ${sessionId}
      AND (ST_Intersects(b.geom, s.planned_area)
           ${
             assignedIds.length
               ? sql`OR b.id IN (${sql.join(
                   assignedIds.map((id) => sql`${id}`),
                   sql`, `,
                 )})`
               : sql``
           })
    ORDER BY ST_Distance(ST_Centroid(b.geom), ST_Centroid(s.planned_area))
    LIMIT ${MAX_BLOCKS}`);
  if (!blocks.length) throw new HttpError(400, "invalid_request", "No houses in this session's area to simulate");

  const houses = await db.execute<House & { block_id: number }>(sql`
    SELECT id, block_id, ST_Y(centroid) AS lat, ST_X(centroid) AS lng
    FROM houses WHERE block_id IN (${sql.join(
      blocks.map((b) => sql`${b.id}`),
      sql`, `,
    )})`);
  const housesByBlock = new Map<number, House[]>();
  for (const h of houses) housesByBlock.set(h.block_id, [...(housesByBlock.get(h.block_id) ?? []), h]);

  const streetRows = await db.execute<{ block_id: number; line: { coordinates: [number, number][] } }>(sql`
    SELECT h.block_id,
           ST_AsGeoJSON(ST_Segmentize(s.geom::geography, ${POINT_SPACING_M})::geometry, 6)::json AS line
    FROM (SELECT DISTINCT block_id, street_id FROM houses
          WHERE street_id IS NOT NULL
            AND block_id IN (${sql.join(
              blocks.map((b) => sql`${b.id}`),
              sql`, `,
            )})) h
    JOIN streets s ON s.id = h.street_id`);
  const streetsByBlock = new Map<number, StreetLine[]>();
  for (const r of streetRows) {
    const line = r.line.coordinates.map(([lng, lat]) => ({ lat, lng }));
    streetsByBlock.set(r.block_id, [...(streetsByBlock.get(r.block_id) ?? []), line]);
  }

  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const free = blocks.filter((b) => !assignedIds.includes(b.id));
  const unassignedBots = botIds.filter((id) => !assigned.has(id));
  const wedges = splitIntoWedges(free, centre!, unassignedBots.length);

  const routes = new Map<string, Stop[]>();
  botIds.forEach((botId) => {
    const own = assigned
      .get(botId)
      ?.map((id) => blockById.get(id))
      .filter((b): b is BlockRow => !!b);
    const myBlocks = own?.length ? own : (wedges[unassignedBots.indexOf(botId)] ?? []);
    routes.set(botId, buildRoute(orderByNearest(myBlocks, centre!), streetsByBlock, housesByBlock, pace, centre!));
  });
  return routes;
}

/** Split blocks into `n` pie slices around the centre, so bots fan out in different directions. */
function splitIntoWedges(blocks: BlockRow[], centre: LatLng, n: number): BlockRow[][] {
  if (n === 0) return [];
  const byAngle = [...blocks].sort((a, b) => angle(a, centre) - angle(b, centre));
  const size = Math.ceil(byAngle.length / n);
  return Array.from({ length: n }, (_, i) => byAngle.slice(i * size, (i + 1) * size));
}

/** Greedy nearest-neighbour order, starting from the block closest to `start`. */
function orderByNearest(blocks: BlockRow[], start: LatLng): BlockRow[] {
  const left = [...blocks];
  const ordered: BlockRow[] = [];
  let here = start;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (distanceM(here, left[i]!) < distanceM(here, left[best]!)) best = i;
    const next = left.splice(best, 1)[0]!;
    ordered.push(next);
    here = next;
  }
  return ordered;
}

function buildRoute(
  blocks: BlockRow[],
  streetsByBlock: Map<number, StreetLine[]>,
  housesByBlock: Map<number, House[]>,
  pace: SimPace,
  start: LatLng,
): Stop[] {
  const [minStop, maxStop] = STOP_RANGE[pace];
  const route: Stop[] = [];
  let here = start;
  for (const block of blocks) {
    const blockHouses = housesByBlock.get(block.id) ?? [];
    const left = [...(streetsByBlock.get(block.id) ?? [])].filter((l) => l.length);
    while (left.length) {
      // Next: the street with an end closest to where the bot is, walked from that end.
      let best = 0;
      let bestD = Infinity;
      let reverse = false;
      left.forEach((line, i) => {
        const dStart = distanceM(here, line[0]!);
        const dEnd = distanceM(here, line[line.length - 1]!);
        if (Math.min(dStart, dEnd) < bestD) {
          bestD = Math.min(dStart, dEnd);
          best = i;
          reverse = dEnd < dStart;
        }
      });
      const line = left.splice(best, 1)[0]!;
      const points = reverse ? [...line].reverse() : line;
      for (const point of points) {
        const near = blockHouses
          .map((h) => ({ id: h.id, d: distanceM(point, h) }))
          .filter((h) => h.d <= HOUSE_REACH_M)
          .sort((a, b) => a.d - b.d);
        const stopS = near.length ? minStop + Math.random() * (maxStop - minStop) : 0;
        route.push({ ...point, stopS, houseIds: near.map((h) => h.id) });
      }
      here = points[points.length - 1]!;
    }
  }
  return route;
}

const angle = (p: LatLng, c: LatLng) => Math.atan2(p.lat - c.lat, p.lng - c.lng);
