import { G, Rect } from "react-native-svg";
import { colors } from "@/theme";

interface AreaBlock {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  colour: string | null;
}

const BLOCKS: readonly AreaBlock[] = [
  { id: "ava", x: 10, y: 122, w: 105, h: 213, colour: colors.crew.purple },
  { id: "leo", x: 10, y: 335, w: 105, h: 200, colour: colors.crew.pink },
  { id: "jas", x: 116, y: 122, w: 237, h: 108, colour: colors.crew.blue },
  { id: "sam", x: 116, y: 230, w: 118, h: 208, colour: colors.crew.green },
  { id: "free", x: 234, y: 335, w: 119, h: 200, colour: null },
];

const TICK_COUNT = 9;

/** Static team-area blocks (screen coordinates) with dotted "houses" along the edges. */
export function TeamAreasOverlay({ selectedId = "jas" }: { selectedId?: string }) {
  return (
    <G>
      {BLOCKS.map((block) => {
        const colour = block.colour ?? colors.ink.muted;
        const selected = block.id === selectedId;
        return (
          <G key={block.id}>
            <Rect
              x={block.x}
              y={block.y}
              width={block.w}
              height={block.h}
              fill={colour}
              fillOpacity={0.16}
              stroke={colour}
              strokeWidth={selected ? 4 : 1.5}
              strokeDasharray={block.colour ? undefined : "5 4"}
            />
            {Array.from({ length: TICK_COUNT }, (_, i) => (
              <Rect
                key={i}
                x={block.x + 8 + (i * (block.w - 24)) / (TICK_COUNT - 1)}
                y={block.y + 6}
                width={9}
                height={5}
                rx={2}
                fill={i % 3 === 0 ? colour : colors.bg.card}
                stroke={colour}
                strokeWidth={1}
              />
            ))}
          </G>
        );
      })}
    </G>
  );
}
