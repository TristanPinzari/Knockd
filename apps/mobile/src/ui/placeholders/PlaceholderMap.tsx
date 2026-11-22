import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Pattern, Rect } from "react-native-svg";
import { colors } from "@/theme";
import { Pin } from "../Pin";

export interface MapSlotState {
  /** Draw crew-coloured areas and trails (Crew toggle on). */
  crewOn: boolean;
  /** Draw the plain base map only (choose-area screens, lobby). */
  plain?: boolean;
}

interface PlaceholderMapProps extends Partial<MapSlotState> {
  style?: StyleProp<ViewStyle>;
  /** SVG children drawn above the base map in 393x852 screen coordinates. */
  children?: React.ReactNode;
  showLeadDot?: boolean;
}

const W = 393;
const H = 852;
const COLS = [-10, 122, 234, 358, 410] as const;
const ROWS = [118, 205, 313, 425, 525, 640, 760, 900] as const;

function BaseMap() {
  return (
    <G>
      <Rect x={0} y={0} width={W} height={H} fill={colors.bg.map} />
      {COLS.slice(0, -1).flatMap((x, ci) =>
        ROWS.slice(0, -1).map((y, ri) => (
          <Rect
            key={`${ci}-${ri}`}
            x={x + 6}
            y={y + 6}
            width={(COLS[ci + 1] ?? x) - x - 12}
            height={(ROWS[ri + 1] ?? y) - y - 12}
            rx={6}
            fill={colors.bg.map}
            stroke={colors.map.hairline}
            strokeWidth={1}
          />
        )),
      )}
      <Rect x={248} y={222} width={94} height={80} rx={10} fill={colors.map.park} />
      <Rect x={12} y={537} width={94} height={80} rx={10} fill={colors.map.park} />
      <Rect x={228} y={0} width={12} height={H} fill={colors.map.road} stroke={colors.map.roadEdge} strokeWidth={1} />
      <Rect x={0} y={308} width={W} height={10} fill={colors.map.road} stroke={colors.map.roadEdge} strokeWidth={1} />
      <Path d="M-20 640 L420 395" stroke={colors.map.road} strokeWidth={14} />
    </G>
  );
}

const PIN_POSITIONS = [
  { initials: "AV", colour: colors.crew.purple, x: 117, y: 262 },
  { initials: "LP", colour: colors.crew.pink, x: 62, y: 310 },
  { initials: "SM", colour: colors.crew.green, x: 349, y: 265 },
  { initials: "JK", colour: colors.crew.blue, x: 232, y: 415 },
] as const;

/** Grey-ish stand-in for KnockdMap: a static city grid, optional overlay children, optional member pins. */
export function PlaceholderMap({
  style,
  children,
  plain = true,
  crewOn = false,
  showLeadDot = false,
}: PlaceholderMapProps) {
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <BaseMap />
        {children}
        {showLeadDot ? <Rect x={327} y={293} width={8} height={8} rx={4} fill={colors.brand} /> : null}
      </Svg>
      {plain ? null : <PinLayer crewOn={crewOn} />}
    </View>
  );
}

function PinLayer({ crewOn }: { crewOn: boolean }) {
  return (
    <>
      {PIN_POSITIONS.map((pin) => {
        const ghost = !crewOn && pin.initials !== "JK";
        return (
          <View
            key={pin.initials}
            style={{ position: "absolute", left: pin.x - 18, top: pin.y - 40, opacity: ghost ? 0.9 : 1 }}
          >
            <Pin initials={pin.initials} colour={ghost ? pin.colour : pin.colour} />
          </View>
        );
      })}
    </>
  );
}

/** Live-map overlay: my dashed area with hatch fill + thick knocking trail; crew areas/trails when crewOn. */
export function LiveOverlay({ crewOn }: { crewOn: boolean }) {
  const mine = colors.crew.blue;
  return (
    <G>
      <Defs>
        <Pattern id="hatchBlue" width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Line x1={0} y1={0} x2={0} y2={7} stroke={mine} strokeWidth={2} opacity={0.55} />
        </Pattern>
        <ClipPath id="mineSweep">
          <Path d="M177 323 L227 323 L227 505 L132 505 L132 440 L177 400 Z" />
        </ClipPath>
      </Defs>
      <Rect
        x={127}
        y={323}
        width={100}
        height={190}
        rx={10}
        fill="none"
        stroke={mine}
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      <Rect x={127} y={323} width={100} height={190} fill="url(#hatchBlue)" clipPath="url(#mineSweep)" />
      {crewOn ? <CrewAreas /> : <GhostTrails />}
      <Path
        d="M117 625 L117 545 Q117 523 139 523 L215 523 Q232 523 232 505 L232 410"
        stroke={mine}
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </G>
  );
}

function GhostTrails() {
  return (
    <G stroke={colors.border.default} strokeWidth={3} strokeLinecap="round">
      <Path d="M117 262 L117 415" />
      <Path d="M8 313 L118 313" />
      <Path d="M349 265 L349 520" />
    </G>
  );
}

function CrewAreas() {
  const { purple, pink, green } = colors.crew;
  return (
    <G>
      <Rect
        x={127}
        y={140}
        width={100}
        height={165}
        rx={10}
        fill="none"
        stroke={purple}
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      <Rect
        x={10}
        y={323}
        width={105}
        height={190}
        rx={10}
        fill="none"
        stroke={pink}
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      <Rect
        x={247}
        y={220}
        width={100}
        height={295}
        rx={10}
        fill="none"
        stroke={green}
        strokeWidth={2}
        strokeDasharray="5 4"
      />
      <Path d="M117 262 L117 415" stroke={purple} strokeWidth={7} strokeLinecap="round" />
      <Path d="M8 313 L118 313" stroke={pink} strokeWidth={6} strokeLinecap="round" />
      <Path d="M349 265 L349 520" stroke={green} strokeWidth={7} strokeLinecap="round" />
    </G>
  );
}

/** Choose-area overlays in screen coordinates (dashed brand outline, 12% tint). */
export function AreaOverlay({ kind, corners = 6 }: { kind: "polygon" | "circle" | "draw"; corners?: number }) {
  const outline = { stroke: colors.brand, strokeWidth: 2.5, strokeDasharray: "6 5", fill: colors.brandTint } as const;
  const points: readonly (readonly [number, number])[] = [
    [187, 250],
    [321, 292],
    [336, 432],
    [222, 522],
    [80, 470],
    [69, 299],
  ];
  const poly = points.map(([x, y]) => `${x},${y}`).join(" ");
  if (kind === "circle") {
    return (
      <G>
        <Circle cx={196} cy={395} r={133} {...outline} />
        <Circle cx={196} cy={395} r={5} fill={colors.brand} />
      </G>
    );
  }
  return (
    <G>
      <Path d={`M${poly.replace(/ /g, " L").replace(/,/g, " ")} Z`} {...outline} />
      {kind === "draw"
        ? points
            .slice(0, corners)
            .map(([x, y]) => (
              <Rect
                key={`${x}-${y}`}
                x={x - 8}
                y={y - 8}
                width={16}
                height={16}
                rx={8}
                fill={colors.map.road}
                stroke={colors.brand}
                strokeWidth={2.5}
              />
            ))
        : null}
    </G>
  );
}
