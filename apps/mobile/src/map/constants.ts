import { theme } from "@/theme/themes";

export { DARK_MAP_COLOURS, LIGHT_MAP_COLOURS, type MapColours } from "@/theme/mapPalettes";

/** Map colours for the active theme (see src/theme/themes.ts). */
export const COLOURS = theme.map;

export const OUTSKIRTS_OPACITY = 0.12;
/** Below this zoom the outskirts tint is fully visible; it fades out by FADE_END. */
export const OUTSKIRTS_FADE_START = 14.5;
export const OUTSKIRTS_FADE_END = 16;

export const MIN_ZOOM = 10;
export const MAX_ZOOM = 19;
/** Houses are drawn from this zoom. */
export const HOUSE_MIN_ZOOM = 15;
/** Fraction of the work-area bounds added as camera clamp padding. */
export const BOUNDS_PADDING_RATIO = 0.25;

export const HOUSE_SIZE_M = 7;
export const HOUSE_CORNER_RADIUS_M = 1.8;
export const HOUSE_HIT_RADIUS_PX = 16;
export const HATCH_SPACING_M = 9;
export const MAX_HATCH_LINES = 300;

export const METRES_PER_DEG_LAT = 111_320;

export const DEFAULT_API_URL = "https://api.knockd.rodeo";
export const HOUSES_HIT_LAYER_ID = "knockd-houses-hit";

/** Offline pack zoom range (server tiles go to z15; MapLibre overzooms above). */
export const OFFLINE_MIN_ZOOM = 12;
export const OFFLINE_MAX_ZOOM = 17;
