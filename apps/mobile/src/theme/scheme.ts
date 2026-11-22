import * as SecureStore from "expo-secure-store";
import { Appearance } from "react-native";

export type ColorScheme = "light" | "dark";
/** What the person picked in Settings → Appearance. */
export type AppearancePreference = "system" | ColorScheme;

const PREFERENCE_KEY = "knockd.appearance";

const isScheme = (value: unknown): value is ColorScheme => value === "dark" || value === "light";
const isPreference = (value: unknown): value is AppearancePreference => value === "system" || isScheme(value);

/** The saved Appearance choice ("system" when nothing is saved or storage isn't available). */
export function readAppearancePreference(): AppearancePreference {
  try {
    const saved = SecureStore.getItem(PREFERENCE_KEY);
    return isPreference(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

export async function saveAppearancePreference(preference: AppearancePreference): Promise<void> {
  await SecureStore.setItemAsync(PREFERENCE_KEY, preference);
}

/**
 * Which theme applies: EXPO_PUBLIC_COLOR_SCHEME (for previews) wins, then the Settings choice, then
 * the phone's own appearance.
 */
export function resolveScheme(
  forced: string | undefined,
  preference: AppearancePreference,
  system: string | null | undefined,
): ColorScheme {
  if (isScheme(forced)) return forced;
  if (preference !== "system") return preference;
  return system === "dark" ? "dark" : "light";
}

/**
 * The theme for this run of the app, decided at startup. Stylesheets are built as modules load, so
 * a change in Settings (or in the phone's appearance) applies after the app reloads.
 */
export const COLOR_SCHEME: ColorScheme = resolveScheme(
  process.env.EXPO_PUBLIC_COLOR_SCHEME,
  readAppearancePreference(),
  Appearance.getColorScheme(),
);

export const isDark = COLOR_SCHEME === "dark";
