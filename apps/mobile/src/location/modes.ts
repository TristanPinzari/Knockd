import type { TrackingMode } from "./types";

export interface TrackingModeConfig {
  /** Maps to expo-location's Accuracy (high = Accuracy.High, balanced = Accuracy.Balanced). */
  accuracy: "high" | "balanced";
  /** Record a point only after moving this far (README: about 10 m). */
  minMoveM: number;
  /** Android: minimum time between OS updates. */
  minIntervalMs: number;
  /** Send queued points to the server at most this often (README: 15 to 30 s). */
  flushIntervalMs: number;
  /** Ignore readings worse than this (metres). */
  maxAccuracyM: number;
}

export const TRACKING_MODES: Readonly<Record<TrackingMode, TrackingModeConfig>> = {
  standard: { accuracy: "high", minMoveM: 10, minIntervalMs: 5_000, flushIntervalMs: 15_000, maxAccuracyM: 100 },
  saver: { accuracy: "balanced", minMoveM: 25, minIntervalMs: 15_000, flushIntervalMs: 30_000, maxAccuracyM: 150 },
};

/** Android foreground-service notification (required for background location). */
export const FOREGROUND_NOTIFICATION = {
  title: "Knockd is tracking your route",
  body: "Your crew can see where you are. Stop tracking from the app when you finish.",
  colour: "#E2381F",
} as const;

/** Shown in the OS permission prompts (put these in app.config.ts infoPlist / permissions text). */
export const PERMISSION_RATIONALE = {
  foreground: "Knockd shows your position on the map for you and your crew.",
  always: "Choose Always so your route keeps recording while the phone is locked in your pocket.",
} as const;
