/**
 * Suggest on the Live map: what to draw (selected houses, the chosen option's routes, the walks to
 * the meeting point, the car and pin) and what the brush and taps do.
 */
import { useCallback, useMemo, type RefObject } from "react";
import type { KnockdMapHandle } from "@/map";
import { COLOURS } from "@/map/constants";
import type { PlanTap } from "@/map/types";
import { metresPerPixel } from "@/plan/planOps";
import { useCrewStore } from "@/realtime/stores/crewStore";
import { buildRouteProgress, type RouteProgressView } from "@/routes";
import { startPoint, useSuggestStore } from "./suggestStore";
import { optionToRoutePlan, suggestGeo, type SuggestGeo } from "./suggestView";

/** Brush radius on screen, in pixels (so it feels the same at any zoom). */
export const BRUSH_RADIUS_PX = 28;

export interface SuggestMap {
  readonly routes: RouteProgressView | null;
  readonly geo: SuggestGeo;
  readonly highlights: Readonly<Record<string, string>> | undefined;
  readonly onBrushStroke: (points: readonly (readonly [number, number])[]) => Promise<void>;
  readonly onTap: (tap: PlanTap) => void;
}

export function useSuggestMap(mapRef: RefObject<KnockdMapHandle | null>, active: boolean): SuggestMap {
  const selected = useSuggestStore((s) => s.selected);
  const options = useSuggestStore((s) => s.options);
  const chosen = useSuggestStore((s) => s.chosen);
  const car = useSuggestStore((s) => s.car);
  const meet = useSuggestStore((s) => s.meet);
  const crew = useCrewStore((s) => s.members);
  const colours = useMemo(() => Object.fromEntries(Object.values(crew).map((m) => [m.id, m.colour])), [crew]);

  const option = active ? (options?.[chosen] ?? null) : null;
  // Where routes start: the car if placed (Suggest snaps it), else this phone or the session centre.
  const start = useMemo(() => (active ? startPoint(car) : null), [active, car]);

  const routes = useMemo(
    () => (option && start ? buildRouteProgress(optionToRoutePlan(option, start), {}) : null),
    [option, start],
  );
  const geo = useMemo(
    () => suggestGeo(option, colours, start, active ? meet : null),
    [option, colours, start, active, meet],
  );
  // While selecting, picked houses show in the brand colour; once there are options, the routes
  // colour each house by who knocks it.
  const highlights = useMemo(
    () =>
      active && !option && selected.size > 0
        ? Object.fromEntries([...selected].map((id) => [id, COLOURS.brand]))
        : undefined,
    [active, option, selected],
  );

  const onBrushStroke = useCallback(
    async (points: readonly (readonly [number, number])[]) => {
      const map = mapRef.current;
      if (!map || points.length === 0) return;
      const [path, zoom] = await Promise.all([map.unproject(points), map.getZoom()]);
      if (path.length === 0) return;
      useSuggestStore.getState().brushPath(path, BRUSH_RADIUS_PX * metresPerPixel(path[0]!.lat, zoom));
    },
    [mapRef],
  );
  const onTap = useCallback((tap: PlanTap) => useSuggestStore.getState().placeAt(tap.at), []);

  return { routes, geo, highlights, onBrushStroke, onTap };
}
