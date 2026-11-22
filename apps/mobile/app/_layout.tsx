import { Figtree_400Regular, Figtree_500Medium, useFonts } from "@expo-google-fonts/figtree";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { registerLocationTask } from "@/location";
import { hydrateActiveSession, useActiveSession } from "@/session";
import { SessionProvider } from "@/session/SessionProvider";
import { colors, isDark } from "@/theme";

registerLocationTask();
void SplashScreen.preventAutoHideAsync();
void hydrateActiveSession(SecureStore);

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const [fontsLoaded, fontError] = useFonts({ Figtree_400Regular, Figtree_500Medium });
  const sessionHydrated = useActiveSession((state) => state.hydrated);
  const ready = (fontsLoaded || fontError !== null) && sessionHydrated;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <StatusBar style={isDark ? "light" : "dark"} />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg.page } }} />
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
