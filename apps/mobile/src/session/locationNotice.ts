/** Copy for the small location notice shown while a session is active. */
import type { TrackingPermission } from "../location/types";

export interface LocationNotice {
  message: string;
  /** Offer a link to the OS settings (the OS will not prompt again). */
  openSettings: boolean;
}

export function locationNotice(
  permission: TrackingPermission | null,
  startError: string | null,
): LocationNotice | null {
  if (permission === "blocked") {
    return {
      message: "Location is off for Knockd. Turn it on in Settings so your crew can see you.",
      openSettings: true,
    };
  }
  if (permission === "denied") {
    return { message: "Location is off, so your path and dot won't show for the crew.", openSettings: false };
  }
  if (startError) return { message: "Couldn't start location. Your path isn't being saved.", openSettings: false };
  if (permission === "foreground-only") {
    return { message: 'Tracking only while Knockd is open. Allow "Always" to keep tracking.', openSettings: true };
  }
  return null;
}
