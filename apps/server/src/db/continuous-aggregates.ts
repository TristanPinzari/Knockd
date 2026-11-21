/**
 * Applies src/db/continuous-aggregates.sql one statement at a time, outside any transaction
 * (TimescaleDB requires that for continuous aggregates). Run by `pnpm db:migrate`.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import postgres from "postgres";

if (existsSync(".env")) process.loadEnvFile(".env");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const file = await readFile(new URL("./continuous-aggregates.sql", import.meta.url), "utf8");
  const statements = file
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);

  for (const statement of statements) await sql.unsafe(statement).simple();
  console.log(`✓ Continuous aggregates up to date (${statements.length} statements)`);
} finally {
  await sql.end();
}
