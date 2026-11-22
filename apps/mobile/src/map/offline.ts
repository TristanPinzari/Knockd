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
  /** Extra metadata saved with the pack (e.g. which session it is for). */
  metadata?: Record<string, unknown>;
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
  getPacks(): Promise<{ id: string; metadata: Record<string, unknown> }[]>;
  deletePack(id: string): Promise<void>;
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
export async function createOfflinePack(
  opts: OfflinePackOptions,
  manager?: Pick<OfflineManagerLike, "createPack">,
): Promise<void> {
  const mgr = manager ?? (await loadManager());
  const [minZoom, maxZoom] = clampZoomRange(opts.minZoom, opts.maxZoom);
  await mgr.createPack(
    {
      mapStyle: opts.styleUrl,
      bounds: [opts.bounds.sw[0], opts.bounds.sw[1], opts.bounds.ne[0], opts.bounds.ne[1]],
      minZoom,
      maxZoom,
      metadata: { name: opts.name, ...opts.metadata },
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

/** How far past the session area the offline map reaches, so the edge isn't blank. */
export const OFFLINE_MARGIN_M = 300;

export interface SessionPackPlan {
  /** Name for the pack this session needs now. */
  readonly name: string;
  /** Packs to delete: other sessions', and this session's smaller ones from before the area grew. */
  readonly remove: readonly string[];
  /** False when a pack covering the area already exists. */
  readonly create: boolean;
}

/**
 * Which offline pack the session needs: one per session, replaced (bigger) when the working area
 * grows, so only the current session's area is kept on the phone.
 */
export function planSessionPack(
  packs: readonly { id: string; metadata: Record<string, unknown> }[],
  sessionId: string,
  radiusM: number,
): SessionPackPlan {
  const name = `knockd-${sessionId}-${Math.round(radiusM)}`;
  const ours = packs.filter((p) => typeof p.metadata.name === "string" && p.metadata.name.startsWith("knockd-"));
  const has = ours.some((p) => p.metadata.name === name);
  return { name, create: !has, remove: ours.filter((p) => p.metadata.name !== name).map((p) => p.id) };
}

/** Square bounds around a circle of `radiusM` (plus the margin). */
export function circleBounds(centre: { lat: number; lng: number }, radiusM: number): Bounds {
  const r = radiusM + OFFLINE_MARGIN_M;
  const dLat = r / 111_320;
  const dLng = r / (111_320 * Math.cos((centre.lat * Math.PI) / 180));
  return { sw: [centre.lng - dLng, centre.lat - dLat], ne: [centre.lng + dLng, centre.lat + dLat] };
}

/** Downloads the session area's map for offline use (if not already there), removing older packs. */
export async function ensureSessionPack(
  opts: {
    sessionId: string;
    centre: { lat: number; lng: number };
    radiusM: number;
    styleUrl: string;
    onProgress?: (p: OfflineProgress) => void;
    onError?: (message: string) => void;
  },
  manager?: OfflineManagerLike,
): Promise<"created" | "exists"> {
  const mgr = manager ?? (await loadManager());
  const plan = planSessionPack(await mgr.getPacks(), opts.sessionId, opts.radiusM);
  for (const id of plan.remove) await mgr.deletePack(id);
  if (!plan.create) {
    opts.onProgress?.({ percentage: 100, completedTiles: 0, requiredTiles: 0, state: "complete" });
    return "exists";
  }
  await createOfflinePack(
    {
      name: plan.name,
      bounds: circleBounds(opts.centre, opts.radiusM),
      styleUrl: opts.styleUrl,
      onProgress: opts.onProgress,
      onError: opts.onError,
      metadata: { sessionId: opts.sessionId },
    },
    mgr,
  );
  return "created";
}
