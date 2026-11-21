/**
 * Opens the Suggest viewer and the ideal-plan page in the default browser.
 * Usage (from the repo root): pnpm open:suggest
 * Rebuild them first if Suggest changed: pnpm rebuild:suggest-viewer
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const docs = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../docs");
const pages = ["suggest-viewer.html", "suggest-ideal.html"].map((f) => resolve(docs, f));

const missing = pages.filter((p) => !existsSync(p));
if (missing.length) {
  console.error(`Not built yet: ${missing.join(", ")}\nRun: pnpm rebuild:suggest-viewer`);
  process.exit(1);
}

for (const page of pages) {
  const [cmd, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", page]]
      : process.platform === "darwin"
        ? ["open", [page]]
        : ["xdg-open", [page]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  console.log(`Opened ${page}`);
}
