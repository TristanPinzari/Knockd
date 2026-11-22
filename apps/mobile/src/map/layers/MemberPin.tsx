import { Marker } from "@maplibre/maplibre-react-native";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme";
import { COLOURS } from "../constants";
import type { MapMember } from "../types";

const SIZE = 34;

/** Teardrop pin: crew-coloured, white ring, initials (or "You" on my own pin), soft shadow (y3 blur6 .28). */
function MemberPinBase({ member }: { member: MapMember }) {
  return (
    <Marker id={`pin-${member.memberId}`} lngLat={[member.lng, member.lat]} anchor="bottom">
      <View style={styles.wrap} accessibilityLabel={member.isMe ? "Your location" : `${member.name} location`}>
        <View style={[styles.drop, { backgroundColor: member.colour }]} />
        <Text style={styles.initials} allowFontScaling={false}>
          {member.isMe ? "You" : member.initials}
        </Text>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE + 8, height: SIZE + 14, alignItems: "center", justifyContent: "flex-start", paddingTop: 4 },
  // Rotated square with three round corners = teardrop pointing down.
  drop: {
    position: "absolute",
    top: 4,
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderBottomRightRadius: 2,
    borderWidth: 2.5,
    borderColor: COLOURS.white,
    transform: [{ rotate: "45deg" }, { translateY: 0 }],
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 5,
  },
  initials: {
    marginTop: SIZE / 2 - 8,
    color: COLOURS.white,
    fontSize: 12,
    fontWeight: "500",
    fontFamily: "Figtree_500Medium",
  },
});

export const MemberPin = memo(MemberPinBase, (a, b) => {
  const x = a.member;
  const y = b.member;
  return x.lng === y.lng && x.lat === y.lat && x.colour === y.colour && x.initials === y.initials && x.isMe === y.isMe;
});
