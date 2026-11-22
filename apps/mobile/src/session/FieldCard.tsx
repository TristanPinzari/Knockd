/** Session menu → "In the field": battery saver, and whether the area's map is saved for offline use. */
import { View } from "react-native";
import { useOfflineMap } from "../map/useOfflineArea";
import { colors } from "../theme";
import { Card, Divider, SectionLabel } from "../ui/SettingsParts";
import { Switch } from "../ui/Switch";
import { Text } from "../ui/Text";
import { useSessionUi } from "./uiStore";

function offlineText(status: string, percentage: number): string {
  switch (status) {
    case "ready":
      return "Saved: the map works here without signal.";
    case "downloading":
      return `Downloading the area: ${Math.round(percentage)}%`;
    case "failed":
      return "Couldn't download it yet. It'll try again when the area changes.";
    default:
      return "Downloads once the session area is known.";
  }
}

export function FieldCard() {
  const saver = useSessionUi((s) => s.batterySaver);
  const { status, percentage } = useOfflineMap();
  return (
    <>
      <SectionLabel>In the field</SectionLabel>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" style={{ fontSize: 15 }}>
              Battery saver
            </Text>
            <Text variant="caption" color={colors.ink.secondary}>
              Records your path less often. Your dot updates less, trails are rougher.
            </Text>
          </View>
          <Switch value={saver} onValueChange={(on) => useSessionUi.getState().setBatterySaver(on)} />
        </View>
        <Divider />
        <View style={{ gap: 2 }}>
          <Text variant="bodyStrong" style={{ fontSize: 15 }}>
            Offline map
          </Text>
          <Text variant="caption" color={colors.ink.secondary}>
            {offlineText(status, percentage)}
          </Text>
        </View>
      </Card>
    </>
  );
}
