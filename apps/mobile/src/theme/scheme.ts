import { Appearance } from "react-native";

export type ColorScheme = "light" | "dark";

/** EXPO_PUBLIC_COLOR_SCHEME=dark|light forces a scheme (e.g. to preview dark mode in a build that predates it). */
function forced(): ColorScheme | null {
  const value = process.env.EXPO_PUBLIC_COLOR_SCHEME;
  return value === "dark" || value === "light" ? value : null;
}

/**
 * Light or dark, from the phone's appearance setting when the app starts. Stylesheets are built as
 * modules load, so switching the phone's appearance takes effect the next time the app starts.
 */
export const COLOR_SCHEME: ColorScheme = forced() ?? (Appearance.getColorScheme() === "dark" ? "dark" : "light");

export const isDark = COLOR_SCHEME === "dark";

/** Pick the value for the current scheme. */
export const bySchemeOf = <T>(scheme: ColorScheme, values: { light: T; dark: T }): T => values[scheme];
export const byScheme = <T>(values: { light: T; dark: T }): T => bySchemeOf(COLOR_SCHEME, values);
