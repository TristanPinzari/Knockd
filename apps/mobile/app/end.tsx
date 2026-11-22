import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { colors } from "@/theme";
import { Button, Icon, Screen, Text } from "@/ui";

/**
 * End of day (MOBILE.md screen 10). For now it confirms the session is over; per-person stats and
 * "Add to team?" come with build step 8.
 */
export default function EndOfDayScreen() {
  const router = useRouter();
  return (
    <Screen padTop style={styles.screen}>
      <View style={styles.body}>
        <Icon name="check-circle" size={40} color={colors.status.ok} />
        <Text variant="title">Session over</Text>
        <Text variant="body" color={colors.ink.secondary} style={{ textAlign: "center" }}>
          Nice work. Your crew&apos;s stats will show here once the session has been processed.
        </Text>
      </View>
      <Button label="Back to start" onPress={() => router.replace("/")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 24, paddingBottom: 40 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
});
