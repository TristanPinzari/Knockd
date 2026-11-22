import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SessionSettingsCard } from "@/session/SessionSettingsCard";
import { colors } from "@/theme";
import { Button, Card, FlatHeader, Icon, Screen, SectionLabel, SegmentedControl, Switch, Text } from "@/ui";

const BATTERY = [
  { value: "standard", label: "Standard" },
  { value: "saver", label: "Saver" },
] as const;

export default function SettingsScreen() {
  const router = useRouter();
  const [offlineMap, setOfflineMap] = useState(true);
  const [battery, setBattery] = useState<(typeof BATTERY)[number]["value"]>("standard");
  const [leadAlerts, setLeadAlerts] = useState(true);

  return (
    <Screen>
      <FlatHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <SessionSettingsCard />

        <SectionLabel>Offline map</SectionLabel>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" style={{ fontSize: 15 }}>
                Old North
              </Text>
              <Text variant="caption" color={colors.ink.secondary}>
                Downloaded, 38 MB
              </Text>
            </View>
            <Switch value={offlineMap} onValueChange={setOfflineMap} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 16 }}>
            <Text variant="caption" color={colors.ink.secondary} style={{ flex: 1 }}>
              Updated 2 days ago
            </Text>
            {/* TODO(map): wire to createOfflinePack from src/map. */}
            <Button label="Update" variant="smallOutline" />
          </View>
        </Card>

        <SectionLabel>Battery</SectionLabel>
        <Card>
          <SegmentedControl options={BATTERY} value={battery} onChange={setBattery} tone="light" height={36} />
          <Text variant="caption" color={colors.ink.secondary} style={{ marginTop: 12 }}>
            Saver checks your position less often to save battery.
          </Text>
        </Card>

        <SectionLabel>Notifications</SectionLabel>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" style={{ fontSize: 15 }} onPress={() => router.push("/notifications")}>
                Lead alerts
              </Text>
              <Text variant="caption" color={colors.ink.secondary}>
                Tell me when a teammate marks a lead
              </Text>
            </View>
            <Switch value={leadAlerts} onValueChange={setLeadAlerts} />
          </View>
        </Card>

        <SectionLabel>Privacy</SectionLabel>
        <Card>
          <Text variant="body" color={colors.ink.secondary} style={{ fontSize: 15, lineHeight: 23 }}>
            Paths are saved as streets walked, not minute-by-minute locations. Only crew in your session see your live
            dot.
          </Text>
        </Card>

        <SectionLabel>Account</SectionLabel>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" style={{ fontSize: 15 }}>
                Log out
              </Text>
              <Text variant="caption" color={colors.ink.secondary}>
                Signed in as Jas K.
              </Text>
            </View>
            <Icon name="chevron-right" size={20} color={colors.ink.muted} />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
