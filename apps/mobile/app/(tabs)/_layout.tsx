import { Tabs } from "expo-router";
import { TabBar } from "@/ui";

/** TODO(chat): replace with the unread count once chat is wired to the realtime chat store. */
const UNREAD_CHAT = 2;
const TAB_BADGES = { chat: UNREAD_CHAT } as const;

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} badges={TAB_BADGES} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="session" options={{ title: "Session" }} />
      <Tabs.Screen name="chat" options={{ title: "Chat" }} />
      <Tabs.Screen name="leaderboard" options={{ title: "Leaderboard" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
