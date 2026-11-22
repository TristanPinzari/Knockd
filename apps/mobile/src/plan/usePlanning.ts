/**
 * Planning mode glue for the Live map: turns map taps and finger strokes into plan edits for the
 * selected tool and colour, and runs them through the plan editor (with undo).
 */
import * as Crypto from "expo-crypto";
import { useCallback, useMemo, type RefObject } from "react";
import { EMPTY_PLAN, utilityColours, type LatLng, type PaletteColour, type PlanEditOp } from "@knockd/shared";
import { useAreaStore } from "@/area";
import type { KnockdMapHandle } from "@/map";
import type { PlanTap } from "@/map/types";
import { useCrewStore } from "@/realtime/stores/crewStore";
import { usePlanStore } from "@/realtime/stores/planStore";
import { inArea } from "@/routes";
import { usePlanEditor } from "./planEditor";
import {
  claimTapOps,
  drawingsTouched,
  drawOp,
  eraseOps,
  forInk,
  metresPerPixel,
  noteNear,
  unclaimBlockOps,
  type Ink,
} from "./planOps";

/** How close (pixels) the eraser or a tap has to come to a line or note to hit it. */
const REACH_PX = 18;
/** A stroke that travels less than this (pixels) is a tap. */
const TAP_PX = 10;

export interface NoteDraft {
  readonly at: LatLng;
  /** Set when editing an existing note (same id replaces it). */
  readonly id: string | null;
  readonly text: string;
}

export interface PlanningHandlers {
  /** The colour drawings use right now (mine when no ink is picked). */
  readonly inkColour: string;
  readonly ink: Ink;
  /** Crew colours first (me first), then utility colours. */
  readonly memberInks: readonly { ink: Ink; colour: string; label: string; isMe: boolean }[];
  readonly utilityInks: readonly { ink: Ink; colour: PaletteColour }[];
  onPlanTap(tap: PlanTap): void;
  onStroke(points: readonly (readonly [number, number])[]): Promise<void>;
  saveNote(draft: NoteDraft, text: string): void;
  removeNote(id: string): void;
  clearMine(): void;
}

const newId = () => Crypto.randomUUID();
const say = (message: string) => usePlanEditor.getState().setMessage(message);
const plan = () => usePlanStore.getState().plan ?? EMPTY_PLAN;

function travelPx(points: readonly (readonly [number, number])[]): number {
  let max = 0;
  const [x0, y0] = points[0] ?? [0, 0];
  for (const [x, y] of points) max = Math.max(max, Math.hypot(x - x0, y - y0));
  return max;
}

export function usePlanning(
  mapRef: RefObject<KnockdMapHandle | null>,
  myId: string | null,
  openNote: (draft: NoteDraft) => void,
): PlanningHandlers {
  const crew = useCrewStore((s) => s.members);
  const picked = usePlanEditor((s) => s.ink);
  const tool = usePlanEditor((s) => s.tool);

  const ink: Ink = useMemo(() => picked ?? { memberId: myId ?? "" }, [picked, myId]);
  const memberInks = useMemo(() => {
    const all = Object.values(crew).map((m) => ({
      ink: { memberId: m.id } as Ink,
      colour: m.colour,
      label: m.id === myId ? "You" : m.name,
      isMe: m.id === myId,
    }));
    return [...all.filter((m) => m.isMe), ...all.filter((m) => !m.isMe)];
  }, [crew, myId]);
  const utilityInks = useMemo(
    () =>
      utilityColours(Object.values(crew).map((m) => m.colour)).map((colour) => ({ ink: { colour } as Ink, colour })),
    [crew],
  );
  const inkColour = ink.colour ?? crew[ink.memberId ?? ""]?.colour ?? "#9AA3AD";

  const run = useCallback(
    (ops: PlanEditOp[]) => {
      if (myId && ops.length > 0) void usePlanEditor.getState().run(ops, myId);
    },
    [myId],
  );

  const onPlanTap = useCallback(
    (tap: PlanTap) => {
      if (tool === "claim") {
        if (tap.blockId === null) return say("Tap inside a block to claim it.");
        if (ink.memberId === undefined) return say("Claims are for people: pick someone's colour.");
        run(claimTapOps(plan(), tap.blockId, ink.memberId));
      } else if (tool === "note") {
        const existing = tap.noteId ? plan().notes.find((n) => n.id === tap.noteId) : undefined;
        openNote(
          existing
            ? { at: { lat: existing.lat, lng: existing.lng }, id: existing.id, text: existing.text }
            : { at: tap.at, id: null, text: "" },
        );
      }
    },
    [tool, ink, run, openNote],
  );

  const onStroke = useCallback(
    async (points: readonly (readonly [number, number])[]) => {
      const map = mapRef.current;
      if (!map || points.length === 0) return;
      const [path, zoom] = await Promise.all([map.unproject(points), map.getZoom()]);
      if (path.length === 0) return;
      const reachM = REACH_PX * metresPerPixel(path[0]!.lat, zoom);
      const current = plan();

      if (tool === "route" || tool === "freehand") {
        const op = drawOp(tool, path, ink, newId);
        if (!op) return say("Drag your finger to draw a line.");
        return run([op]);
      }
      if (tool !== "eraser") return;
      // The eraser removes every line it touches and every note it passes over; a tap inside a
      // claimed block also unclaims it.
      const ops: PlanEditOp[] = [
        ...eraseOps(drawingsTouched(current.drawings, path, reachM)),
        ...current.notes
          .filter((n) => path.some((p) => noteNear([n], p, reachM)))
          .map((n): PlanEditOp => ({ op: "removeNote", noteId: n.id })),
      ];
      if (ops.length === 0 && travelPx(points) < TAP_PX) {
        const blocks = useAreaStore.getState().area.blocks;
        const at = path[0]!;
        const claimed = [...new Set(current.claims.map((c) => c.blockId))].find((id) => {
          const block = blocks[String(id)];
          return block && inArea(block.polygon, [at.lng, at.lat]);
        });
        if (claimed !== undefined) ops.push(...unclaimBlockOps(current, claimed));
      }
      run(ops);
    },
    [mapRef, tool, ink, run],
  );

  const saveNote = useCallback(
    (draft: NoteDraft, text: string) => {
      const t = text.trim();
      if (!t) return;
      const existing = draft.id ? plan().notes.find((n) => n.id === draft.id) : undefined;
      // Editing keeps the note's own colour; a new note uses the picked one.
      const forWhom = existing ? { memberId: existing.memberId, colour: existing.colour } : forInk(ink);
      run([
        {
          op: "note",
          note: { id: draft.id ?? newId(), lat: draft.at.lat, lng: draft.at.lng, text: t.slice(0, 140), ...forWhom },
        },
      ]);
    },
    [ink, run],
  );

  const removeNote = useCallback((id: string) => run([{ op: "removeNote", noteId: id }]), [run]);
  const clearMine = useCallback(() => run([{ op: "clearMine" }]), [run]);

  return { inkColour, ink, memberInks, utilityInks, onPlanTap, onStroke, saveNote, removeNote, clearMine };
}
