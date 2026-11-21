import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

export const pg = postgres(env.DATABASE_URL, { max: 10, onnotice: () => {} });
export const db = drizzle(pg, { schema });
export type Db = typeof db;
