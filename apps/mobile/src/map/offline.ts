import { OFFLINE_MAX_ZOOM, OFFLINE_MIN_ZOOM } from "./constants";
import type { Bounds } from "./types";

export interface OfflineProgress {
  percentage: number;
  completedTiles: number;
  requiredTiles: number;
  state: "inactive" | "active" | "complete";
}

export interface OfflinePackOptions {
  name: string;
  bounds: Bounds;
  styleUrl: string;
  minZoom?: number;
  maxZoom?: number;
  onProgress?: (p: OfflineProgress) => void;
  onError?: (message: string) => void;
}

/** Narrow view of MapLibre RN v11's OfflineManager so it can be injected in tests. */
export interface OfflineManagerLike {
  createPack(
    options: {
      mapStyle: string;
      bounds: [number, number, number, number];
      minZoom: number;
      maxZoom: number;
      metadata?: Record<string, unknown>;
    },
    progressListener: (
      pack: unknown,
      status: { percentage: number; completedResourceCount: number; requiredResourceCount: number },
    ) => void,
    errorListener: (pack: unknown, error: { message: string }) => void,
  ): Promise<unknown>;
}

export function clampZoomRange(min = OFFLINE_MIN_ZOOM, max = OFFLINE_MAX_ZOOM): [number, number] {
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.min(22, Math.max(min, max));
  return [lo, hi];
}

function tileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}
function tileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

/** Rough tile count for a bbox across a zoom range (for showing download size). */
export function estimateTileCount(bounds: Bounds, minZoom: number, maxZoom: number): number {
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const w = tileX(bounds.ne[0], z) - tileX(bounds.sw[0], z) + 1;
    const h = tileY(bounds.sw[1], z) - tileY(bounds.ne[1], z) + 1;
    total += Math.max(w, 1) * Math.max(h, 1);
  }
  return total;
}

/** Download the area's tiles (default z12-z17) before heading out. Resolves when the pack is created. */
export async function createOfflinePack(opts: OfflinePackOptions, manager?: OfflineManagerLike): Promise<void> {
  const mgr = manager ?? (await loadManager());
  const [minZoom, maxZoom] = clampZoomRange(opts.minZoom, opts.maxZoom);
  await mgr.createPack(
    {
      mapStyle: opts.styleUrl,
      bounds: [opts.bounds.sw[0], opts.bounds.sw[1], opts.bounds.ne[0], opts.bounds.ne[1]],
      minZoom,
      maxZoom,
      metadata: { name: opts.name },
    },
    (_pack, status) =>
      opts.onProgress?.({
        percentage: status.percentage,
        completedTiles: status.completedResourceCount,
        requiredTiles: status.requiredResourceCount,
        state: status.percentage >= 100 ? "complete" : "active",
      }),
    (_pack, error) => opts.onError?.(error.message || "Offline download failed"),
  );
}

async function loadManager(): Promise<OfflineManagerLike> {
  const mod = await import("@maplibre/maplibre-react-native");
  return mod.OfflineManager as unknown as OfflineManagerLike;
}
