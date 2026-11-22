const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Expo Go has no MapLibre native code. When KNOCKD_EXPO_GO=1 (`pnpm start:go`), resolve the
// package to a placeholder so the rest of the app can be previewed in Expo Go.
if (process.env.KNOCKD_EXPO_GO === "1") {
  const MAPLIBRE = "@maplibre/maplibre-react-native";
  const stubPath = path.resolve(__dirname, "expo-go/maplibre-stub.tsx");
  const upstreamResolve = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === MAPLIBRE) return { type: "sourceFile", filePath: stubPath };
    return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
  };
}

module.exports = config;
