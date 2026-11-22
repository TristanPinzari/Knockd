import type { StyleProp, ViewStyle } from "react-native";
import type { RouteProgressView } from "@/routes";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";

export type TrailMode = "knocking" | "walking" | "driving";
export type LeadGrade = "A" | "B" | "C";

export interface MapMember {
  memberId: string;
  name: string;
  colour: string;
  initials: string;
  lng: number;
  lat: number;
  headingDeg?: number;
  speedKmh?: number;
  isMe: boolean;
}

export interface MapLead {
  id: string;
  lng: number;
  lat: number;
  grade: LeadGrade;
}

export type TrailCollection = FeatureCollection<LineString, { memberId: string; mode: TrailMode }>;

export interface KnockdMapProps {
  style?: StyleProp<ViewStyle>;
  center: [number, number];
  zoom: number;
  /** Outlined dashed in brand colour; outskirts tinted red-orange when zoomed out. */
  workArea?: Polygon;
  /** Planned routes with everyone's progress: dashed routes, slug trails, numbered doors. */
  routes: RouteProgressView;
  /** Member id → crew colour, for everyone in the plan (not only those with a position). */
  colours: Readonly<Record<string, string>>;
  members: MapMember[];
  trails: TrailCollection;
  houses?: FeatureCollection<Point | Polygon>;
  leads: MapLead[];
  /** false: only my own group's route and doors; teammates' GPS trails are faint grey ghost lines. */
  showCrewPaths: boolean;
  onHousePress?: (houseId: string) => void;
  onHouseLongPress?: (houseId: string) => void;
  onZoomChange?: (zoom: number) => void;
}

/** Imperative handle (via ref) for the recenter / fit controls in the UI. */
export interface KnockdMapHandle {
  recenter: (lng: number, lat: number, zoom?: number) => void;
  fitWorkArea: () => void;
  /** Zoom in (positive) or out (negative) from the current zoom, clamped to the map's zoom range. */
  zoomBy: (delta: number) => void;
}

export type LngLat = [number, number];
export type Bounds = { sw: LngLat; ne: LngLat };
export type PolyFeature = Feature<Polygon | import("geojson").MultiPolygon>;
