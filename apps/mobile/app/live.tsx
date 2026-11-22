import { Redirect } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Vibration, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Grade, Lead } from "@knockd/shared";
import { useMyLocation } from "@/location";
import { BYRON, type KnockdMapHandle } from "@/map";
import { logger } from "@/realtime/logger";
import { useCrewStore, useLeadsStore } from "@/realtime";
import { sessionActions, useActiveSession } from "@/session";
import { LocationNoticeBanner } from "@/session/LocationNoticeBanner";
import { SessionSettingsCard } from "@/session/SessionSettingsCard";
import { pendingLabel, useLiveStatus } from "@/session/useLiveStatus";
import { colors, pill, shadows } from "@/theme";
import {
  Avatar,
  BottomSheet,
  HouseSheet,
  Icon,
  LeadAlertBanner,
  OfflinePill,
  RaisedRoundButton,
  Screen,
  Text,
} from "@/ui";
import { LiveMap, useLiveMapData } from "@/ui/liveMap";
import { usePlanEditor } from "@/plan/planEditor";
import { usePlanning, type NoteDraft } from "@/plan/usePlanning";
import { DrawOverlay, NoteSheet, PlanPanel } from "@/ui/plan";

/** Tools that draw with one finger (the map then doesn't move). */
const DRAWING_TOOLS = new Set(["route", "freehand", "eraser"]);

/** How long a teammate's lead alert stays up. */
const LEAD_ALERT_MS = 5000;
const CENTRE_ZOOM = 17;
/** Top bar height before it has been measured (safe area aside). */
const TOP_BAR_ESTIMATE = 76;
const BANNER_GAP = 8;

/** This session's lead on a house (house IDs are numbers in the API, strings on the map). */
function leadOnHouse(leads: Readonly<Record<string, Lead>>, houseId: string | null): Lead | null {
  if (houseId === null) return null;
  return Object.values(leads).find((l) => String(l.houseId) === houseId) ?? null;
}

/** Shows a teammate's new lead for a few seconds, with a short vibration. */
function useLeadAlert() {
  const alert = useLeadsStore((s) => s.alert);
  const dismiss = useLeadsStore((s) => s.dismissAlert);
  useEffect(() => {
    if (!alert) return undefined;
    Vibration.vibrate();
    const timer = setTimeout(dismiss, LEAD_ALERT_MS);
    return () => clearTimeout(timer);
  }, [alert, dismiss]);
  return alert;
}

/**
 * Live map (MOBILE.md screen 6): everyone's dots and trails, houses and leads, and lead alerts.
 * Long-press a house to mark a lead.
 */
export default function LiveMapScreen() {
  const insets = useSafeAreaInsets();
  const active = useActiveSession((s) => s.active);
  const { data, mapKey } = useLiveMapData();
  const crew = useCrewStore((s) => s.members);
  const leads = useLeadsStore((s) => s.leads);
  const myId = active?.memberId ?? null;
  const live = useLiveStatus();
  const alert = useLeadAlert();
  const { lngLat } = useMyLocation();
  const mapRef = useRef<KnockdMapHandle>(null);
  const [houseId, setHouseId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** Measured height of the top bar (it grows when the location notice shows). */
  const [barHeight, setBarHeight] = useState(0);
  // Planning mode (MOBILE.md screen 7): tools on the live map, shared live with the crew.
  const planning = usePlanEditor((s) => s.planning);
  const tool = usePlanEditor((s) => s.tool);
  const canUndo = usePlanEditor((s) => s.undoStack.length > 0);
  const canRedo = usePlanEditor((s) => s.redoStack.length > 0);
  const planMessage = usePlanEditor((s) => s.message);
  const [panelHeight, setPanelHeight] = useState(0);
  const [noteDraft, setNoteDraft] = useState<NoteDraft | null>(null);
  const planningTools = usePlanning(mapRef, myId, setNoteDraft);

  const lead = useMemo(() => leadOnHouse(leads, houseId), [leads, houseId]);
  const markedBy = lead && lead.memberId !== myId ? (crew[lead.memberId]?.name ?? "a teammate") : null;
  const members = Object.values(crew);
  const me = myId ? crew[myId] : undefined;
  // Me first, then everyone else, so the first face is always mine.
  const faces = me ? [me, ...members.filter((m) => m.id !== myId)] : members;

  if (!active) return <Redirect href="/" />;

  const run = (what: string, action: Promise<unknown>) =>
    void action.catch((error: unknown) => {
      logger.warn(`live: ${what} failed`, error);
      setMessage(`Couldn't ${what}. It'll retry when you're back online.`);
    });

  const onGrade = (grade: Grade) => {
    if (houseId === null) return;
    if (lead) run("change the lead", sessionActions.editLead(lead.clientId, { grade }));
    else run("save the lead", sessionActions.markLead({ houseId: Number(houseId), grade }));
  };

  const centreOnMe = () => {
    const [lng, lat] = lngLat ?? BYRON;
    mapRef.current?.recenter(lng, lat, CENTRE_ZOOM);
  };

  const pending = pendingLabel(live.pending);
  const toast = planMessage ?? message ?? pending;
  // Banners sit just under the top bar, whatever its height.
  const top = (barHeight || insets.top + TOP_BAR_ESTIMATE) + BANNER_GAP;
  // Buttons and the toast sit above the planning panel while it's open.
  const bottomGap = planning ? panelHeight + 12 : insets.bottom + 24;

  return (
    <Screen>
      <LiveMap
        ref={mapRef}
        data={data}
        mapKey={mapKey}
        crewOn
        onHouseLongPress={(id) => {
          setMessage(null);
          setHouseId(id);
        }}
        planning={planning}
        onPlanTap={planningTools.onPlanTap}
      />
      {planning && DRAWING_TOOLS.has(tool) ? (
        <DrawOverlay
          colour={tool === "eraser" ? colors.ink.secondary : planningTools.inkColour}
          dashed={tool === "route"}
          eraser={tool === "eraser"}
          onStroke={planningTools.onStroke}
        />
      ) : null}

      <View
        style={[styles.topBar, { paddingTop: insets.top + 8 }]}
        onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Session menu"
            onPress={() => setMenuOpen(true)}
            hitSlop={10}
          >
            <Icon name="menu" size={22} color={colors.ink.primary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Session {active.joinCode}</Text>
            <View style={styles.youRow}>
              {me ? <View style={[styles.youDot, { backgroundColor: me.colour }]} /> : null}
              <Text variant="caption" color={colors.ink.secondary} numberOfLines={1} style={{ flexShrink: 1 }}>
                {me ? `You're ${me.name} · ` : ""}
                {members.length} in the crew
              </Text>
            </View>
            <Text variant="caption" color={colors.ink.muted} numberOfLines={1}>
              {planning ? "Planning · everyone sees changes live" : "Long-press a house to mark a lead"}
            </Text>
          </View>
          <View style={styles.faces}>
            {faces.slice(0, 4).map((m) => (
              <View key={m.id} style={m.id === myId ? styles.myFace : undefined}>
                <Avatar initials={m.initials} colour={m.colour} size={26} />
              </View>
            ))}
          </View>
        </View>
        <LocationNoticeBanner style={styles.notice} />
      </View>

      {live.offline ? <OfflinePill top={top} /> : null}
      {alert ? (
        <LeadAlertBanner
          top={top}
          title={`${alert.memberName} just got ${alert.lead.grade === "A" ? "an" : "a"} ${alert.lead.grade} lead`}
          subtitle="It's on the map now"
        />
      ) : null}

      <View style={[styles.controls, { bottom: bottomGap }]}>
        {planning ? null : (
          <RaisedRoundButton
            icon="edit-3"
            size={44}
            accessibilityLabel="Plan with the crew"
            onPress={() => {
              setHouseId(null);
              usePlanEditor.getState().setPlanning(true);
            }}
          />
        )}
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

      {toast ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={() => {
            setMessage(null);
            usePlanEditor.getState().setMessage(null);
          }}
          style={[styles.toast, { bottom: bottomGap }]}
        >
          <Text variant="caption" color={colors.ink.secondary}>
            {toast}
          </Text>
        </Pressable>
      ) : null}

      {planning ? (
        <PlanPanel
          tool={tool}
          ink={planningTools.ink}
          memberInks={planningTools.memberInks}
          utilityInks={planningTools.utilityInks}
          canUndo={canUndo}
          canRedo={canRedo}
          onTool={(t) => usePlanEditor.getState().setTool(t)}
          onInk={(ink) => usePlanEditor.getState().setInk(ink)}
          onUndo={() => myId && void usePlanEditor.getState().undo(myId)}
          onRedo={() => myId && void usePlanEditor.getState().redo(myId)}
          onClearMine={planningTools.clearMine}
          onDone={() => usePlanEditor.getState().setPlanning(false)}
          onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
        />
      ) : null}

      {noteDraft ? (
        <NoteSheet
          initialText={noteDraft.text}
          editing={noteDraft.id !== null}
          colour={planningTools.inkColour}
          onSave={(text) => {
            planningTools.saveNote(noteDraft, text);
            setNoteDraft(null);
          }}
          onDelete={() => {
            if (noteDraft.id) planningTools.removeNote(noteDraft.id);
            setNoteDraft(null);
          }}
          onClose={() => setNoteDraft(null)}
        />
      ) : null}

      {houseId !== null ? (
        <HouseSheet
          key={houseId}
          lead={lead}
          markedBy={markedBy}
          onGrade={onGrade}
          onUndo={() => lead && run("undo the lead", sessionActions.undoLead(lead.clientId))}
          onSaveNote={(note) =>
            lead && run("save the note", sessionActions.editLead(lead.clientId, { note: note || null }))
          }
          onClose={() => setHouseId(null)}
        />
      ) : null}

      {menuOpen ? (
        <>
          <Pressable style={styles.scrim} onPress={() => setMenuOpen(false)} accessibilityLabel="Close menu" />
          <BottomSheet>
            <ScrollView>
              <SessionSettingsCard />
            </ScrollView>
          </BottomSheet>
        </>
      ) : null}
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
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.soft,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  notice: { marginTop: 10, alignSelf: "flex-start" },
  faces: { flexDirection: "row", gap: 4, alignItems: "center" },
  myFace: { borderRadius: pill(32), borderWidth: 2, borderColor: colors.ink.primary, padding: 1 },
  youRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  youDot: { width: 10, height: 10, borderRadius: 5 },
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
  toast: {
    position: "absolute",
    left: 16,
    right: 76,
    backgroundColor: colors.bg.card,
    borderRadius: pill(36),
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...shadows.raised,
  },
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.scrim },
});
