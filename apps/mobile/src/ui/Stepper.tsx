import { View } from "react-native";
import { colors, radii } from "@/theme";
import { RaisedRoundButton } from "./RaisedRoundButton";
import { Text } from "./Text";

interface StepperTileProps {
  label: string;
  valueText: string;
  onDecrement?: () => void;
  onIncrement?: () => void;
}

/** Grey tile with label, value and white raised round − / + steppers (Crew, Radius, Suggested). */
export function StepperTile({ label, valueText, onDecrement, onIncrement }: StepperTileProps) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg.page,
        borderRadius: radii.row,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <View style={{ flex: 1 }}>
        <Text variant="caption" color={colors.ink.secondary}>
          {label}
        </Text>
        <Text variant="bodyStrong" style={{ fontSize: 15 }}>
          {valueText}
        </Text>
      </View>
      {onDecrement || onIncrement ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          <RaisedRoundButton icon="minus" size={28} onPress={onDecrement} accessibilityLabel={`Decrease ${label}`} />
          <RaisedRoundButton icon="plus" size={28} onPress={onIncrement} accessibilityLabel={`Increase ${label}`} />
        </View>
      ) : null}
    </View>
  );
}
