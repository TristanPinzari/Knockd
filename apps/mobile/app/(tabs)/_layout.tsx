import { Tabs } from "expo-router";
import { TabBar } from "@/ui";

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="session" options={{ title: "Session" }} />
      <Tabs.Screen name="leaderboard" options={{ title: "Leaderboard" }} />
    </Tabs>
  );
}
