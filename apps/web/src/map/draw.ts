/**
 * Freehand drawing on the team map, like a highlighter: drag to draw a stroke (a road to do) or a
 * loop (an area). While a drawing tool is on, dragging draws instead of moving the map.
 */
import type { FeatureCollection } from "geojson";
import type * as maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

export type DrawTool = "line" | "area" | "note";
type LngLat = [number, number];

/** Points closer than this on screen are skipped while drawing (pixels). */
const MIN_STEP_PX = 4;
/** Stored shapes are thinned to at most this many points. */
const MAX_POINTS = 300;

const DRAFT = "draft";
const empty: FeatureCollection = { type: "FeatureCollection", features: [] };

/** Adds the preview layer for the stroke being drawn (call after each basemap load). */
export function addDraftLayer(map: maplibregl.Map) {
  if (map.getSource(DRAFT)) return;
  map.addSource(DRAFT, { type: "geojson", data: empty });
  map.addLayer({
    id: DRAFT,
    type: "line",
    source: DRAFT,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "colour"], "line-width": 14, "line-opacity": 0.5 },
  });
}

/**
 * Freehand strokes and loops while `tool` is "line" or "area", single clicks while it's "note".
 * Finished shapes go to `onLine` / `onArea` / `onPoint`.
 */
export function useDrawing(
  map: maplibregl.Map | null,
  tool: DrawTool | null,
  colour: string,
  handlers: {
    onLine: (coords: LngLat[]) => void;
    onArea: (ring: LngLat[]) => void;
    onPoint: (at: { lat: number; lng: number }) => void;
  },
) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!map || !tool) return;
    const canvas = map.getCanvasContainer();

    if (tool === "note") {
      canvas.style.cursor = "crosshair";
      const click = (e: maplibregl.MapMouseEvent) => latest.current.onPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      map.on("click", click);
      return () => {
        map.off("click", click);
        canvas.style.cursor = "";
      };
    }

    map.dragPan.disable();
    canvas.style.cursor = "crosshair";
    let stroke: { px: [number, number][]; coords: LngLat[] } | null = null;

    const preview = () => {
      const src = map.getSource(DRAFT) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      if (!stroke || stroke.coords.length < 2) return src.setData(empty);
      const coords = tool === "area" ? [...stroke.coords, stroke.coords[0]!] : stroke.coords;
      src.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { colour }, geometry: { type: "LineString", coordinates: coords } }],
      });
    };
    const add = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      if (!stroke) return;
      const last = stroke.px[stroke.px.length - 1];
      const p: [number, number] = [e.point.x, e.point.y];
      if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < MIN_STEP_PX) return;
      stroke.px.push(p);
      stroke.coords.push([e.lngLat.lng, e.lngLat.lat]);
      preview();
    };
    const start = (e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent) => {
      if ("originalEvent" in e && e.originalEvent instanceof MouseEvent && e.originalEvent.button !== 0) return;
      e.preventDefault();
      stroke = { px: [], coords: [] };
      add(e);
    };
    const end = () => {
      if (!stroke) return;
      const coords = thin(stroke.coords, MAX_POINTS);
      stroke = null;
      preview();
      if (tool === "line" && coords.length >= 2) latest.current.onLine(coords);
      if (tool === "area" && coords.length >= 3) latest.current.onArea(coords);
    };

    map.on("mousedown", start);
    map.on("mousemove", add);
    map.on("mouseup", end);
    map.on("touchstart", start);
    map.on("touchmove", add);
    map.on("touchend", end);
    return () => {
      map.off("mousedown", start);
      map.off("mousemove", add);
      map.off("mouseup", end);
      map.off("touchstart", start);
      map.off("touchmove", add);
      map.off("touchend", end);
      map.dragPan.enable();
      canvas.style.cursor = "";
      stroke = null;
      preview();
    };
  }, [map, tool, colour]);
}

/** Keep at most `max` points, always keeping the first and last. */
function thin(points: LngLat[], max: number): LngLat[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]!);
}

// ---------- Areas: make sure the loop doesn't cross itself ----------

/** A closed ring that doesn't cross itself: the drawn loop if it's clean, otherwise its outline (convex hull). */
export function cleanRing(points: LngLat[]): LngLat[] {
  const ring = crossesItself(points) ? convexHull(points) : points;
  return [...ring, ring[0]!];
}

function crossesItself(pts: LngLat[]): boolean {
  const n = pts.length;
  const seg = (i: number): [LngLat, LngLat] => [pts[i]!, pts[(i + 1) % n]!];
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // neighbours through the closing edge
      if (intersects(seg(i), seg(j))) return true;
    }
  return false;
}

function intersects([a, b]: [LngLat, LngLat], [c, d]: [LngLat, LngLat]) {
  const cross = (p: LngLat, q: LngLat, r: LngLat) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Andrew's monotone chain. */
function convexHull(points: LngLat[]): LngLat[] {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: LngLat, a: LngLat, b: LngLat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: LngLat[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: LngLat[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
