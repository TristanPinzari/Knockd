import type { Feature, FeatureCollection, Point } from "geojson";
import type { LeadGrade, MapLead } from "../types";

export function leadsToGeoJSON(
  leads: MapLead[],
): FeatureCollection<Point, { id: string; grade: LeadGrade; past: boolean }> {
  const features: Feature<Point, { id: string; grade: LeadGrade; past: boolean }>[] = leads.map((l) => ({
    type: "Feature",
    properties: { id: l.id, grade: l.grade, past: l.past ?? false },
    geometry: { type: "Point", coordinates: [l.lng, l.lat] },
  }));
  return { type: "FeatureCollection", features };
}
