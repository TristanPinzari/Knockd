/**
 * Expo Go stand-in for `@maplibre/maplibre-react-native`.
 *
 * MapLibre is native code that Expo Go does not ship, so importing the real package there
 * crashes the whole app. metro.config.js swaps the package for this file ONLY when the bundle is
 * built with KNOCKD_EXPO_GO=1 (see `pnpm start:go`). Dev builds, tests and typecheck use the real
 * package. The map area renders as a labelled placeholder; every other screen works as normal.
 */
import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

const PLACEHOLDER_BG = "#E7ECE4";
const PLACEHOLDER_TEXT = "#5B6357";

/** Any method call on a ref resolves to nothing, so camera/map/offline calls are harmless. */
const noopApi = (): object => new Proxy({}, { get: () => () => Promise.resolve(undefined) });

interface MapStubProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export const Map = forwardRef<object, MapStubProps>(function MapStub({ style }, ref) {
  useImperativeHandle(ref, noopApi, []);
  return (
    <View style={[styles.placeholder, style]}>
      <Text style={styles.label}>Map preview needs the Knockd dev build</Text>
      <Text style={styles.hint}>{"Expo Go can't load MapLibre. Everything else works."}</Text>
    </View>
  );
});

export const Camera = forwardRef<object, object>(function CameraStub(_props, ref) {
  useImperativeHandle(ref, noopApi, []);
  return null;
});

const renderNothing = (): null => null;
export const GeoJSONSource = renderNothing;
export const Layer = renderNothing;
export const Marker = renderNothing;
export const OfflineManager = noopApi();

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PLACEHOLDER_BG,
    padding: 24,
  },
  label: { fontSize: 15, fontWeight: "600", color: PLACEHOLDER_TEXT, textAlign: "center" },
  hint: { marginTop: 6, fontSize: 13, color: PLACEHOLDER_TEXT, textAlign: "center" },
});
