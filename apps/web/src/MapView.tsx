import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { config } from "./config";

/** Byron, London: the demo area (densest residential spot). */
const BYRON: [number, number] = [-81.3425, 42.955];

/** A full-size map with our own basemap (tiles served by the API). Layers get added on top later. */
export function MapView() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: `${config.apiUrl}/tiles/style.json`,
      center: BYRON,
      zoom: 15,
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    return () => map.remove();
  }, []);

  return <div ref={container} style={{ position: "absolute", inset: 0 }} />;
}
