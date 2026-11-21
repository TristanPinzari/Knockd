/**
 * Suggest: plans walking routes for the crew over a set of selected houses, for each way of
 * splitting the crew (solo, pairs, half, all together), and ranks the options.
 *
 * Runs on the phone (pure function, no server), using data the app already has from /area.
 *
 * How it plans one option:
 *  1. Street network: street segments (split at every intersection) form a graph. Each selected
 *     house marks its street as one that must be walked, but only as far as the selected doors go:
 *     a street can be walked end to end, or entered from one end, out to the last door and back
 *     (dead ends, and streets the selection only clips).
 *  2. Pizza slices: streets are ordered by angle around the car and cut into one slice per group,
 *     balanced by estimated time (walking + doors ÷ group size). Several starting angles are
 *     tried, so a car at the edge of the area fans out instead of splitting badly.
 *  3. Routes: each group leaves the car and takes its streets nearest first, then the order and
 *     directions are improved (2-opt and moving single streets) to cut wasted walking.
 *  4. Regroup: the meeting point is the regroup pin if there is one, otherwise the intersection
 *     that gets everyone together soonest. Routes are then re-optimised to end near it.
 *  5. Score: when everyone's back together = max over groups of (finish + walk to the meeting point).
 *
 * Timing: walking ~1.3 m/s plus a fixed time per door. A group walks together and shares the
 * doors: walking isn't shared, knocking is. Crossing the road costs time (~15 s), so a group works
 * one person per side, and a solo on a street with houses on both sides goes down one side and
 * back up the other (unless zigzagging is cheaper, e.g. very few doors).
 * Each group also gets its knock order: who knocks which door, in order.
 */
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { LatLng } from "./common";
import type { PlanContent } from "./entities";
import type { PlanEditOp } from "./socket";
import { distanceM } from "./trail";

export const DEFAULT_SECONDS_PER_DOOR = 60;
export const DEFAULT_SECONDS_PER_CROSSING = 15;
export const WALK_SPEED_MS = 1.3;
/** When two points aren't connected by streets we know about, assume this detour on the straight line. */
const FALLBACK_DETOUR = 1.5;
/** Drawings are capped at 500 points (see Drawing in entities.ts). */
const MAX_ROUTE_POINTS = 500;
/** Houses this close to the end of a dead end (in practice: past it) are "around the turning circle". */
const DEAD_END_CAP_M = 2;
/** How many starting angles to try per option on large selections. */
const MAX_SWEEP_VARIANTS = 12;

// ============================== Public types ==============================

export type SuggestMode = "solo" | "pairs" | "half" | "together";

/** A street segment from /area: properties.streetId and geometry.coordinates ([lng, lat]). */
export interface SuggestStreet {
  id: number;
  coordinates: [number, number][];
}

/** A selected house from /area: properties.houseId, streetId, blockId, plus its centre. */
export interface SuggestHouse extends LatLng {
  id: number;
  streetId: number | null;
  blockId: number | null;
}

export interface SuggestInput {
  /** All streets the phone has loaded (not just selected ones): routes can walk any of them. */
  streets: SuggestStreet[];
  /** The selected houses (they must all be visited). */
  houses: SuggestHouse[];
  /** Everyone in the session who's knocking. */
  memberIds: string[];
  /** Where the crew starts (the car / the organiser's position). */
  start: LatLng;
  /** Optional regroup pin. Without one, the best meeting point is chosen. */
  regroup?: LatLng | null;
  secondsPerDoor?: number;
  /** Crossing the road (default 15 s), which is why a solo does one side, then the other. */
  secondsPerCrossing?: number;
  walkSpeedMs?: number;
  /** For shuffling who's in which group (default Math.random). Groups are easy to swap in the UI. */
  random?: () => number;
}

/** One door for one person. */
export interface SuggestKnock {
  houseId: number;
  memberId: string;
}

export interface SuggestGroup {
  memberIds: string[];
  houseIds: number[];
  /**
   * Every door, in the order the group gets to it, with who knocks it. Filter by memberId for one
   * person's own order (their 1st, 2nd, 3rd… door).
   */
  knocks: SuggestKnock[];
  /** Blocks of the group's houses, for claims. */
  blockIds: number[];
  /** The streets the group knocks, in walking order. */
  streetIds: number[];
  doors: number;
  /** From the car, along streets, to where the group finishes. */
  route: LatLng[];
  walkM: number;
  /** Seconds until the group has knocked every door. */
  finishS: number;
  /** Where the group knocks its last door. */
  end: LatLng;
  /** The walk from `end` to the meeting point, along streets (just [end] if they finish there). */
  toMeet: LatLng[];
}

export interface SuggestOption {
  mode: SuggestMode;
  /** e.g. "Solo", "Pairs", "Pairs + 1 solo", "2 groups of 4", "All together" */
  label: string;
  groups: SuggestGroup[];
  /** Seconds until the last group finishes knocking. */
  finishS: number;
  /** Seconds until everyone has finished and walked to the meeting point. The ranking score. */
  togetherS: number;
  meetPoint: LatLng;
}

export interface SuggestResult {
  /** Best first. */
  options: SuggestOption[];
  /** Selected houses that couldn't be routed (no known street). */
  unroutedHouseIds: number[];
  /** The car, snapped onto the nearest street (where every route starts). */
  start: LatLng;
  /** The regroup pin, snapped onto the nearest street, or null. */
  regroup: LatLng | null;
}

// ============================== Input from /area ==============================

/**
 * Streets and selected houses from GET /v1/sessions/:id/area cells, ready for suggestRoutes.
 * Dedupes streets that appear in several cells. A house's position is the centre of its outline.
 */
export function suggestInputFromArea(
  cells: { streets: FeatureCollection; houses: FeatureCollection }[],
  selectedHouseIds: ReadonlySet<number>,
): Pick<SuggestInput, "streets" | "houses"> {
  const streets = new Map<number, SuggestStreet>();
  const houses = new Map<number, SuggestHouse>();
  const prop = (f: Feature, key: string) => {
    const v = f.properties?.[key];
    return typeof v === "number" ? v : null;
  };
  for (const cell of cells) {
    for (const f of cell.streets.features) {
      const id = prop(f, "streetId");
      if (id !== null && f.geometry.type === "LineString")
        streets.set(id, { id, coordinates: f.geometry.coordinates as [number, number][] });
    }
    for (const f of cell.houses.features) {
      const id = prop(f, "houseId");
      if (id === null || !selectedHouseIds.has(id) || houses.has(id)) continue;
      const centre = centreOf(f.geometry);
      if (centre) houses.set(id, { id, streetId: prop(f, "streetId"), blockId: prop(f, "blockId"), ...centre });
    }
  }
  return { streets: [...streets.values()], houses: [...houses.values()] };
}

function centreOf(g: Geometry): LatLng | null {
  const ring = g.type === "Polygon" ? g.coordinates[0] : g.type === "Point" ? [g.coordinates] : null;
  if (!ring?.length) return null;
  const pts = ring.length > 1 ? ring.slice(0, -1) : ring; // outer ring repeats its first point
  return {
    lng: pts.reduce((s, p) => s + p[0]!, 0) / pts.length,
    lat: pts.reduce((s, p) => s + p[1]!, 0) / pts.length,
  };
}

// ============================== Street graph ==============================

interface GNode extends LatLng {
  x: number;
  y: number;
}
interface GEdge {
  street: number;
  a: number;
  b: number;
  len: number;
  coords: LatLng[];
}
interface Row {
  dist: Float64Array;
  prevNode: Int32Array;
  prevEdge: Int32Array;
}

class Graph {
  nodes: GNode[] = [];
  edges: GEdge[] = [];
  adj: { to: number; edge: number; w: number }[][] = [];
  edgeOfStreet = new Map<number, number>();
  private index = new Map<string, number>();
  private rows = new Map<number, Row>();
  private readonly cosLat: number;

  constructor(private readonly origin: LatLng) {
    this.cosLat = Math.cos((origin.lat * Math.PI) / 180);
  }

  /** Metres east/north of the origin. */
  project(p: LatLng) {
    return { x: (p.lng - this.origin.lng) * 111_320 * this.cosLat, y: (p.lat - this.origin.lat) * 111_320 };
  }

  private node(lng: number, lat: number): number {
    const key = `${lng.toFixed(6)},${lat.toFixed(6)}`;
    let i = this.index.get(key);
    if (i === undefined) {
      i = this.nodes.length;
      this.nodes.push({ lat, lng, ...this.project({ lat, lng }) });
      this.adj.push([]);
      this.index.set(key, i);
    }
    return i;
  }

  addStreet(s: SuggestStreet) {
    if (this.edgeOfStreet.has(s.id) || s.coordinates.length < 2) return;
    const coords = s.coordinates.map(([lng, lat]) => ({ lat, lng }));
    const first = s.coordinates[0]!;
    const last = s.coordinates[s.coordinates.length - 1]!;
    const a = this.node(first[0], first[1]);
    const b = this.node(last[0], last[1]);
    const e = this.edges.length;
    const len = lengthM(coords);
    this.edges.push({ street: s.id, a, b, len, coords });
    this.edgeOfStreet.set(s.id, e);
    this.adj[a]!.push({ to: b, edge: e, w: len });
    if (a !== b) this.adj[b]!.push({ to: a, edge: e, w: len });
  }

  /**
   * Snaps points (the car, the regroup pin) onto the nearest street, anywhere along it, and adds
   * them to the network so walking starts and ends exactly there. Call before any routing.
   */
  snap(points: LatLng[]): { node: number; at: LatLng }[] {
    const streets = this.edges.length;
    const hits = points.map((p) => {
      let best = { dist: Infinity, e: -1, along: 0 };
      for (let e = 0; e < streets; e++) {
        const { along, dist } = placeOnLine(this.edges[e]!.coords, p);
        if (dist < best.dist) best = { dist, e, along };
      }
      return best;
    });
    const out = points.map((at) => ({ node: -1, at }));
    // Points on the same street are chained along it (a → first → second → … → b).
    const byEdge = new Map<number, number[]>();
    hits.forEach((h, i) => h.e >= 0 && byEdge.set(h.e, [...(byEdge.get(h.e) ?? []), i]));
    for (const [e, idxs] of byEdge) {
      const edge = this.edges[e]!;
      let prev = edge.a;
      let prevAlong = 0;
      for (const i of [...idxs].sort((p, q) => hits[p]!.along - hits[q]!.along)) {
        const along = hits[i]!.along;
        if (along < 1) out[i] = { node: edge.a, at: this.nodes[edge.a]! };
        else if (edge.len - along < 1) out[i] = { node: edge.b, at: this.nodes[edge.b]! };
        else if (prev !== edge.a && along - prevAlong < 1) out[i] = { node: prev, at: this.nodes[prev]! };
        else {
          const piece = subLine(edge.coords, prevAlong, along);
          const at = piece[piece.length - 1]!;
          const node = this.node(at.lng, at.lat);
          this.connect(prev, node, piece);
          [prev, prevAlong] = [node, along];
          out[i] = { node, at };
        }
      }
      if (prev !== edge.a) this.connect(prev, edge.b, subLine(edge.coords, prevAlong, edge.len));
    }
    return out.map(({ node, at }) => ({ node, at: { lat: at.lat, lng: at.lng } }));
  }

  /** A walkable piece of street that isn't a street of its own (from snapping). */
  private connect(u: number, v: number, coords: LatLng[]) {
    const e = this.edges.length;
    const len = lengthM(coords);
    this.edges.push({ street: -1, a: u, b: v, len, coords });
    this.adj[u]!.push({ to: v, edge: e, w: len });
    this.adj[v]!.push({ to: u, edge: e, w: len });
  }

  /** Shortest-path distances from `src` to every node (memoised). */
  row(src: number): Row {
    let r = this.rows.get(src);
    if (r) return r;
    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prevNode = new Int32Array(n).fill(-1);
    const prevEdge = new Int32Array(n).fill(-1);
    dist[src] = 0;
    const heap = new MinHeap();
    heap.push(0, src);
    while (heap.size) {
      const [d, u] = heap.pop();
      if (d > dist[u]!) continue;
      for (const { to, edge, w } of this.adj[u]!) {
        const nd = d + w;
        if (nd < dist[to]!) {
          dist[to] = nd;
          prevNode[to] = u;
          prevEdge[to] = edge;
          heap.push(nd, to);
        }
      }
    }
    r = { dist, prevNode, prevEdge };
    this.rows.set(src, r);
    return r;
  }

  /** Walking distance between nodes (straight line × detour if they aren't connected). */
  dist(u: number, v: number): number {
    if (u === v) return 0;
    const d = this.row(u).dist[v]!;
    return Number.isFinite(d) ? d : distanceM(this.nodes[u]!, this.nodes[v]!) * FALLBACK_DETOUR;
  }

  /** Points along the streets from u to v (excluding u's own point). */
  path(u: number, v: number): LatLng[] {
    if (u === v) return [];
    const { prevNode, prevEdge } = this.row(u);
    if (prevNode[v] === -1) return [this.nodes[v]!]; // not connected: straight across
    const legs: { edge: number; from: number }[] = [];
    for (let cur = v; cur !== u; cur = prevNode[cur]!) legs.push({ edge: prevEdge[cur]!, from: prevNode[cur]! });
    const out: LatLng[] = [];
    for (const leg of legs.reverse()) out.push(...this.walkEdge(leg.edge, leg.from).slice(1));
    return out;
  }

  /** An edge's points, walked starting from node `from`. */
  walkEdge(edge: number, from: number): LatLng[] {
    const e = this.edges[edge]!;
    return e.a === from ? e.coords : [...e.coords].reverse();
  }
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(key);
    vals.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }
  pop(): [number, number] {
    const { keys, vals } = this;
    const top: [number, number] = [keys[0]!, vals[0]!];
    const lastK = keys.pop()!;
    const lastV = vals.pop()!;
    if (keys.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= keys.length) break;
        const r = l + 1;
        const c = r < keys.length && keys[r]! < keys[l]! ? r : l;
        if (keys[c]! >= lastK) break;
        keys[i] = keys[c]!;
        vals[i] = vals[c]!;
        i = c;
      }
      keys[i] = lastK;
      vals[i] = lastV;
    }
    return top;
  }
}

// ============================== Line helpers ==============================

function lengthM(coords: LatLng[]): number {
  let len = 0;
  for (let i = 1; i < coords.length; i++) len += distanceM(coords[i - 1]!, coords[i]!);
  return len;
}

/**
 * How far along the line (metres from its first point) the point closest to `p` is, and which
 * side of the line `p` is on (0 = left, 1 = right, looking from the first point).
 */
function placeOnLine(coords: LatLng[], p: LatLng): { along: number; side: 0 | 1; dist: number } {
  let best = Infinity;
  let bestAlong = 0;
  let side: 0 | 1 = 0;
  let walked = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const seg = distanceM(a, b);
    const k = Math.cos((a.lat * Math.PI) / 180);
    const bx = (b.lng - a.lng) * k;
    const by = b.lat - a.lat;
    const px = (p.lng - a.lng) * k;
    const py = p.lat - a.lat;
    const t = bx || by ? Math.max(0, Math.min(1, (px * bx + py * by) / (bx * bx + by * by))) : 0;
    const d = Math.hypot(px - t * bx, py - t * by);
    if (d < best) {
      [best, bestAlong] = [d, walked + t * seg];
      side = bx * py - by * px > 0 ? 0 : 1;
    }
    walked += seg;
  }
  return { along: bestAlong, side, dist: best * 111_320 };
}

/** The piece of a line between `from` and `to` metres along it. */
function subLine(coords: LatLng[], from: number, to: number): LatLng[] {
  const head = cutAt(coords, to);
  return cutAt([...head].reverse(), Math.max(0, lengthM(head) - from)).reverse();
}

/** The line from its first point to `m` metres along it. */
function cutAt(coords: LatLng[], m: number): LatLng[] {
  const out: LatLng[] = [coords[0]!];
  let left = m;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const d = distanceM(a, b);
    if (d >= left) {
      const f = d > 0 ? left / d : 0;
      out.push({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });
      return out;
    }
    out.push(b);
    left -= d;
  }
  return out;
}

// ============================== Routing one group ==============================

/**
 * A street to knock, and how it's walked:
 *  0: a → b end to end, 1: b → a end to end,
 *  2: from a out to the furthest selected door and back to a, 3: the same from b.
 */
interface Step {
  e: number;
  k: 0 | 1 | 2 | 3;
}
const WAYS = [0, 1, 2, 3] as const;

/** A selected door on a street: metres from the street's `a` end, and which side it's on. */
interface Door {
  house: SuggestHouse;
  along: number;
  side: 0 | 1;
}
/** A street's selected doors (sorted by `along`), where they start and end, and how often they swap sides. */
interface Span {
  from: number;
  to: number;
  doors: Door[];
  twoSided: boolean;
  /** Road crossings if one person zigzags to every door in order. */
  switches: number;
}

/**
 * Routes one group. Groups of 2+ walk a street once, one person per side. A solo can't be on both
 * sides at once: a two-sided street is either zigzagged (a road crossing per side switch) or done
 * as down one side and back up the other (one crossing). `crossM` is a crossing's cost in metres.
 */
class Router {
  constructor(
    private readonly g: Graph,
    private readonly spans: Map<number, Span>,
    private readonly startNode: number,
    private readonly solo: boolean,
    private readonly crossM: number,
  ) {}

  s(st: Step) {
    const e = this.g.edges[st.e]!;
    return st.k === 0 || st.k === 2 ? e.a : e.b;
  }
  t(st: Step) {
    const e = this.g.edges[st.e]!;
    return st.k === 0 || st.k === 3 ? e.b : e.a;
  }
  /** Metres walked on the street itself, with road crossings counted as metres unless `crossings` is false. */
  cost(st: Step, crossings = true) {
    const e = this.g.edges[st.e]!;
    const span = this.spans.get(st.e)!;
    const walk = st.k < 2 ? e.len : st.k === 2 ? 2 * span.to : 2 * (e.len - span.from);
    if (!this.solo || !crossings) return walk;
    const crossed = st.k < 2 ? span.switches : span.twoSided ? 1 : 0;
    return walk + crossed * this.crossM;
  }
  /** The same street walked the other way (out-and-backs are their own reverse). */
  flip(st: Step): Step {
    return st.k === 0 ? { e: st.e, k: 1 } : st.k === 1 ? { e: st.e, k: 0 } : st;
  }
  cheapest(e: number) {
    return Math.min(...WAYS.map((k) => this.cost({ e, k })));
  }

  /** Walk from node `a` to what comes next: the next street's start, or the meeting point (-1). */
  private link(a: number, next: number, meet: number | null) {
    if (next === -1) return meet === null ? 0 : this.g.dist(a, meet);
    return this.g.dist(a, next);
  }

  /** Metres from the first street corner to the last door (plus on to the meeting point if set). */
  walkM(seq: Step[], meet: number | null, crossings = true): number {
    let m = 0;
    let cur = this.startNode;
    for (const st of seq) {
      m += this.g.dist(cur, this.s(st)) + this.cost(st, crossings);
      cur = this.t(st);
    }
    return m + (meet === null ? 0 : this.g.dist(cur, meet));
  }

  /** Nearest street first, walked whichever way is cheapest from there. */
  greedy(edges: number[]): Step[] {
    const left = new Set(edges);
    const seq: Step[] = [];
    let cur = this.startNode;
    while (left.size) {
      let bestE = -1;
      let bestD = Infinity;
      for (const e of left) {
        const { a, b } = this.g.edges[e]!;
        const d = Math.min(this.g.dist(cur, a), this.g.dist(cur, b));
        if (d < bestD) [bestD, bestE] = [d, e];
      }
      const from = cur;
      const step = WAYS.map((k): Step => ({ e: bestE, k })).reduce((p, q) =>
        this.g.dist(from, this.s(q)) + this.cost(q) < this.g.dist(from, this.s(p)) + this.cost(p) ? q : p,
      );
      seq.push(step);
      left.delete(bestE);
      cur = this.t(step);
    }
    return seq;
  }

  /** 2-opt (reverse a stretch) and moving single streets (any position, any way), until nothing improves. */
  improve(input: Step[], meet: number | null): Step[] {
    const seq = [...input];
    const n = seq.length;
    if (n === 0) return seq;
    const prevEnd = (i: number) => (i === 0 ? this.startNode : this.t(seq[i - 1]!));
    const nextStart = (i: number) => (i === n - 1 ? -1 : this.s(seq[i + 1]!));

    for (let pass = 0; pass < 50; pass++) {
      let improved = false;

      // 2-opt: reverse seq[i..j], flipping each street. Inside the stretch nothing changes.
      for (let i = 0; i < n; i++) {
        for (let j = i; j < n; j++) {
          const p = prevEnd(i);
          const q = nextStart(j);
          const before = this.g.dist(p, this.s(seq[i]!)) + this.link(this.t(seq[j]!), q, meet);
          const after = this.g.dist(p, this.t(seq[j]!)) + this.link(this.s(seq[i]!), q, meet);
          if (after < before - 1e-6) {
            const reversed = seq
              .slice(i, j + 1)
              .reverse()
              .map((st) => this.flip(st));
            seq.splice(i, j - i + 1, ...reversed);
            improved = true;
          }
        }
      }

      // Move one street to its best position and way of walking it.
      for (let i = 0; i < n && n > 0; i++) {
        const st = seq[i]!;
        const p = prevEnd(i);
        const q = nextStart(i);
        const removeGain =
          this.g.dist(p, this.s(st)) + this.cost(st) + this.link(this.t(st), q, meet) - this.link(p, q, meet);
        const rest = [...seq.slice(0, i), ...seq.slice(i + 1)];
        let bestGain = 1e-6;
        let bestPos = -1;
        let bestStep: Step = st;
        for (let pos = 0; pos <= rest.length; pos++) {
          const a = pos === 0 ? this.startNode : this.t(rest[pos - 1]!);
          const b = pos === rest.length ? -1 : this.s(rest[pos]!);
          for (const k of WAYS) {
            if (pos === i && k === st.k) continue; // that's where it is now
            const cand: Step = { e: st.e, k };
            const add =
              this.g.dist(a, this.s(cand)) + this.cost(cand) + this.link(this.t(cand), b, meet) - this.link(a, b, meet);
            if (removeGain - add > bestGain) [bestGain, bestPos, bestStep] = [removeGain - add, pos, cand];
          }
        }
        if (bestPos >= 0) {
          rest.splice(bestPos, 0, bestStep);
          seq.splice(0, n, ...rest);
          improved = true;
        }
      }

      if (!improved) break;
    }
    return seq;
  }

  /** The walked line: car → streets → last door. */
  geometry(seq: Step[], start: LatLng): LatLng[] {
    const pts: LatLng[] = [start, this.g.nodes[this.startNode]!];
    let cur = this.startNode;
    for (const st of seq) {
      const e = this.g.edges[st.e]!;
      const span = this.spans.get(st.e)!;
      pts.push(...this.g.path(cur, this.s(st)));
      if (st.k < 2) pts.push(...this.g.walkEdge(st.e, this.s(st)));
      else {
        const out = st.k === 2 ? cutAt(e.coords, span.to) : cutAt(this.g.walkEdge(st.e, e.b), e.len - span.from);
        pts.push(...out, ...[...out].reverse());
      }
      cur = this.t(st);
    }
    const route: LatLng[] = [];
    for (const p of pts) {
      const last = route[route.length - 1];
      if (!last || last.lat !== p.lat || last.lng !== p.lng) route.push({ lat: p.lat, lng: p.lng });
    }
    return route;
  }
}

// ============================== Options ==============================

interface CrewSplit {
  mode: SuggestMode;
  sizes: number[];
  label: string;
}

/** Ways to split a crew of n: solo, pairs (+1 solo if odd), two halves, everyone together. */
export function crewSplits(n: number): CrewSplit[] {
  if (n < 1) return [];
  const splits: CrewSplit[] = [{ mode: "solo", sizes: Array(n).fill(1), label: "Solo" }];
  if (n >= 3) {
    const pairs = Array(Math.floor(n / 2)).fill(2);
    if (n % 2) pairs.push(1);
    splits.push({ mode: "pairs", sizes: pairs, label: n % 2 ? "Pairs + 1 solo" : "Pairs" });
  }
  if (n >= 4) {
    const a = Math.ceil(n / 2);
    const b = Math.floor(n / 2);
    splits.push({ mode: "half", sizes: [a, b], label: a === b ? `2 groups of ${a}` : `Groups of ${a} and ${b}` });
  }
  if (n >= 2) splits.push({ mode: "together", sizes: [n], label: "All together" });
  // Drop duplicates (for 4 people, pairs and two halves are the same split).
  const seen = new Set<string>();
  return splits.filter((s) => {
    const key = s.sizes.join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface Planned {
  seqs: Step[][];
  finishS: number[];
  meet: number;
  togetherS: number;
}

/**
 * Plans routes for the selected houses for every way of splitting the crew, best first.
 * See the top of this file for how it works.
 */
export function suggestRoutes(input: SuggestInput): SuggestResult {
  const spd = input.secondsPerDoor ?? DEFAULT_SECONDS_PER_DOOR;
  const v = input.walkSpeedMs ?? WALK_SPEED_MS;
  const random = input.random ?? Math.random;

  const g = new Graph(input.start);
  for (const s of input.streets) g.addStreet(s);

  // Streets to knock, their houses, and where along the street the selected doors are.
  const housesByEdge = new Map<number, SuggestHouse[]>();
  const unroutedHouseIds: number[] = [];
  for (const h of input.houses) {
    const e = h.streetId === null ? undefined : g.edgeOfStreet.get(h.streetId);
    if (e === undefined) unroutedHouseIds.push(h.id);
    else housesByEdge.set(e, [...(housesByEdge.get(e) ?? []), h]);
  }
  const required = [...housesByEdge.keys()];
  if (!required.length || !input.memberIds.length)
    return { options: [], unroutedHouseIds, start: input.start, regroup: input.regroup ?? null };

  // The car and the regroup pin, snapped onto the nearest street.
  const [carSnap, pinSnap] = g.snap(input.regroup ? [input.start, input.regroup] : [input.start]);
  const car = carSnap!;
  const pin = pinSnap ?? null;

  const spans = new Map<number, Span>();
  const angle = new Map<number, number>();
  for (const [e, houses] of housesByEdge) {
    const doors = houses
      .map((house): Door => {
        const { along, side } = placeOnLine(g.edges[e]!.coords, house);
        return { house, along, side };
      })
      .sort((p, q) => p.along - q.along);
    let switches = 0;
    for (let i = 1; i < doors.length; i++) if (doors[i]!.side !== doors[i - 1]!.side) switches++;
    spans.set(e, {
      from: doors[0]!.along,
      to: doors[doors.length - 1]!.along,
      doors,
      twoSided: doors.some((d) => d.side === 0) && doors.some((d) => d.side === 1),
      switches,
    });
    // Pizza slices go by where the doors are, around the car.
    const pts = houses.map((h) => g.project(h));
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    angle.set(e, Math.atan2(y, x));
  }
  const doorsOf = (e: number) => housesByEdge.get(e)!.length;
  const crossS = input.secondsPerCrossing ?? DEFAULT_SECONDS_PER_CROSSING;
  const soloRouter = new Router(g, spans, car.node, true, crossS * v);
  const groupRouter = new Router(g, spans, car.node, false, crossS * v);
  const routerFor = (size: number) => (size === 1 ? soloRouter : groupRouter);
  const sorted = [...required].sort((p, q) => angle.get(p)! - angle.get(q)!);

  /** Where to start cutting slices: after the biggest gaps between streets, plus evenly spaced. */
  const sliceStarts = (() => {
    const n = sorted.length;
    if (n <= MAX_SWEEP_VARIANTS) return [...Array(n).keys()];
    const gaps = sorted.map((e, i) => {
      let gap = angle.get(e)! - angle.get(sorted[(i - 1 + n) % n]!)!;
      if (gap <= 0) gap += 2 * Math.PI;
      return { i, gap };
    });
    gaps.sort((p, q) => q.gap - p.gap);
    const picks = new Set(gaps.slice(0, 4).map((x) => x.i));
    for (let k = 0; picks.size < MAX_SWEEP_VARIANTS && k < MAX_SWEEP_VARIANTS; k++)
      picks.add(Math.floor((k * n) / MAX_SWEEP_VARIANTS));
    return [...picks];
  })();

  /** Cut `order` into one slice per group, balancing the slowest group (binary search on its time). */
  const slice = (order: number[], sizes: number[]): number[][] => {
    const k = sizes.length;
    const est = (m: number, doors: number, size: number) => m / v + (doors * spd) / size;
    const fill = (limit: number) => {
      const groups: number[][] = [[]];
      const acc = [{ m: 0, doors: 0 }];
      order.forEach((e, idx) => {
        let j = groups.length - 1;
        const cur = acc[j]!;
        const withE = est(cur.m + routerFor(sizes[j]!).cheapest(e), cur.doors + doorsOf(e), sizes[j]!);
        const mustMove = order.length - idx <= k - 1 - j; // leave a street for each remaining group
        if (groups[j]!.length && j < k - 1 && (withE > limit || mustMove)) {
          groups.push([]);
          acc.push({ m: 0, doors: 0 });
          j++;
        }
        groups[j]!.push(e);
        acc[j]!.m += routerFor(sizes[j]!).cheapest(e);
        acc[j]!.doors += doorsOf(e);
      });
      const worst = Math.max(...acc.map((a, j) => est(a.m, a.doors, sizes[j]!)));
      return { groups, worst };
    };
    let lo = 0;
    let hi = est(
      order.reduce((s, e) => s + soloRouter.cheapest(e), 0),
      order.reduce((s, e) => s + doorsOf(e), 0),
      Math.min(...sizes),
    );
    let best = fill(hi);
    for (let it = 0; it < 40; it++) {
      const mid = (lo + hi) / 2;
      const r = fill(mid);
      if (r.groups.length === k && r.worst <= mid) [best, hi] = [r, mid];
      else lo = mid;
    }
    return best.groups;
  };

  const finishTimes = (seqs: Step[][], sizes: number[]) =>
    seqs.map((seq, j) => routerFor(sizes[j]!).walkM(seq, null) / v + busiestDoors(seq, sizes[j]!) * spd);

  /** The meeting node that gets everyone together soonest (or the pin's), and when that is. */
  const meetFor = (seqs: Step[][], finish: number[]) => {
    const ends = seqs.map((seq) => groupRouter.t(seq[seq.length - 1]!));
    const at = (node: number) => Math.max(...ends.map((end, j) => finish[j]! + g.dist(end, node) / v));
    if (pin) return { meet: pin.node, togetherS: at(pin.node) };
    let meet = car.node;
    let best = Infinity;
    for (let node = 0; node < g.nodes.length; node++) {
      const t = at(node);
      if (t < best) [best, meet] = [t, node];
    }
    return { meet, togetherS: best };
  };

  const plan = (groups: number[][], sizes: number[]): Planned => {
    let seqs = groups.map((es, j) => routerFor(sizes[j]!).improve(routerFor(sizes[j]!).greedy(es), null));
    const first = meetFor(seqs, finishTimes(seqs, sizes));
    // Re-optimise each route to end near the meeting point, then pick the meeting point again.
    seqs = seqs.map((seq, j) => routerFor(sizes[j]!).improve(seq, first.meet));
    const finishS = finishTimes(seqs, sizes);
    const { meet, togetherS } = meetFor(seqs, finishS);
    return { seqs, finishS, meet, togetherS };
  };

  // Shuffle the crew once, so groups are random but the same people stay together across options.
  const crew = [...input.memberIds];
  for (let i = crew.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [crew[i], crew[j]] = [crew[j]!, crew[i]!];
  }

  /**
   * Who knocks which door, in order. Kept to a few rules people can predict:
   *  - Solo: an end-to-end street is zigzagged; an out-and-back of a two-sided street is one side
   *    going out and the other coming back.
   *  - Group, two-sided street: the first half of the group takes the left side (of the walking
   *    direction), the rest the right, for the whole route. Nobody crosses mid-street.
   *  - Group, one-sided street: the next door goes to whoever has knocked the fewest so far (so a
   *    pair leapfrogs A, B, A, B, and whoever got the lighter side earlier catches up).
   *  - Group, houses around the turning circle of a dead end: each side works round from their
   *    end in one unbroken run, the run sizes evening out everyone's totals.
   * People in a group aren't tied together: whoever has fewer doors simply gets ahead.
   */
  const knockOrder = (seq: Step[], memberIds: string[]): SuggestKnock[] => {
    const out: SuggestKnock[] = [];
    const count = new Map(memberIds.map((m) => [m, 0]));
    const fewest = (ms: string[]) => ms.reduce((p, q) => (count.get(q)! < count.get(p)! ? q : p));
    const give = (d: Door, memberId: string) => {
      out.push({ houseId: d.house.id, memberId });
      count.set(memberId, count.get(memberId)! + 1);
    };
    const half = Math.ceil(memberIds.length / 2);
    const leftTeam = memberIds.slice(0, half);
    const rightTeam = memberIds.slice(half);

    for (const st of seq) {
      const edge = g.edges[st.e]!;
      const span = spans.get(st.e)!;
      const fromA = st.k === 0 || st.k === 2;
      const inWalkOrder = fromA ? span.doors : [...span.doors].reverse();
      if (memberIds.length === 1) {
        const doors =
          st.k >= 2 && span.twoSided
            ? [...inWalkOrder.filter((d) => d.side === 0), ...inWalkOrder.filter((d) => d.side === 1).reverse()]
            : inWalkOrder;
        for (const d of doors) give(d, memberIds[0]!);
        continue;
      }
      // Houses around the end of a dead end (they wrap round the turning circle).
      const farNode = fromA ? edge.b : edge.a;
      const deadEnd = g.adj[farNode]!.length === 1;
      const atEnd = (d: Door) => deadEnd && (fromA ? d.along >= edge.len - DEAD_END_CAP_M : d.along <= DEAD_END_CAP_M);
      const main = inWalkOrder.filter((d) => !atEnd(d));
      const leftSide = fromA ? 0 : 1; // side 0 is left of the a → b direction
      const twoSided = main.some((d) => d.side === 0) && main.some((d) => d.side === 1);
      for (const d of main) give(d, fewest(twoSided ? (d.side === leftSide ? leftTeam : rightTeam) : memberIds));
      // Around the turning circle (left side first, then round to the right): split into two
      // unbroken runs, the left team working round from their side and the right team from
      // theirs, sized so both teams end up with about the same number of doors.
      const end = inWalkOrder.filter(atEnd);
      if (!end.length) continue;
      // Order by angle round the end of the street, from the left curb round to the right.
      const c = edge.coords;
      const [p0, p1] = fromA ? [c[c.length - 2]!, c[c.length - 1]!] : [c[1]!, c[0]!];
      const tip = g.project(p1);
      const dir = { x: tip.x - g.project(p0).x, y: tip.y - g.project(p0).y };
      const angleOf = (d: Door) => {
        const p = g.project(d.house);
        const rx = p.x - tip.x;
        const ry = p.y - tip.y;
        return Math.atan2(dir.x * ry - dir.y * rx, dir.x * rx + dir.y * ry); // + is left of the walking direction
      };
      const around = [...end].sort((p, q) => angleOf(q) - angleOf(p));
      const sum = (team: string[]) => team.reduce((s, m) => s + count.get(m)!, 0);
      const nL = leftTeam.length;
      const nR = rightTeam.length;
      const forLeft = Math.round((nL * (sum(rightTeam) + around.length) - nR * sum(leftTeam)) / (nL + nR));
      const x = Math.max(0, Math.min(around.length, forLeft));
      for (const d of around.slice(0, x)) give(d, fewest(leftTeam));
      for (const d of around.slice(x).reverse()) give(d, fewest(rightTeam));
    }
    return out;
  };

  /** Doors knocked by the busiest person in the group (what the group's finish time waits for). */
  const busiestDoors = (seq: Step[], size: number) => {
    if (size === 1) return seq.reduce((s, st) => s + doorsOf(st.e), 0);
    const ids = Array.from({ length: size }, (_, i) => String(i));
    const counts = new Map<string, number>();
    for (const k of knockOrder(seq, ids)) counts.set(k.memberId, (counts.get(k.memberId) ?? 0) + 1);
    return Math.max(...counts.values());
  };

  const options: SuggestOption[] = [];
  for (const split of crewSplits(crew.length)) {
    if (split.sizes.length > required.length) continue; // more groups than streets to give them
    let best: Planned | null = null;
    for (const s of split.sizes.length === 1 ? [0] : sliceStarts) {
      const planned = plan(slice([...sorted.slice(s), ...sorted.slice(0, s)], split.sizes), split.sizes);
      if (!best || planned.togetherS < best.togetherS) best = planned;
    }
    const chosen = best!;
    let taken = 0;
    const groups = chosen.seqs.map((seq, j): SuggestGroup => {
      const memberIds = crew.slice(taken, taken + split.sizes[j]!);
      taken += split.sizes[j]!;
      const houses = seq.flatMap((st) => housesByEdge.get(st.e)!);
      const router = routerFor(memberIds.length);
      const route = router.geometry(seq, car.at);
      const endNode = router.t(seq[seq.length - 1]!);
      return {
        memberIds,
        houseIds: houses.map((h) => h.id),
        knocks: knockOrder(seq, memberIds),
        blockIds: [...new Set(houses.flatMap((h) => (h.blockId === null ? [] : [h.blockId])))],
        streetIds: seq.map((st) => g.edges[st.e]!.street),
        doors: houses.length,
        route,
        walkM: Math.round(router.walkM(seq, null, false)),
        finishS: Math.round(chosen.finishS[j]!),
        end: route[route.length - 1]!,
        toMeet: [route[route.length - 1]!, ...g.path(endNode, chosen.meet).map((p) => ({ lat: p.lat, lng: p.lng }))],
      };
    });
    const meetNode = g.nodes[chosen.meet]!;
    options.push({
      mode: split.mode,
      label: split.label,
      groups,
      finishS: Math.round(Math.max(...chosen.finishS)),
      togetherS: Math.round(chosen.togetherS),
      meetPoint: pin ? pin.at : { lat: meetNode.lat, lng: meetNode.lng },
    });
  }

  options.sort((p, q) => p.togetherS - q.togetherS);
  return { options, unroutedHouseIds, start: car.at, regroup: pin?.at ?? null };
}

// ============================== Applying a suggestion ==============================

/**
 * The planning edits that apply an option. It replaces existing claims on the option's blocks and
 * the crew's old dashed routes, then claims each group's blocks for its members and draws one
 * dashed route per group (in the first member's colour). Everything stays editable by anyone.
 * `newId` makes drawing IDs (UUIDs).
 */
export function suggestionToPlanOps(option: SuggestOption, plan: PlanContent, newId: () => string): PlanEditOp[] {
  const blocks = new Set(option.groups.flatMap((gr) => gr.blockIds));
  const crew = new Set(option.groups.flatMap((gr) => gr.memberIds));
  const ops: PlanEditOp[] = [
    ...plan.claims
      .filter((c) => blocks.has(c.blockId))
      .map((c): PlanEditOp => ({ op: "unclaim", blockId: c.blockId, memberId: c.memberId })),
    ...plan.drawings
      .filter((d) => d.kind === "route" && d.memberId !== null && crew.has(d.memberId))
      .map((d): PlanEditOp => ({ op: "erase", drawingId: d.id })),
  ];

  for (const group of option.groups) {
    for (const memberId of group.memberIds)
      for (let i = 0; i < group.blockIds.length; i += 200)
        ops.push({ op: "claimMany", blockIds: group.blockIds.slice(i, i + 200), memberId });
    const points = [...group.route, ...group.toMeet.slice(1)]; // knocking, then the walk to the meeting point
    if (points.length >= 2 && group.memberIds[0])
      ops.push({
        op: "draw",
        stroke: {
          id: newId(),
          kind: "route",
          points: thin(points, MAX_ROUTE_POINTS),
          memberId: group.memberIds[0],
          colour: null,
        },
      });
  }
  return ops;
}

/** Keep at most `max` points, always keeping the first and last. */
function thin(points: LatLng[], max: number): LatLng[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]!);
}
