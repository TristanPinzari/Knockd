import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState, type RefObject } from "react";
import { config } from "./config";
import { useTheme, type Theme } from "./theme";

// MapLibre looks for its worker next to its own file, but Vite moves that file (dev and build),
// so ship the worker as a file of its own and say where it is.
maplibregl.setWorkerUrl(workerUrl);

/** Byron, London: the demo area (densest residential spot). */
export const BYRON: [number, number] = [-81.3425, 42.955];

const styleUrl = (theme: Theme) => `${config.apiUrl}/tiles/${theme === "dark" ? "style-dark" : "style"}.json`;

/**
 * Creates a MapLibre map with our basemap in `container`, in the current light/dark theme.
 * Returns the map once its style has loaded, and `styleKey`, which changes every time a basemap
 * finishes loading. Switching theme replaces the style, which removes any layers added on top:
 * screens re-add theirs in MapLibre's "style.load" event, and reload their data when `styleKey` changes.
 */
export function useMap(container: RefObject<HTMLDivElement | null>, options: { interactive?: boolean } = {}) {
  const { theme } = useTheme();
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [styleKey, setStyleKey] = useState(0);
  const interactive = options.interactive ?? true;
  const initialTheme = useRef(theme);

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: styleUrl(initialTheme.current),
      center: BYRON,
      zoom: 15,
      interactive,
      attributionControl: { compact: true },
    });
    if (interactive) m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    const stopMiddlePan = interactive ? middleButtonPan(m) : () => {};
    m.on("style.load", () => setStyleKey((k) => k + 1));
    // A server without the dark style (not deployed yet): fall back to the light basemap, once
    // (the failed request can be reported more than once).
    let fellBack = false;
    m.on("error", (e) => {
      const url = String((e.error as { url?: string } | undefined)?.url ?? "");
      if (fellBack || !url.includes("/tiles/style-dark.json")) return;
      fellBack = true;
      m.setStyle(styleUrl("light"), { diff: false });
    });
    m.on("load", () => setMap(m));
    return () => {
      stopMiddlePan();
      setMap(null);
      m.remove();
    };
  }, [container, interactive]);

  // Theme switched: load the other basemap (diff off, so it fully reloads and fires style.load).
  useEffect(() => {
    if (!map || initialTheme.current === theme) return;
    initialTheme.current = theme;
    map.setStyle(styleUrl(theme), { diff: false });
  }, [map, theme]);

  return { map, styleKey, theme };
}

/**
 * Hold the middle mouse button (press the scroll wheel) and drag to pan. Works even while a drawing
 * tool is on, when a left-drag draws instead. Also stops the browser's middle-click autoscroll on
 * the map. Returns a function that removes it.
 */
function middleButtonPan(map: maplibregl.Map): () => void {
  const el = map.getCanvasContainer();
  let last: { x: number; y: number } | null = null;

  const down = (e: MouseEvent) => {
    if (e.button !== 1) return;
    e.preventDefault(); // no autoscroll
    last = { x: e.clientX, y: e.clientY };
    el.style.cursor = "grabbing";
  };
  const move = (e: MouseEvent) => {
    if (!last) return;
    map.panBy([last.x - e.clientX, last.y - e.clientY], { duration: 0 });
    last = { x: e.clientX, y: e.clientY };
  };
  const up = (e: MouseEvent) => {
    if (e.button !== 1 || !last) return;
    last = null;
    el.style.cursor = "";
  };
  const noAux = (e: MouseEvent) => e.button === 1 && e.preventDefault();

  el.addEventListener("mousedown", down);
  el.addEventListener("auxclick", noAux);
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
  return () => {
    el.removeEventListener("mousedown", down);
    el.removeEventListener("auxclick", noAux);
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
  };
}

/** A full-size map (e.g. behind the landing page). */
export function MapView({ interactive = true }: { interactive?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useMap(ref, { interactive });
  return <div ref={ref} className="map-canvas" />;
}
