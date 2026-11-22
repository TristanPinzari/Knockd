export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_CAP_MS = 5 * 60_000;

/**
 * Exponential backoff with jitter: base * 2^attempts, capped, then scaled into [50%, 100%] so a
 * crew coming back online together does not hit the server in lockstep.
 * `random` is injectable (0..1) for tests.
 */
export function backoffDelayMs(attempts: number, random: () => number = Math.random): number {
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts));
  return Math.round(exp * (0.5 + 0.5 * random()));
}
