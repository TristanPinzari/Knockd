import { byScheme } from "@/theme/scheme";

/** Knockd map design tokens (see Figma tokens in the brief). */
export interface MapColours {
  readonly land: string;
  readonly park: string;
  readonly water: string;
  readonly building: string;
  readonly roadFill: string;
  /** Highways and major roads (stand out from minor streets on the dark map). */
  readonly roadMajor: string;
  readonly roadEdge: string;
  readonly hairline: string;
  readonly label: string;
  readonly brand: string;
  readonly houseFill: string;
  readonly houseOutline: string;
  readonly ghostTrail: string;
  readonly white: string;
  /** Under the dashed routes. */
  readonly routeCasing: string;
  /** Door number badges before they're knocked. */
  readonly badgeFill: string;
  readonly badgeText: string;
  /** The car (where routes start). */
  readonly start: string;
}

export const LIGHT_MAP_COLOURS: MapColours = {
  land: "#F6F7F9",
  park: "#DDEFE2",
  water: "#E3ECF5",
  building: "#EEF0F3",
  roadFill: "#FFFFFF",
  roadMajor: "#FFFFFF",
  roadEdge: "#DFE3E8",
  hairline: "#ECEEF2",
  label: "#9AA3AD",
  brand: "#E2381F",
  houseFill: "#FFFFFF",
  houseOutline: "#B9C0C8",
  ghostTrail: "#B9C0C8",
  white: "#FFFFFF",
  routeCasing: "#FFFFFF",
  badgeFill: "#FFFFFF",
  badgeText: "#1F2328",
  start: "#111827",
};

/** Night map: navy land, lavender-grey roads, deep green parks (dark map reference). */
export const DARK_MAP_COLOURS: MapColours = {
  land: "#1A1A24",
  park: "#1D3A2B",
  water: "#1C2B4A",
  building: "#23222E",
  roadFill: "#35314A",
  roadMajor: "#5A5378",
  roadEdge: "#24222F",
  hairline: "#2A2836",
  label: "#B9B6CA",
  brand: "#FF5A1F",
  houseFill: "#2B2938",
  houseOutline: "#45415A",
  ghostTrail: "#5B5870",
  white: "#FFFFFF",
  routeCasing: "#121216",
  badgeFill: "#1B1C1F",
  badgeText: "#F4F4F5",
  start: "#F4F4F5",
};

export const COLOURS: MapColours = byScheme({ light: LIGHT_MAP_COLOURS, dark: DARK_MAP_COLOURS });

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
