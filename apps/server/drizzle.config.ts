import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// Load apps/server/.env if present (Node's built-in loader). In production the env comes from Coolify.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  // PostGIS creates its own tables (spatial_ref_sys etc.); keep drizzle-kit away from them.
  extensionsFilters: ["postgis"],
});
