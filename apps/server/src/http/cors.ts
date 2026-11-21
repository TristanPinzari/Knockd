import { env } from "../env";

/** "*" allows any origin (dev); otherwise a comma-separated allow-list for the web app. */
export const corsOrigin: string | string[] =
  env.CORS_ORIGINS === "*" ? "*" : env.CORS_ORIGINS.split(",").map((o) => o.trim());
