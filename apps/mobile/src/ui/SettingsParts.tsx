import { View } from "react-native";
import { colors, radii } from "@/theme";
import { Text } from "./Text";
import { Tile } from "./Tile";

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text variant="label" color={colors.ink.secondary} style={{ marginTop: 8, marginBottom: 8 }}>
      {children}
    </Text>
  );
}

export function Card({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  return (
    <Tile radius={radii.card} bordered={false} style={padded ? { padding: 16 } : { overflow: "hidden" }}>
      {children}
    </Tile>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border.soft }} />;
}
