import type { Feature, FeatureCollection, LineString } from "geojson";
import { COLOURS } from "../constants";
import type { MapMember, TrailCollection, TrailMode } from "../types";

export interface StyledTrailProps {
  memberId: string;
  mode: TrailMode;
  colour: string;
  ghost: boolean;
}

/**
 * Attach colour + ghost flag to each trail segment. Mine and (with showCrewPaths) teammates' trails
 * use the member colour; otherwise teammates' trails are faint grey ghost lines.
 */
export function styleTrails(
  trails: TrailCollection,
  members: MapMember[],
  showCrewPaths: boolean,
): FeatureCollection<LineString, StyledTrailProps> {
  const byId = new Map(members.map((m) => [m.memberId, m]));
  const features: Feature<LineString, StyledTrailProps>[] = trails.features.map((f) => {
    const member = byId.get(f.properties.memberId);
    const ghost = !(member?.isMe ?? false) && !showCrewPaths;
    const colour = ghost || !member ? COLOURS.ghostTrail : member.colour;
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: { memberId: f.properties.memberId, mode: f.properties.mode, colour, ghost },
    };
  });
  return { type: "FeatureCollection", features };
}
