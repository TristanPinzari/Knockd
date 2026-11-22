import type { ConfigContext, ExpoConfig } from "expo/config";

const BUNDLE_ID = "rodeo.knockd.app";
const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? "dev-38gdunm50atj1prl.us.auth0.com";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Knockd",
  slug: "knockd",
  scheme: "knockd",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: BUNDLE_ID,
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ["location"],
      NSLocationWhenInUseUsageDescription: "Knockd shows your position to your crew while a session is live.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "Knockd keeps tracking your path while the screen is off during a session.",
    },
  },
  android: {
    package: BUNDLE_ID,
    permissions: [
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
    ],
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-sqlite",
    "@maplibre/maplibre-react-native",
    [
      "expo-location",
      {
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    ["react-native-auth0", { domain: AUTH0_DOMAIN }],
  ],
  experiments: { typedRoutes: true },
});
