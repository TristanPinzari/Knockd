import { byScheme } from "./scheme";

/** App colours. Light: Knockd brand. Dark: near-black greys with a bright orange accent (ride-share app reference). */
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

export const darkColors: Palette = {
  // Near-black greys, thin grey outlines and a bright orange accent (ride-share app reference).
  bg: { page: "#0E0F11", card: "#1B1C1F", map: "#1A1A24" },
  ink: { primary: "#F5F5F6", secondary: "#9B9EA4", muted: "#686B71", onBrand: "#FFFFFF" },
  border: { default: "#303236", soft: "#232528" },
  brand: "#FF5A1F",
  brandTint: "rgba(255, 90, 31, 0.18)",
  routeBlue: "#6FB0FF",
  // Brighter crew colours so routes and houses read on the dark map.
  crew: { blue: "#4D94FF", green: "#2FD27A", purple: "#A47DFF", pink: "#F25AB0" },
  map: { park: "#1D3A2B", road: "#3B3752", roadEdge: "#2A2738", hairline: "#2A2836", label: "#B9B6CA" },
  status: { ok: "#2FD27A", amber: "#F2B636" },
  track: "#2A2C30",
  disabledFill: "#24262A",
  blueTint: "#1E2228",
  scrim: "rgba(0, 0, 0, 0.6)",
  gradeFills: ["#3A1D12", "#7A3214", "#C2461A"],
  shadow: "#000000",
};

export const colors: Palette = byScheme({ light: lightColors, dark: darkColors });

export type CrewColourKey = keyof Palette["crew"];
export const CREW_COLOURS: readonly string[] = Object.values(colors.crew);
