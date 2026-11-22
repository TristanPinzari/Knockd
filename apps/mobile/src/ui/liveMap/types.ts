import type { FeatureCollection, Point, Polygon } from "geojson";
import type { MapLead, MapMember, TrailCollection } from "@/map/types";
import type { RouteProgressView } from "@/routes";
import type { PlanGeo } from "@/plan/planGeo";

/** Everything the Live map screen hands to KnockdMap (minus interaction props). */
export interface LiveMapData {
  readonly center: [number, number];
  readonly zoom: number;
  /** Undefined in a live session until blocks are loaded. */
  readonly workArea: Polygon | undefined;
  /** Planned routes with everyone's progress (slug trails, numbered and knocked doors). */
  readonly routes: RouteProgressView;
  /** Member id → crew colour. */
  readonly colours: Readonly<Record<string, string>>;
  /** Everyone in the session (with or without a position), for the progress bars. */
  readonly crew: readonly CrewBadge[];
  readonly members: MapMember[];
  readonly trails: TrailCollection;
  /** Demo houses are points; backend houses are (simplified) polygons. */
  readonly houses: FeatureCollection<Point | Polygon, { houseId: string }>;
  readonly leads: MapLead[];
  /** The shared plan as map layers. */
  readonly plan: PlanGeo;
  /** Every loaded block, shown (and tappable) while planning. */
  readonly blocks: FeatureCollection<Polygon, { blockId: number }>;
}

/** The slice of a live crew member the map needs (structural, so this file stays free of native imports). */
export interface LiveCrewMember {
  readonly id: string;
  readonly name: string;
  readonly colour: string;
  readonly initials: string;
  readonly position: { readonly lat: number; readonly lng: number } | null;
  readonly speedKmh: number | null;
}

/** A crew member as the progress bars show them. */
export interface CrewBadge {
  readonly memberId: string;
  readonly initials: string;
  readonly colour: string;
  readonly isMe: boolean;
}
