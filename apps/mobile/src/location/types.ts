export type TrackingMode = "standard" | "saver";

/** One GPS reading. `t` is ms since epoch. */
export interface LocationFix {
  lat: number;
  lng: number;
  accuracy: number | null;
  t: number;
}

export type PermissionState = "granted" | "denied" | "undetermined";

export type TrackingPermission =
  | "always" // foreground + background: works with the screen off
  | "foreground-only" // works only while the app is open
  | "denied" // user said no, can ask again
  | "blocked"; // user said no and the OS will not ask again: send them to Settings
