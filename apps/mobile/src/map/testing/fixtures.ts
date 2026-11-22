import type { Polygon } from "geojson";
import type { MapStyle } from "../theme/applyKnockdTheme";

/** Trimmed Protomaps "light" style: same layer ids/types as the server style. */
export const fixtureStyle: MapStyle = {
  version: 8,
  sources: { protomaps: { type: "vector", tiles: ["https://api.knockd.rodeo/tiles/{z}/{x}/{y}.mvt"] } },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#cccccc" } },
    { id: "earth", type: "fill", source: "protomaps", paint: { "fill-color": "#cccccc" } },
    { id: "landuse_park", type: "fill", source: "protomaps", paint: { "fill-color": "#aaffaa" } },
    { id: "landuse_hospital", type: "fill", source: "protomaps", paint: { "fill-color": "#ffaaaa" } },
    { id: "water", type: "fill", source: "protomaps", paint: { "fill-color": "#00f" } },
    { id: "buildings", type: "fill", source: "protomaps", paint: { "fill-color": "#888" } },
    { id: "roads_minor_casing", type: "line", source: "protomaps", paint: { "line-color": "#000", "line-width": 3 } },
    { id: "roads_minor", type: "line", source: "protomaps", paint: { "line-color": "#f00", "line-width": 2 } },
    { id: "roads_rail", type: "line", source: "protomaps", paint: { "line-color": "#000" } },
    { id: "boundaries", type: "line", source: "protomaps", paint: { "line-color": "#000" } },
    {
      id: "pois",
      type: "symbol",
      source: "protomaps",
      layout: { "text-field": "{name}" },
      paint: { "text-color": "#000" },
    },
    {
      id: "roads_labels_major",
      type: "symbol",
      source: "protomaps",
      layout: { "text-field": "{name}" },
      paint: { "text-color": "#000" },
    },
    {
      id: "places_subplace",
      type: "symbol",
      source: "protomaps",
      layout: { "text-field": "{name}", "text-size": 11 },
      paint: { "text-color": "#000" },
    },
  ],
};

export const square = (x: number, y: number, size: number): Polygon => ({
  type: "Polygon",
  coordinates: [
    [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ],
  ],
});

export const BYRON: [number, number] = [-81.3425, 42.955];
