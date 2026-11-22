import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { chatThread, crew, quickReplies, shareActions, type ChatItem } from "@/mock";
import { colors, FONT_REGULAR, pill, radii } from "@/theme";
import { Avatar, BottomSheet, Chip, FlatHeader, Icon, RaisedRoundButton, Screen, Switch, Text, Tile } from "@/ui";

export default function ChatScreen() {
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLive, setShareLive] = useState(false);
  const [draft, setDraft] = useState("");

  return (
    <Screen>
      <FlatHeader
        title="Crew chat"
        titleVariant="heading"
        showBack={false}
        subtitle="4 crew, live"
        right={
          <View style={{ flexDirection: "row" }}>
            {crew.map((member, index) => (
              <View
                key={member.id}
                style={{ marginLeft: index ? -6 : 0, borderWidth: 2, borderColor: colors.bg.card, borderRadius: 16 }}
              >
                <Avatar initials={member.initials} colour={member.colour} size={28} />
              </View>
            ))}
          </View>
        }
      />
      <ScrollView contentContainerStyle={styles.thread}>
        {chatThread.map((item) => (
          <ChatRow key={item.id} item={item} />
        ))}
      </ScrollView>
      <View style={styles.quick}>
        {quickReplies.map((reply) => (
          <Chip key={reply} label={reply} onPress={() => setDraft(reply)} />
        ))}
      </View>
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message your crew"
          placeholderTextColor={colors.ink.muted}
          style={styles.input}
        />
        <RaisedRoundButton
          icon="map-pin"
          size={44}
          accessibilityLabel="Share with crew"
          onPress={() => setShareOpen(true)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={styles.send}
          onPress={() => setDraft("")}
        >
          <Icon name="arrow-up" size={22} color={colors.ink.onBrand} />
        </Pressable>
      </View>

      {shareOpen ? (
        <>
          <Pressable style={styles.scrim} onPress={() => setShareOpen(false)} accessibilityLabel="Dismiss" />
          <BottomSheet style={{ paddingHorizontal: 16 }}>
            <Text variant="title" style={{ fontSize: 20, marginBottom: 12 }}>
              Share with your crew
            </Text>
            {shareActions.map((action) => (
              <ShareRow key={action.title} icon={action.icon} title={action.title} detail={action.detail} />
            ))}
            <ShareRow
              icon="navigation"
              title="Share my live location for 15 min"
              detail="Crew sees your dot until it ends"
              trailing={<Switch value={shareLive} onValueChange={setShareLive} />}
            />
            <Pressable onPress={() => setShareOpen(false)} style={{ alignItems: "center", paddingVertical: 14 }}>
              <Text variant="body" color={colors.ink.secondary}>
                Cancel
              </Text>
            </Pressable>
          </BottomSheet>
        </>
      ) : null}
    </Screen>
  );
}

function ShareRow({
  icon,
  title,
  detail,
  trailing,
}: {
  icon: React.ComponentProps<typeof Icon>["name"];
  title: string;
  detail: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.shareRow}>
      <View style={styles.shareIcon}>
        <Icon name={icon} size={22} color={colors.ink.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="label" color={colors.ink.secondary}>
          {detail}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

function ChatRow({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case "time":
      return (
        <View style={styles.centre}>
          <View style={styles.timePill}>
            <Text variant="label" color={colors.ink.secondary}>
              {item.text}
            </Text>
          </View>
        </View>
      );
    case "event":
      return (
        <View style={styles.centre}>
          <View style={styles.eventPill}>
            <View style={styles.eventDot} />
            <Text variant="label" color={colors.ink.secondary}>
              {item.text}
            </Text>
          </View>
        </View>
      );
    case "message":
      if (item.mine) {
        return (
          <View style={[styles.bubble, { alignSelf: "flex-end", backgroundColor: colors.crew.blue }]}>
            <Text variant="body" color={colors.ink.onBrand} style={{ fontSize: 15 }}>
              {item.text}
            </Text>
          </View>
        );
      }
      return (
        <Incoming name={item.from} initials={item.initials} colour={item.colour}>
          <View style={styles.bubble}>
            <Text variant="body" style={{ fontSize: 15 }}>
              {item.text}
            </Text>
          </View>
        </Incoming>
      );
    case "pin":
      return (
        <Incoming name={item.from} initials={item.initials} colour={item.colour}>
          <Tile radius={radii.card} style={styles.pinCard}>
            <Text variant="body" style={{ fontSize: 15 }}>
              {item.label}
            </Text>
            <View style={styles.pinMap}>
              <Avatar initials={item.initials} colour={item.colour} size={32} />
            </View>
            <Text variant="label" color={colors.ink.secondary}>
              {item.distance}
            </Text>
          </Tile>
        </Incoming>
      );
    case "typing":
      return (
        <View style={styles.incomingRow}>
          <Avatar initials={item.initials} colour={item.colour} size={28} />
          <View style={[styles.bubble, { flexDirection: "row", gap: 4, paddingVertical: 12 }]}>
            {[0, 1, 2].map((dot) => (
              <View key={dot} style={styles.typingDot} />
            ))}
          </View>
          <Text variant="label" color={colors.ink.secondary}>
            {item.from} is typing
          </Text>
        </View>
      );
  }
}

function Incoming({
  name,
  initials,
  colour,
  children,
}: {
  name: string;
  initials: string;
  colour: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text variant="label" color={colors.ink.secondary} style={{ marginLeft: 36 }}>
        {name}
      </Text>
      <View style={[styles.incomingRow, { alignItems: "flex-end" }]}>
        <Avatar initials={initials} colour={colour} size={28} />
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  thread: { padding: 16, gap: 14 },
  centre: { alignItems: "center" },
  timePill: {
    height: 24,
    borderRadius: pill(24),
    backgroundColor: colors.track,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  eventPill: {
    height: 28,
    borderRadius: pill(28),
    backgroundColor: colors.track,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eventDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  incomingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bubble: {
    backgroundColor: colors.bg.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  pinCard: { width: 214, padding: 6, gap: 6, borderRadius: radii.card },
  pinMap: {
    height: 100,
    borderRadius: 12,
    backgroundColor: colors.bg.page,
    alignItems: "center",
    justifyContent: "center",
  },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.ink.muted },
  quick: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.bg.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  input: {
    flex: 1,
    height: 44,
    borderRadius: pill(44),
    backgroundColor: colors.bg.page,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingHorizontal: 16,
    fontFamily: FONT_REGULAR,
    fontSize: 14,
    color: colors.ink.primary,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: colors.scrim },
  shareRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 8 },
  shareIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.bg.page,
    borderWidth: 1,
    borderColor: colors.border.soft,
    alignItems: "center",
    justifyContent: "center",
  },
});
