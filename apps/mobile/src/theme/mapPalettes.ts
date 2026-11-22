/** Map colours per theme: basemap recolour, houses, routes and door badges (see src/map). */
export interface MapColours {
  readonly land: string;
  readonly park: string;
  readonly water: string;
  readonly building: string;
  readonly roadFill: string;
  /** Highways and major roads. */
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
  /** Houses picked with the area brush: the accent, fully opaque. */
  readonly selection: string;
}

/** The original Knockd light map. */
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
  selection: "#E2381F",
};

/**
 * Night map: navy-slate land, thin slate streets, dark green parks, and highways in a softened
 * orange so they guide the eye without competing with crew routes (dark map reference).
 */
export const DARK_MAP_COLOURS: MapColours = {
  land: "#18202B",
  park: "#1C3A2C",
  water: "#1B3150",
  building: "#1F2834",
  roadFill: "#2B3442",
  roadMajor: "rgba(232, 128, 60, 0.55)",
  roadEdge: "#1E2632",
  hairline: "#242D3A",
  label: "#8C96A6",
  brand: "rgba(240, 130, 60, 0.88)",
  houseFill: "#232D3A",
  houseOutline: "#3A4657",
  ghostTrail: "#4A5566",
  white: "#FFFFFF",
  routeCasing: "#121821",
  badgeFill: "#1B2330",
  badgeText: "#E9EDF3",
  start: "#E9EDF3",
  selection: "#F0823C",
};
