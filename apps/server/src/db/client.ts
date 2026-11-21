import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export const pg = postgres(url, { max: 10 });
export const db = drizzle(pg, { schema });
export type Db = typeof db;
