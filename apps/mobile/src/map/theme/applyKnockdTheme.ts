import { COLOURS, LABELS_ANCHOR_ID } from "../constants";

/** Minimal structural types for a MapLibre style (we only touch what we recolour). */
export interface StyleLayer {
  id: string;
  type: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface MapStyle {
  layers: StyleLayer[];
  [key: string]: unknown;
}

const PARK = /(park|green|wood|scrub|forest|grass|golf|cemetery|zoo|pitch|natural)/;
const WATER = /^(water|physical_line_waterway)/;
const HIDDEN = /(^|_)(pois?|poi_label|transit|address|housenumber)(_|$)/;
const PLACE_LABEL = /(places_|place_|subplace|locality|neighbourhood|neighborhood|district|suburb)/;
const RAIL = /(rail|ferry|aerialway)/;
const CASING = /(casing|outline|edge)/;
const BOUNDARY = /boundar/;
const MAJOR = /(highway|major)/;

const merge = (base: Record<string, unknown> | undefined, extra: Record<string, unknown>) => ({ ...base, ...extra });
const hide = (l: StyleLayer): StyleLayer => ({ ...l, layout: merge(l.layout, { visibility: "none" }) });

function themeFill(l: StyleLayer): StyleLayer {
  const id = l.id;
  const paint = (colour: string, extra: Record<string, unknown> = {}) => ({
    ...l,
    paint: merge(l.paint, { "fill-color": colour, ...extra }),
  });
  if (WATER.test(id)) return paint(COLOURS.water);
  if (id.startsWith("landuse_") || id.startsWith("natural_")) {
    return PARK.test(id) ? paint(COLOURS.park) : paint(COLOURS.land);
  }
  if (id.startsWith("earth")) return paint(COLOURS.land);
  if (id.startsWith("building")) return paint(COLOURS.building, { "fill-opacity": 0.7 });
  return l;
}

function themeLine(l: StyleLayer): StyleLayer {
  const id = l.id;
  const paint = (colour: string) => ({ ...l, paint: merge(l.paint, { "line-color": colour }) });
  if (WATER.test(id)) return paint(COLOURS.water);
  if (BOUNDARY.test(id)) return paint(COLOURS.hairline);
  if (!id.startsWith("roads_") && !id.startsWith("road")) return l;
  if (RAIL.test(id)) return paint(COLOURS.hairline);
  if (id.includes("oneway")) return paint(COLOURS.roadEdge);
  if (id.includes("tunnel")) return paint(COLOURS.hairline);
  if (CASING.test(id)) return paint(COLOURS.roadEdge);
  return paint(MAJOR.test(id) ? COLOURS.roadMajor : COLOURS.roadFill);
}

function themeSymbol(l: StyleLayer): StyleLayer {
  if (HIDDEN.test(l.id)) return hide(l);
  const isPlace = PLACE_LABEL.test(l.id);
  return {
    ...l,
    layout: isPlace ? merge(l.layout, { "text-transform": "uppercase", "text-letter-spacing": 0.14 }) : l.layout,
    paint: merge(l.paint, {
      "text-color": COLOURS.label,
      "text-halo-color": COLOURS.land,
      "text-halo-width": 1.2,
    }),
  };
}

/** Rewrite one layer. Pure: returns a new layer object. */
export function themeLayer(l: StyleLayer): StyleLayer {
  switch (l.type) {
    case "background":
      return { ...l, paint: merge(l.paint, { "background-color": COLOURS.land }) };
    case "fill":
      return themeFill(l);
    case "line":
      return themeLine(l);
    case "symbol":
      return themeSymbol(l);
    case "circle":
      return HIDDEN.test(l.id) ? hide(l) : l;
    default:
      return l;
  }
}

/** An invisible layer under the first label: app layers drawn before it sit beneath street names. */
const LABELS_ANCHOR: StyleLayer = { id: LABELS_ANCHOR_ID, type: "background", layout: { visibility: "none" } };

/**
 * Recolour a server (Protomaps "light") style to the Knockd look for the current scheme, and add
 * the labels anchor (see LABELS_ANCHOR_ID). Does not mutate the input.
 */
export function applyKnockdTheme<T extends MapStyle>(style: T): T {
  const layers = style.layers.map(themeLayer);
  const firstLabel = layers.findIndex((l) => l.type === "symbol");
  const at = firstLabel < 0 ? layers.length : firstLabel;
  return { ...style, layers: [...layers.slice(0, at), LABELS_ANCHOR, ...layers.slice(at)] };
}
