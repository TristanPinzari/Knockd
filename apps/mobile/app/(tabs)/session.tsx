import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEMO_CENTRE, useSessionUi } from "@/mock";
import { colors, pill, shadows } from "@/theme";
import {
  BottomSheet,
  Button,
  Icon,
  LEAD_GESTURE,
  LeadAlertBanner,
  LeadSheet,
  OfflinePill,
  PassedBanner,
  ProgressBar,
  RaisedRoundButton,
  Screen,
  Switch,
  Text,
  toPercent,
} from "@/ui";
import { useMyLocation } from "@/location";
import type { KnockdMapHandle } from "@/map";
import { LiveMap, useLiveMapData } from "@/ui/liveMap";
import { doorsFor } from "@/routes";
import { overtakeCopy, pendingLabel, useLiveStatus } from "@/session/useLiveStatus";
import { useActiveSession } from "@/session";
import { useSuggestRoutes } from "@/session/useSuggestRoutes";

type Scenario = "default" | "offline" | "lead" | "passed";
/** Until the sheet is measured. */
const DEFAULT_SHEET_HEIGHT = 134;
const CONTROLS_GAP = 16;

export default function LiveMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scenario = "default" } = useLocalSearchParams<{ scenario?: Scenario }>();
  const crewOn = useSessionUi((state) => state.crewOn);
  const setCrewOn = useSessionUi((state) => state.setCrewOn);
  const [leadOpen, setLeadOpen] = useState(false);
  // The map buttons sit just above the bottom sheet, which grows when it shows the Suggest button.
  const [sheetHeight, setSheetHeight] = useState(DEFAULT_SHEET_HEIGHT);
  const { data, mapKey } = useLiveMapData();
  const inSession = useActiveSession((state) => state.active !== null);
  const suggest = useSuggestRoutes();
  const needsRoutes = inSession && data.routes.groups.length === 0;
  const progress = data.crew.map((member) => {
    const doors = doorsFor(data.routes, member.memberId);
    return { ...member, value: doors.total > 0 ? doors.knocked / doors.total : 0 };
  });
  const me = progress.find((member) => member.isMe);
  const live = useLiveStatus();
  const offline = scenario === "offline" || live.offline;
  const pendingText = scenario === "offline" ? "3 leads and your path waiting to sync" : pendingLabel(live.pending);
  const passed = live.overtake ? overtakeCopy(live.overtake) : scenario === "passed" ? {} : null;
  const bannerTop = insets.top + 100;
  const openLead = () => setLeadOpen(true);
  const mapRef = useRef<KnockdMapHandle>(null);
  const { lngLat } = useMyLocation();
  const centreOnMe = () => {
    const [lng, lat] = lngLat ?? DEMO_CENTRE;
    mapRef.current?.recenter(lng, lat, 17);
  };

  return (
    <Screen>
      <LiveMap
        ref={mapRef}
        data={data}
        mapKey={mapKey}
        crewOn={crewOn}
        onHousePress={LEAD_GESTURE === "tap" ? openLead : undefined}
        onHouseLongPress={LEAD_GESTURE === "longPress" ? openLead : undefined}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topRow}>
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {crewOn ? "Section progress" : `Your section, ${toPercent(me?.value ?? 0)}`}
          </Text>
          <Text variant="body" color={colors.ink.secondary} style={{ marginRight: 8 }}>
            Crew
          </Text>
          <Switch value={crewOn} onValueChange={setCrewOn} />
        </View>
        {crewOn ? (
          <View style={styles.bars}>
            {progress.map((member) => (
              <View key={member.memberId} style={{ flex: 1, gap: 3 }}>
                <ProgressBar value={member.value} colour={member.colour} height={5} />
                <Text variant="caption" color={colors.ink.secondary}>
                  {member.initials} {toPercent(member.value)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <ProgressBar value={me?.value ?? 0} height={6} style={{ marginTop: 8 }} />
        )}
      </View>

      {offline ? <OfflinePill top={insets.top + 100} /> : null}
      {scenario === "lead" ? <LeadAlertBanner top={bannerTop} /> : null}
      {passed ? (
        <PassedBanner
          top={bannerTop}
          {...passed}
          onView={() => {
            live.dismissOvertake();
            router.navigate("/(tabs)/leaderboard");
          }}
        />
      ) : null}

      <View style={[styles.controls, { bottom: sheetHeight + CONTROLS_GAP }]}>
        <View style={styles.zoom}>
          <Pressable accessibilityLabel="Zoom in" style={styles.zoomHalf} onPress={() => mapRef.current?.zoomBy(1)}>
            <Icon name="plus" size={22} color={colors.ink.primary} />
          </Pressable>
          <View style={styles.zoomRule} />
          <Pressable accessibilityLabel="Zoom out" style={styles.zoomHalf} onPress={() => mapRef.current?.zoomBy(-1)}>
            <Icon name="minus" size={22} color={colors.ink.primary} />
          </Pressable>
        </View>
        <RaisedRoundButton icon="crosshair" size={44} accessibilityLabel="Centre on me" onPress={centreOnMe} />
      </View>

      <BottomSheet style={styles.hintSheet} onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}>
        {pendingText ? (
          <Text variant="caption" color={colors.ink.secondary} style={{ textAlign: "center", marginBottom: 12 }}>
            {pendingText}
          </Text>
        ) : null}
        {needsRoutes || suggest.message ? (
          <View style={styles.suggest}>
            {needsRoutes ? (
              <Button
                label={suggest.busy ? "Planning routes..." : "Suggest routes"}
                variant="small"
                disabled={suggest.busy}
                onPress={() => void suggest.run()}
              />
            ) : null}
            {suggest.message ? (
              <Text
                variant="caption"
                color={colors.ink.secondary}
                accessibilityRole="alert"
                style={{ textAlign: "center" }}
              >
                {suggest.message}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.hintRow}>
          <View style={styles.hintIcon}>
            <View style={styles.hintDot} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Tap a house to mark a lead</Text>
            <Text variant="label" color={colors.ink.secondary}>
              Solid: walked. Dashed: still to go.
            </Text>
          </View>
        </View>
      </BottomSheet>

      {leadOpen ? <LeadSheet onClose={() => setLeadOpen(false)} onSave={() => setLeadOpen(false)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bg.card,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
  },
  topRow: { flexDirection: "row", alignItems: "center" },
  bars: { flexDirection: "row", gap: 8, marginTop: 8 },
  controls: { position: "absolute", right: 16, gap: 12, alignItems: "center" },
  zoom: {
    width: 44,
    height: 88,
    borderRadius: pill(44),
    backgroundColor: colors.bg.card,
    overflow: "hidden",
    ...shadows.raised,
  },
  zoomHalf: { flex: 1, alignItems: "center", justifyContent: "center" },
  zoomRule: { height: 1, backgroundColor: colors.border.soft, marginHorizontal: 10 },
  hintSheet: { paddingHorizontal: 16 },
  suggest: { gap: 8, marginBottom: 12, alignItems: "center" },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  hintIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bg.page,
    alignItems: "center",
    justifyContent: "center",
  },
  hintDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.brand },
});
