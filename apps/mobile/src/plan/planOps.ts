/**
 * Planning tools, as pure functions: which ops each tool sends, and how to undo them.
 *
 * Every user action is a list of `plan:edit` ops (API.md, "Planning"). Undo sends the inverse ops in
 * reverse order, worked out from the plan as it was before the action:
 *   claim ↔ unclaim, draw → erase (erase → draw it back), note → removeNote (and back), clearMine →
 *   put back everything of mine. Undo and redo only ever cover this phone's own actions.
 */
import {
  distanceM,
  type Drawing,
  type LatLng,
  type Note,
  type PaletteColour,
  type PlanContent,
  type PlanEditOp,
} from "@knockd/shared";

export type PlanTool = "move" | "claim" | "route" | "freehand" | "note" | "eraser" | "suggest";

/** Who a drawing, note or claim is for: a crew member (their colour) or a utility colour. */
export type Ink =
  | { readonly memberId: string; readonly colour?: undefined }
  | { readonly colour: PaletteColour; readonly memberId?: undefined };

/** The drawing/note fields for an ink (exactly one of memberId and colour is set). */
export const forInk = (ink: Ink): { memberId: string | null; colour: PaletteColour | null } =>
  ink.memberId !== undefined ? { memberId: ink.memberId, colour: null } : { memberId: null, colour: ink.colour };

/** Server limit on points per drawing. */
export const MAX_STROKE_POINTS = 500;
/** Points closer than this to the previous kept point are dropped from a stroke. */
export const STROKE_MIN_STEP_M = 2;

// ---------- Claims ----------

/** Tapping a block with the claim tool: claim it for the member, or unclaim it if they already have it. */
export function claimTapOps(plan: PlanContent, blockId: number, memberId: string): PlanEditOp[] {
  const has = plan.claims.some((c) => c.blockId === blockId && c.memberId === memberId);
  return [{ op: has ? "unclaim" : "claim", blockId, memberId }];
}

/** The eraser on a block: remove everyone's claim on it. */
export function unclaimBlockOps(plan: PlanContent, blockId: number): PlanEditOp[] {
  return plan.claims
    .filter((c) => c.blockId === blockId)
    .map((c): PlanEditOp => ({ op: "unclaim", blockId: c.blockId, memberId: c.memberId }));
}

// ---------- Strokes ----------

/** Drops points closer than STROKE_MIN_STEP_M, keeps the last point, and caps the count at the server limit. */
export function cleanStroke(points: readonly LatLng[]): LatLng[] {
  const kept: LatLng[] = [];
  points.forEach((p, i) => {
    const last = kept[kept.length - 1];
    const isEnd = i === points.length - 1 && i > 0;
    if (!last || distanceM(last, p) >= STROKE_MIN_STEP_M || (isEnd && distanceM(last, p) > 0))
      kept.push({ lat: p.lat, lng: p.lng });
  });
  if (kept.length <= MAX_STROKE_POINTS) return kept;
  // Too long: keep evenly spaced points, always including both ends.
  const step = (kept.length - 1) / (MAX_STROKE_POINTS - 1);
  return Array.from({ length: MAX_STROKE_POINTS }, (_, i) => kept[Math.round(i * step)]!);
}

/** A new route or freehand line, or null when the stroke is too short to keep (a tap). */
export function drawOp(
  kind: "route" | "freehand",
  points: readonly LatLng[],
  ink: Ink,
  newId: () => string,
): PlanEditOp | null {
  const clean = cleanStroke(points);
  if (clean.length < 2) return null;
  return { op: "draw", stroke: { id: newId(), kind, points: clean, ...forInk(ink) } };
}

/** Distance from p to segment a–b, in metres (flat approximation, fine at street scale). */
function segmentDistanceM(p: LatLng, a: LatLng, b: LatLng): number {
  const kx = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 111_320;
  const [ax, ay] = [(a.lng - p.lng) * kx, (a.lat - p.lat) * ky];
  const [bx, by] = [(b.lng - p.lng) * kx, (b.lat - p.lat) * ky];
  const [dx, dy] = [bx - ax, by - ay];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Distance from a point to a polyline, in metres. */
export function distanceToLineM(p: LatLng, line: readonly LatLng[]): number {
  if (line.length === 1) return distanceM(p, line[0]!);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, segmentDistanceM(p, line[i - 1]!, line[i]!));
  return best;
}

/** Drawings the eraser path passes within `reachM` of (whoever drew them). */
export function drawingsTouched(drawings: readonly Drawing[], path: readonly LatLng[], reachM: number): Drawing[] {
  if (path.length === 0) return [];
  return drawings.filter((d) => path.some((p) => distanceToLineM(p, d.points) <= reachM));
}

/** The eraser: erase every drawing its path touched. */
export function eraseOps(drawings: readonly Drawing[]): PlanEditOp[] {
  return drawings.map((d): PlanEditOp => ({ op: "erase", drawingId: d.id }));
}

/** The note nearest `p` within `reachM`, if any (for tapping a note). */
export function noteNear(notes: readonly Note[], p: LatLng, reachM: number): Note | null {
  let best: { note: Note; d: number } | null = null;
  for (const note of notes) {
    const d = distanceM(note, p);
    if (d <= reachM && (!best || d < best.d)) best = { note, d };
  }
  return best?.note ?? null;
}

/** Metres covered by one screen pixel (MapLibre's 512 px tiles). */
export function metresPerPixel(lat: number, zoom: number): number {
  return (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

// ---------- Undo ----------

const strokeOf = (d: Drawing): PlanEditOp => ({
  op: "draw",
  stroke: { id: d.id, kind: d.kind, points: d.points, memberId: d.memberId, colour: d.colour },
});
const noteOf = (n: Note): PlanEditOp => ({
  op: "note",
  note: { id: n.id, lat: n.lat, lng: n.lng, text: n.text, memberId: n.memberId, colour: n.colour },
});

/** The ops that undo one op, given the plan just before it was applied. */
export function inverseOf(op: PlanEditOp, before: PlanContent, myId: string): PlanEditOp[] {
  switch (op.op) {
    case "claim":
      return before.claims.some((c) => c.blockId === op.blockId && c.memberId === op.memberId)
        ? []
        : [{ op: "unclaim", blockId: op.blockId, memberId: op.memberId }];
    case "claimMany": {
      const had = new Set(before.claims.filter((c) => c.memberId === op.memberId).map((c) => c.blockId));
      return op.blockIds
        .filter((id) => !had.has(id))
        .map((blockId): PlanEditOp => ({ op: "unclaim", blockId, memberId: op.memberId }));
    }
    case "unclaim":
      return before.claims.some((c) => c.blockId === op.blockId && c.memberId === op.memberId)
        ? [{ op: "claim", blockId: op.blockId, memberId: op.memberId }]
        : [];
    case "draw": {
      const old = before.drawings.find((d) => d.id === op.stroke.id);
      return [old ? strokeOf(old) : { op: "erase", drawingId: op.stroke.id }];
    }
    case "erase": {
      const old = before.drawings.find((d) => d.id === op.drawingId);
      return old ? [strokeOf(old)] : [];
    }
    case "note": {
      const old = before.notes.find((n) => n.id === op.note.id);
      return [old ? noteOf(old) : { op: "removeNote", noteId: op.note.id }];
    }
    case "removeNote": {
      const old = before.notes.find((n) => n.id === op.noteId);
      return old ? [noteOf(old)] : [];
    }
    case "clearMine": {
      const claims = before.claims.filter((c) => c.authorId === myId);
      return [
        ...claims.map((c): PlanEditOp => ({ op: "claim", blockId: c.blockId, memberId: c.memberId })),
        ...before.drawings.filter((d) => d.authorId === myId).map(strokeOf),
        ...before.notes.filter((n) => n.authorId === myId).map(noteOf),
      ];
    }
  }
}

/**
 * Undo for a whole action: each op's inverse (computed against the plan as it was just before
 * that op), in reverse order. `apply` is applyPlanEdit (passed in to keep this file free of it).
 */
export function inverseOfAction(
  ops: readonly PlanEditOp[],
  before: PlanContent,
  myId: string,
  apply: (plan: PlanContent, op: PlanEditOp, authorId: string) => PlanContent,
): PlanEditOp[] {
  const steps: PlanEditOp[][] = [];
  let plan = before;
  for (const op of ops) {
    steps.push(inverseOf(op, plan, myId));
    plan = apply(plan, op, myId);
  }
  return steps.reverse().flat();
}
