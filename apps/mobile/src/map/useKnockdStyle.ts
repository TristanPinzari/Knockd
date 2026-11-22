import { useEffect, useState } from "react";
import { DEFAULT_API_URL } from "./constants";
import { applyKnockdTheme, type MapStyle } from "./theme/applyKnockdTheme";

export function styleUrl(): string {
  const base = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;
  return `${base.replace(/\/$/, "")}/tiles/style.json`;
}

function isMapStyle(v: unknown): v is MapStyle {
  return typeof v === "object" && v !== null && Array.isArray((v as { layers?: unknown }).layers);
}

let cached: Promise<string> | null = null;

/** Fetch + theme the server style once per app run. Rejects (and clears the cache) on failure. */
export function loadThemedStyle(url: string = styleUrl(), fetchFn: typeof fetch = fetch): Promise<string> {
  if (cached) return cached;
  const p = fetchFn(url)
    .then((r) => {
      if (!r.ok) throw new Error(`style.json responded ${r.status}`);
      return r.json() as Promise<unknown>;
    })
    .then((json) => {
      if (!isMapStyle(json)) throw new Error("style.json has no layers");
      return JSON.stringify(applyKnockdTheme(json));
    });
  cached = p;
  p.catch(() => {
    cached = null;
  });
  return p;
}

export function resetStyleCache(): void {
  cached = null;
}

/**
 * Themed style JSON string for MapView.mapStyle. While loading, or if the fetch fails
 * (e.g. offline with no cache), falls back to the raw server style URL (unthemed, but cached
 * tiles/offline packs still work). TODO: persist the themed JSON in expo-sqlite/file system.
 */
export function useKnockdStyle(): string {
  const url = styleUrl();
  const [style, setStyle] = useState<string>(url);
  useEffect(() => {
    let alive = true;
    loadThemedStyle(url)
      .then((s) => alive && setStyle(s))
      .catch(() => undefined); // keep the URL fallback; not fatal
    return () => {
      alive = false;
    };
  }, [url]);
  return style;
}
