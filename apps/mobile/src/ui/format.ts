export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const toPercent = (fraction: number): string => `${Math.round(clamp(fraction, 0, 1) * 100)}%`;

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

export const ordinal = (n: number): string => {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
};

export const stepValue = (value: number, delta: number, min: number, max: number): number =>
  clamp(Math.round((value + delta) * 100) / 100, min, max);

/** "today", "3 days ago", "2 weeks ago", "8 months ago", "1 year ago". */
export function agoLabel(iso: string, nowMs: number): string {
  const days = Math.floor((nowMs - Date.parse(iso)) / 86_400_000);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (!Number.isFinite(days) || days < 1) return "today";
  if (days < 14) return plural(days, "day");
  if (days < 60) return plural(Math.floor(days / 7), "week");
  if (days < 365) return plural(Math.floor(days / 30), "month");
  return plural(Math.floor(days / 365), "year");
}
