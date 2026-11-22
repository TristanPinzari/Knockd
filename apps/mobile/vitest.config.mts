import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/location/**/*.test.ts", "src/realtime/**/*.test.ts", "src/trails/**/*.test.ts"],
  },
});
