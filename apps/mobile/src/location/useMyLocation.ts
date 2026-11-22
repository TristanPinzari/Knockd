import { useMyLocationStore } from "./myLocationStore";

/** My latest fix plus tracking state, for the "me" dot and the Settings/permission UI. */
export function useMyLocation() {
  const fix = useMyLocationStore((s) => s.fix);
  const tracking = useMyLocationStore((s) => s.tracking);
  const mode = useMyLocationStore((s) => s.mode);
  const permission = useMyLocationStore((s) => s.permission);
  const error = useMyLocationStore((s) => s.error);
  return { fix, lngLat: fix ? ([fix.lng, fix.lat] as [number, number]) : null, tracking, mode, permission, error };
}
