/**
 * The Knockd themes. Each theme is one object with the app colours and the map colours, so adding
 * or tweaking a theme happens in one place. Screens use `colors` (and the map uses `theme.map`)
 * for whichever theme is active.
 */
import { darkColors, lightColors, type Palette } from "./colors";
import { DARK_MAP_COLOURS, LIGHT_MAP_COLOURS, type MapColours } from "./mapPalettes";
import { COLOR_SCHEME, type ColorScheme } from "./scheme";

export interface Theme {
  readonly name: ColorScheme;
  /** Shown in Settings → Appearance. */
  readonly label: string;
  readonly colors: Palette;
  readonly map: MapColours;
}

export const themes: Readonly<Record<ColorScheme, Theme>> = {
  light: { name: "light", label: "Light", colors: lightColors, map: LIGHT_MAP_COLOURS },
  dark: { name: "dark", label: "Dark", colors: darkColors, map: DARK_MAP_COLOURS },
};

/** The active theme for this run of the app. */
export const theme: Theme = themes[COLOR_SCHEME];

export const colors: Palette = theme.colors;
export const CREW_COLOURS: readonly string[] = Object.values(colors.crew);
