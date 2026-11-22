/** API base URL from the Expo env (EXPO_PUBLIC_API_URL, see docs/MOBILE.md). Read lazily so tests can run without it. */
export function getApiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) throw new Error("EXPO_PUBLIC_API_URL is not set (see apps/mobile/.env.example)");
  return url.replace(/\/+$/, "");
}
