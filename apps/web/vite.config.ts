import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // MapLibre alone is ~1 MB minified; the default 500 kB warning would always fire.
  build: { chunkSizeWarningLimit: 2000 },
});
