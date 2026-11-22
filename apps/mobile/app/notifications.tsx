import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { colors, radii, shadows } from "@/theme";
import { Card, Divider, FlatHeader, Icon, Screen, SectionLabel, Switch, Text, type IconName } from "@/ui";

interface AlertSetting {
  key: string;
  icon: IconName;
  title: string;
  detail: string;
  initial: boolean;
}

const ALERTS: readonly AlertSetting[] = [
  { key: "lead", icon: "star", title: "Lead alerts", detail: "When a teammate logs a lead", initial: true },
  {
    key: "passed",
    icon: "trending-up",
    title: "Someone passes me",
    detail: "When a teammate takes your place on the leaderboard",
    initial: true,
  },
  { key: "chat", icon: "message-circle", title: "Chat messages", detail: "New messages from your crew", initial: true },
  {
    key: "crew",
    icon: "users",
    title: "Crew joins and leaves",
    detail: "When someone joins or leaves a session",
    initial: false,
  },
];

export default function NotificationSettingsScreen() {
  const [values, setValues] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ALERTS.map((a) => [a.key, a.initial])),
  );
  const [sessionOnly, setSessionOnly] = useState(true);
  const toggle = (key: string, next: boolean) => setValues((current) => ({ ...current, [key]: next }));

  return (
    <Screen>
      <FlatHeader title="Notifications" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <SectionLabel>Alerts</SectionLabel>
        <Card padded={false}>
          {ALERTS.map((alert, index) => (
            <View key={alert.key}>
              {index ? <Divider /> : null}
              <SettingRow
                icon={alert.icon}
                title={alert.title}
                detail={alert.detail}
                value={values[alert.key] ?? false}
                onChange={(next) => toggle(alert.key, next)}
              />
            </View>
          ))}
        </Card>
        <SectionLabel>Only during sessions</SectionLabel>
        <Card padded={false}>
          <SettingRow
            icon="moon"
            title="Session-only alerts"
            detail="Silence everything when no session is live."
            value={sessionOnly}
            onChange={setSessionOnly}
          />
        </Card>
        <SectionLabel>Preview</SectionLabel>
        <View style={styles.preview}>
          <View style={styles.previewIcon}>
            <Icon name="arrow-up" size={20} color={colors.ink.onBrand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Sam passed you</Text>
            <Text variant="caption" color={colors.ink.secondary}>
              You&apos;re now 2nd in leads. 1 lead to take it back.
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

interface SettingRowProps {
  icon: IconName;
  title: string;
  detail: string;
  value: boolean;
  onChange: (next: boolean) => void;
}

function SettingRow({ icon, title, detail, value, onChange }: SettingRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Icon name={icon} size={18} color={colors.ink.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" color={colors.ink.secondary}>
          {detail}
        </Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg.page,
    alignItems: "center",
    justifyContent: "center",
  },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: radii.row,
    backgroundColor: colors.bg.card,
    ...shadows.card,
  },
  previewIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.crew.green,
    alignItems: "center",
    justifyContent: "center",
  },
});
