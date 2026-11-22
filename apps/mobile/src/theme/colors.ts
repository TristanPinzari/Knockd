/** App colour palettes. The active one comes from the theme (see themes.ts). */
export interface Palette {
  readonly bg: { readonly page: string; readonly card: string; readonly map: string };
  readonly ink: {
    readonly primary: string;
    readonly secondary: string;
    readonly muted: string;
    readonly onBrand: string;
  };
  readonly border: { readonly default: string; readonly soft: string };
  readonly brand: string;
  readonly brandTint: string;
  readonly routeBlue: string;
  readonly crew: { readonly blue: string; readonly green: string; readonly purple: string; readonly pink: string };
  readonly map: {
    readonly park: string;
    readonly road: string;
    readonly roadEdge: string;
    readonly hairline: string;
    readonly label: string;
  };
  readonly status: { readonly ok: string; readonly amber: string };
  readonly track: string;
  readonly disabledFill: string;
  readonly blueTint: string;
  readonly scrim: string;
  /** Summary grade fills, lightest to strongest. */
  readonly gradeFills: readonly [string, string, string];
  readonly shadow: string;
}

export const lightColors: Palette = {
  bg: { page: "#F4F6F8", card: "#FFFFFF", map: "#F6F7F9" },
  ink: { primary: "#111418", secondary: "#6B7480", muted: "#9AA3AD", onBrand: "#FFFFFF" },
  border: { default: "#D5DAE0", soft: "#E6EAEE" },
  brand: "#E2381F",
  brandTint: "rgba(226, 56, 31, 0.12)",
  routeBlue: "#63A4F4",
  crew: { blue: "#1F6FD6", green: "#0E8A5B", purple: "#7C4DDB", pink: "#C73A8A" },
  map: { park: "#DDEFE2", road: "#FFFFFF", roadEdge: "#DFE3E8", hairline: "#ECEEF2", label: "#9AA3AD" },
  status: { ok: "#2DB16F", amber: "#E0A81A" },
  track: "#E6EAEE",
  disabledFill: "#E6EAEE",
  blueTint: "#DCE8F8",
  scrim: "rgba(17, 20, 24, 0.4)",
  gradeFills: ["#DCE8F8", "#C7D8EF", "#A5BAD8"],
  shadow: "#0B1B2B",
};

/** Night: navy-slate surfaces matching the dark map, with a softened orange accent. */
export const darkColors: Palette = {
  bg: { page: "#121821", card: "#1B2330", map: "#18202B" },
  ink: { primary: "#E9EDF3", secondary: "#929CAC", muted: "#5F6979", onBrand: "#FFFFFF" },
  border: { default: "#2E3846", soft: "#222B38" },
  // The orange at 88% so it reads a touch softer on navy than the light theme's red-orange.
  brand: "rgba(240, 130, 60, 0.88)",
  brandTint: "rgba(240, 130, 60, 0.16)",
  routeBlue: "#6FB0FF",
  // Brighter crew colours so routes and houses read on the dark map.
  crew: { blue: "#4D94FF", green: "#3DD68C", purple: "#A47DFF", pink: "#F25AB0" },
  map: { park: "#1C3A2C", road: "#2B3442", roadEdge: "#1E2632", hairline: "#242D3A", label: "#8C96A6" },
  status: { ok: "#3DD68C", amber: "#F2B636" },
  track: "#273040",
  disabledFill: "#222B38",
  blueTint: "#1C2A3C",
  scrim: "rgba(0, 0, 0, 0.6)",
  gradeFills: ["#3A2A1E", "#6E3F1E", "#B0602A"],
  shadow: "#000000",
};

export type CrewColourKey = keyof Palette["crew"];
