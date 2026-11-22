import type { PermissionState, TrackingPermission } from "./types";

export interface PermissionResponse {
  status: PermissionState;
  /** false once the OS will no longer show the prompt. */
  canAskAgain: boolean;
}

/** Native permission calls behind an interface so the flow is testable without a device. */
export interface PermissionApi {
  getForeground(): Promise<PermissionResponse>;
  requestForeground(): Promise<PermissionResponse>;
  getBackground(): Promise<PermissionResponse>;
  requestBackground(): Promise<PermissionResponse>;
}

/**
 * Foreground first, then "Always" (iOS asks When-In-Use, then offers the upgrade; Android 11+ needs
 * a separate background prompt). Never asks for background before foreground is granted, and never
 * re-asks something the OS has blocked.
 */
export async function ensureTrackingPermission(api: PermissionApi): Promise<TrackingPermission> {
  let foreground = await api.getForeground();
  if (foreground.status !== "granted") {
    if (!foreground.canAskAgain) return "blocked";
    foreground = await api.requestForeground();
    if (foreground.status !== "granted") return foreground.canAskAgain ? "denied" : "blocked";
  }
  let background = await api.getBackground();
  if (background.status !== "granted" && background.canAskAgain) background = await api.requestBackground();
  return background.status === "granted" ? "always" : "foreground-only";
}
