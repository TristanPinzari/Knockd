/** What to show when logging in fails. Null when the person just closed the login page. */

const CANCELLED = /cancel/i;
const FALLBACK = "Couldn't log in. Try again.";

function field(error: unknown, key: string): string {
  if (typeof error !== "object" || error === null || !(key in error)) return "";
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export function loginErrorMessage(error: unknown): string | null {
  const name = field(error, "name");
  const code = field(error, "code");
  const message = field(error, "message");
  if ([name, code, message].some((s) => CANCELLED.test(s))) return null;
  return message ? `Couldn't log in: ${message}` : FALLBACK;
}
