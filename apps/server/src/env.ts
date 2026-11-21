/**
 * Environment variables, checked once at startup. Import this before anything that reads env.
 * Locally they come from apps/server/.env; in production from Coolify.
 */
import { existsSync } from "node:fs";
import { z } from "zod";

if (existsSync(".env")) process.loadEnvFile(".env");

const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().url(),
  /** Signs session tokens. At least 32 characters. */
  GUEST_TOKEN_SECRET: z.string().min(32, "GUEST_TOKEN_SECRET must be at least 32 characters"),
  /** Comma-separated origins allowed by CORS (the web app). Mobile apps don't need CORS. */
  CORS_ORIGINS: z.string().default("*"),
  /** Folder with london.pmtiles, served at /tiles. */
  TILES_DIR: z.string().default("data/tiles"),
  /** e.g. dev-abc123.us.auth0.com (with or without https://). Accounts are disabled if unset. */
  AUTH0_DOMAIN: z
    .string()
    .transform((d) => d.replace(/^https?:\/\//, "").replace(/\/+$/, ""))
    .optional(),
  AUTH0_AUDIENCE: z.string().optional(),
  /** Team invite links are `${INVITE_BASE_URL}/${token}`. */
  INVITE_BASE_URL: z.string().url().default("https://knockd.rodeo/invite"),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:");
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
