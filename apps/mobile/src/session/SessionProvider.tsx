/**
 * Mounts the realtime side of the active session: the socket (which keeps the crew/trails/leads
 * stores live), my member id, and location tracking. Renders nothing extra when there is no
 * session, so the demo keeps working. Shows a small dismissible notice when location is limited.
 */
import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { startTracking } from "../location";
import { useMyLocationStore } from "../location/myLocationStore";
import { logger } from "../realtime/logger";
import { useCrewStore } from "../realtime/stores/crewStore";
import { useSessionStore } from "../realtime/stores/sessionStore";
import { useSessionSocket } from "../realtime/useSessionSocket";
import { useSessionUi } from "../mock/sessionStore";
import { colors, pill, shadows } from "../theme";
import { Text } from "../ui/Text";
import { useActiveSession, type ActiveSession } from "./activeSessionStore";
import { sessionLifecycle } from "./defaultDeps";
import { locationNotice } from "./locationNotice";

const NOTICE_TOP_OFFSET = 64;

function useTracking(active: ActiveSession | null): void {
  const sessionId = active?.sessionId ?? null;
  const token = active?.token ?? null;
  useEffect(() => {
    if (!sessionId || !token) return;
    startTracking(sessionId, token, "standard").catch((error: unknown) => {
      logger.error("session: could not start tracking", error);
      useMyLocationStore.getState().setError("Could not start tracking");
    });
  }, [sessionId, token]);
}

/** Members' phones learn the session ended from the socket: clean up and show the summary. */
function useEndedWatcher(active: ActiveSession | null): void {
  const status = useSessionStore((s) => s.status);
  useEffect(() => {
    if (!active || status === "live") return;
    void sessionLifecycle.teardown().then(() => router.replace("/summary"));
  }, [active, status]);
}

function LocationNoticeBanner() {
  const insets = useSafeAreaInsets();
  const permission = useMyLocationStore((s) => s.permission);
  const error = useMyLocationStore((s) => s.error);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const notice = locationNotice(permission, error);
  if (!notice || dismissedKey === notice.message) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + NOTICE_TOP_OFFSET }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={notice.openSettings ? "Opens Settings" : "Dismisses this notice"}
        onPress={() => {
          if (notice.openSettings) void Linking.openSettings();
          setDismissedKey(notice.message);
        }}
        style={styles.pill}
      >
        <View style={styles.dot} />
        <Text variant="label" style={styles.text}>
          {notice.message}
        </Text>
      </Pressable>
    </View>
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const active = useActiveSession((s) => s.active);
  useSessionSocket(active?.token ?? null);
  const memberId = active?.memberId ?? null;
  useEffect(() => {
    if (!memberId) return;
    useCrewStore.getState().setMe(memberId);
    useSessionUi.getState().setSessionLive(true);
  }, [memberId]);
  useTracking(active);
  useEndedWatcher(active);

  return (
    <>
      {children}
      {active ? <LocationNoticeBanner /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  pill: {
    minHeight: 32,
    borderRadius: pill(32),
    paddingHorizontal: 14,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bg.card,
    ...shadows.card,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.status.amber },
  text: { flexShrink: 1 },
});
