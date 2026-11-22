import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * In dev, Vite adds its live-reload client to every JavaScript file it serves, including
 * MapLibre's worker, so each map worker would open its own live-reload connection. Serve the
 * worker file as-is instead. (Production builds aren't affected.)
 */
function plainMapLibreWorker(): Plugin {
  return {
    name: "plain-maplibre-worker",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        // Only the worker itself (no query). `…/maplibre-gl-worker.mjs?url` is the page asking
        // Vite for the worker's address, which must stay Vite's.
        const path = req.url ?? "";
        if (path.includes("?") || !path.startsWith("/@fs/") || !path.endsWith("/maplibre-gl-worker.mjs")) return next();
        try {
          const file = fileURLToPath(`file:///${decodeURIComponent(path.slice("/@fs/".length)).replace(/^\/+/, "")}`);
          res.setHeader("Content-Type", "text/javascript");
          res.setHeader("Cache-Control", "no-store"); // never reuse an older copy with the live-reload client in it
          res.end(await readFile(file));
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), plainMapLibreWorker()],
  server: { port: 5173 },
  // MapLibre alone is ~1 MB minified; the default 500 kB warning would always fire.
  build: { chunkSizeWarningLimit: 2000 },
});
