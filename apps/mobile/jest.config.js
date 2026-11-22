// UI, mock and map tests run on jest-expo. Location, realtime and trails tests run on vitest (see vitest.config.ts).
module.exports = {
  preset: "jest-expo",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/src/(location|realtime|trails)/"],
  collectCoverageFrom: ["src/theme/**/*.ts", "src/mock/**/*.ts", "src/ui/format.ts"],
};
